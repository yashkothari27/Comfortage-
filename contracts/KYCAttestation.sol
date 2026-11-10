// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title KYCAttestation
 * @notice Norion Bank × Reltime — On-chain KYC, UBO, PEP and CCD2 attestations.
 *         Only SHA-256 hashes and IPFS CIDs are stored. NO personal data on-chain.
 * @dev    Deployed on Reltime Mainnet (Chain ID: 32323, PoA, zero gas fees).
 *
 *  Roles:
 *   DEFAULT_ADMIN_ROLE  — admin: grants/revokes all roles
 *   COMPLIANCE_ROLE     — bank compliance officer: store/update any attestation
 *   CLIENT_ROLE         — corporate client: store UBO_DECLARATION, CCD2_CONSENT
 *   REGULATOR_ROLE      — FI supervisor: validate any attestation (audit trail)
 *   AUDITOR_ROLE        — external auditor: read-only summary
 */
contract KYCAttestation is AccessControl, Pausable, ReentrancyGuard {

    // ──────────────────── Roles ────────────────────────────────────
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");
    bytes32 public constant CLIENT_ROLE     = keccak256("CLIENT_ROLE");
    bytes32 public constant REGULATOR_ROLE  = keccak256("REGULATOR_ROLE");
    bytes32 public constant AUDITOR_ROLE    = keccak256("AUDITOR_ROLE");

    // ──────────────────── Record Types ─────────────────────────────
    enum AttestationType {
        UBO_DECLARATION,    // Beneficial owner self-declaration (customer-signed)
        PEP_CHECK,          // Politically exposed person screening result
        CCD2_ATTESTATION,   // Consumer credit directive dual-signature record
        CREDIT_DECISION,    // AI-assisted credit decision (AI Act Art.6)
        DORA_INCIDENT       // DORA operational resilience incident record
    }

    // ──────────────────── Structs ───────────────────────────────────
    struct Attestation {
        bytes32         dataHash;       // SHA-256 of the off-chain payload
        string          ipfsCID;        // Pinata/IPFS CID of metadata JSON
        AttestationType attestationType;
        address         submitter;
        uint256         timestamp;
        bool            validated;
        address         validator;
        uint256         validatedAt;
        bool            exists;
    }

    // ──────────────────── State ─────────────────────────────────────
    mapping(string => Attestation)   private attestations;
    mapping(string => bytes32[])     private hashHistory;   // all versions
    mapping(string => string[])      private cidHistory;    // all IPFS CIDs
    mapping(AttestationType => uint256) public countByType;
    string[] private attestationIds;
    uint256  public totalAttestations;

    // ──────────────────── Events ────────────────────────────────────
    event AttestationStored(
        string   indexed attestationId,
        bytes32          dataHash,
        string           ipfsCID,
        AttestationType  attestationType,
        address  indexed submitter,
        uint256          timestamp
    );

    event AttestationUpdated(
        string   indexed attestationId,
        bytes32          oldHash,
        bytes32          newHash,
        string           newIpfsCID,
        address  indexed submitter,
        uint256          timestamp
    );

    event AttestationValidated(
        string   indexed attestationId,
        bytes32          dataHash,
        bool             isValid,
        address  indexed validator,
        uint256          timestamp
    );

    // ──────────────────── Errors ────────────────────────────────────
    error AlreadyExists(string attestationId);
    error NotFound(string attestationId);
    error InvalidHash();
    error InvalidId();
    error UnauthorizedType(AttestationType t, address caller);

    // ──────────────────── Constructor ───────────────────────────────
    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(COMPLIANCE_ROLE,    admin);
        _grantRole(CLIENT_ROLE,        admin);
        _grantRole(REGULATOR_ROLE,     admin);
        _grantRole(AUDITOR_ROLE,       admin);
    }

    // ──────────────────── Write ─────────────────────────────────────

    /**
     * @notice Store a new KYC attestation on-chain.
     * @param attestationId  Unique ID (e.g. "NB-UBO-2026-001")
     * @param dataHash       SHA-256 of the off-chain payload (hex bytes32)
     * @param ipfsCID        Pinata IPFS CID of the metadata JSON
     * @param attestationType Type of attestation
     */
    function storeAttestation(
        string          calldata attestationId,
        bytes32                  dataHash,
        string          calldata ipfsCID,
        AttestationType          attestationType
    )
        external
        whenNotPaused
        nonReentrant
    {
        if (bytes(attestationId).length == 0) revert InvalidId();
        if (dataHash == bytes32(0))           revert InvalidHash();
        if (attestations[attestationId].exists) revert AlreadyExists(attestationId);

        _checkSubmitPermission(attestationType);

        attestations[attestationId] = Attestation({
            dataHash:        dataHash,
            ipfsCID:         ipfsCID,
            attestationType: attestationType,
            submitter:       msg.sender,
            timestamp:       block.timestamp,
            validated:       false,
            validator:       address(0),
            validatedAt:     0,
            exists:          true
        });

        hashHistory[attestationId].push(dataHash);
        cidHistory[attestationId].push(ipfsCID);
        attestationIds.push(attestationId);
        countByType[attestationType]++;
        totalAttestations++;

        emit AttestationStored(
            attestationId, dataHash, ipfsCID,
            attestationType, msg.sender, block.timestamp
        );
    }

    /**
     * @notice Update an existing attestation (e.g., amended UBO after ownership change).
     *         Both old and new hashes are preserved in history — tamper-evident.
     */
    function updateAttestation(
        string  calldata attestationId,
        bytes32          newHash,
        string  calldata newIpfsCID
    )
        external
        whenNotPaused
        nonReentrant
    {
        if (!attestations[attestationId].exists) revert NotFound(attestationId);
        if (newHash == bytes32(0))               revert InvalidHash();

        _checkSubmitPermission(attestations[attestationId].attestationType);

        bytes32 oldHash = attestations[attestationId].dataHash;
        attestations[attestationId].dataHash   = newHash;
        attestations[attestationId].ipfsCID    = newIpfsCID;
        attestations[attestationId].submitter  = msg.sender;
        attestations[attestationId].timestamp  = block.timestamp;
        attestations[attestationId].validated  = false; // re-validation required

        hashHistory[attestationId].push(newHash);
        cidHistory[attestationId].push(newIpfsCID);

        emit AttestationUpdated(
            attestationId, oldHash, newHash, newIpfsCID, msg.sender, block.timestamp
        );
    }

    /**
     * @notice Validate an attestation hash — FI Regulator or Compliance use.
     *         Emits on-chain audit event regardless of outcome.
     */
    function validateAttestation(
        string  calldata attestationId,
        bytes32          hashToValidate
    )
        external
        onlyRole(REGULATOR_ROLE)
        returns (bool isValid)
    {
        if (!attestations[attestationId].exists) revert NotFound(attestationId);

        isValid = (attestations[attestationId].dataHash == hashToValidate);

        if (isValid) {
            attestations[attestationId].validated   = true;
            attestations[attestationId].validator   = msg.sender;
            attestations[attestationId].validatedAt = block.timestamp;
        }

        emit AttestationValidated(
            attestationId, hashToValidate, isValid, msg.sender, block.timestamp
        );
    }

    // ──────────────────── Read ──────────────────────────────────────

    function getAttestation(string calldata attestationId)
        external view
        returns (
            bytes32         dataHash,
            string memory   ipfsCID,
            AttestationType attestationType,
            address         submitter,
            uint256         timestamp,
            bool            validated,
            address         validator,
            uint256         validatedAt
        )
    {
        if (!attestations[attestationId].exists) revert NotFound(attestationId);
        Attestation memory a = attestations[attestationId];
        return (
            a.dataHash, a.ipfsCID, a.attestationType,
            a.submitter, a.timestamp, a.validated, a.validator, a.validatedAt
        );
    }

    function getHashHistory(string calldata attestationId)
        external view returns (bytes32[] memory)
    {
        if (!attestations[attestationId].exists) revert NotFound(attestationId);
        return hashHistory[attestationId];
    }

    function getCIDHistory(string calldata attestationId)
        external view returns (string[] memory)
    {
        if (!attestations[attestationId].exists) revert NotFound(attestationId);
        return cidHistory[attestationId];
    }

    function attestationExists(string calldata attestationId)
        external view returns (bool)
    {
        return attestations[attestationId].exists;
    }

    function getAuditSummary()
        external view
        onlyRole(AUDITOR_ROLE)
        returns (
            uint256 uboDeclarations,
            uint256 pepChecks,
            uint256 ccd2Attestations,
            uint256 creditDecisions,
            uint256 doraIncidents,
            uint256 total
        )
    {
        return (
            countByType[AttestationType.UBO_DECLARATION],
            countByType[AttestationType.PEP_CHECK],
            countByType[AttestationType.CCD2_ATTESTATION],
            countByType[AttestationType.CREDIT_DECISION],
            countByType[AttestationType.DORA_INCIDENT],
            totalAttestations
        );
    }

    // ──────────────────── Admin ─────────────────────────────────────

    function pause()   external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    // ──────────────────── Internal ──────────────────────────────────

    /**
     * @dev CLIENT_ROLE may only submit UBO_DECLARATION and CCD2_ATTESTATION.
     *      COMPLIANCE_ROLE may submit any type.
     *      DEFAULT_ADMIN_ROLE may submit any type.
     */
    function _checkSubmitPermission(AttestationType t) internal view {
        if (hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) return;
        if (hasRole(COMPLIANCE_ROLE,    msg.sender)) return;

        if (hasRole(CLIENT_ROLE, msg.sender)) {
            if (t != AttestationType.UBO_DECLARATION && t != AttestationType.CCD2_ATTESTATION)
                revert UnauthorizedType(t, msg.sender);
            return;
        }

        revert UnauthorizedType(t, msg.sender);
    }
}
