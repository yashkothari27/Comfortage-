// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title DefenceCompliance
 * @notice NEWSROOM × Reltime — On-chain evidence anchoring for defence compliance.
 *         Covers STANAG 4586, CMMC 2.0, NIST SP 800-171, ITAR/EAR, and DO-178C.
 *         Only SHA-256 hashes and IPFS CIDs stored — no classified data on-chain.
 * @dev    Deployed on Reltime Mainnet (Chain ID: 32323, PoA, zero gas fees).
 *         Multi-partner design: 10 consortium nodes (THALES, INDRA, AIRBUS, etc.)
 *         each operate a Reltime node. Evidence is valid only when network agrees.
 *
 *  Roles:
 *   DEFAULT_ADMIN_ROLE  — platform admin
 *   SYSADMIN_ROLE       — NEWSROOM NOC: store any record type
 *   ISSO_ROLE           — security officer: store/update INCIDENT_EVIDENCE
 *   NATO_AUDITOR_ROLE   — auditor: validate records, read audit summary
 *   DEVELOPER_ROLE      — developer: store DO178C_BUILD, STANAG_TEST records
 */
contract DefenceCompliance is AccessControl, Pausable, ReentrancyGuard {

    // ──────────────────── Roles ────────────────────────────────────
    bytes32 public constant SYSADMIN_ROLE     = keccak256("SYSADMIN_ROLE");
    bytes32 public constant ISSO_ROLE         = keccak256("ISSO_ROLE");
    bytes32 public constant NATO_AUDITOR_ROLE = keccak256("NATO_AUDITOR_ROLE");
    bytes32 public constant DEVELOPER_ROLE    = keccak256("DEVELOPER_ROLE");

    // ──────────────────── Record Types ─────────────────────────────
    enum EvidenceType {
        STANAG_TEST,        // STANAG 4586/4671 interoperability test report
        CMMC_ATTESTATION,   // CMMC 2.0 Level 2 self-assessment or third-party result
        INCIDENT_EVIDENCE,  // Forensic evidence for a security incident (CMMC IR)
        ITAR_FILING,        // ITAR/EAR export control filing or TCP
        DO178C_BUILD        // DO-178C software build hash + DAL certification record
    }

    // ──────────────────── Classification Levels ────────────────────
    enum ClassLevel { UNCLASSIFIED, NATO_RESTRICTED }

    // ──────────────────── Structs ───────────────────────────────────
    struct EvidenceRecord {
        bytes32      dataHash;      // SHA-256 of the off-chain evidence payload
        string       ipfsCID;       // IPFS CID of metadata JSON (non-classified)
        EvidenceType evidenceType;
        ClassLevel   classification;
        string       referenceId;   // e.g. "NWS-SEC-2026-001", "STANAG-4586-LOI5"
        address      submitter;
        uint256      timestamp;
        bool         validated;
        address      validator;
        uint256      validatedAt;
        bool         exists;
    }

    // ──────────────────── State ─────────────────────────────────────
    mapping(string => EvidenceRecord) private records;
    mapping(string => bytes32[])      private hashHistory;
    mapping(string => string[])       private cidHistory;
    mapping(EvidenceType => uint256)  public  countByType;
    string[] private recordIds;
    uint256  public  totalRecords;

    // ──────────────────── Events ────────────────────────────────────
    event EvidenceStored(
        string   indexed recordId,
        bytes32          dataHash,
        string           ipfsCID,
        EvidenceType     evidenceType,
        ClassLevel       classification,
        string           referenceId,
        address  indexed submitter,
        uint256          timestamp
    );

    event EvidenceUpdated(
        string   indexed recordId,
        bytes32          oldHash,
        bytes32          newHash,
        string           newIpfsCID,
        address  indexed submitter,
        uint256          timestamp
    );

    event EvidenceValidated(
        string   indexed recordId,
        bytes32          dataHash,
        bool             isValid,
        address  indexed validator,
        uint256          timestamp
    );

    event IncidentEscalated(
        string   indexed recordId,
        string           referenceId,
        address  indexed isso,
        uint256          timestamp
    );

    // ──────────────────── Errors ────────────────────────────────────
    error AlreadyExists(string recordId);
    error NotFound(string recordId);
    error InvalidHash();
    error InvalidId();
    error UnauthorizedType(EvidenceType t, address caller);

    // ──────────────────── Constructor ───────────────────────────────
    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(SYSADMIN_ROLE,      admin);
        _grantRole(ISSO_ROLE,          admin);
        _grantRole(NATO_AUDITOR_ROLE,  admin);
        _grantRole(DEVELOPER_ROLE,     admin);
    }

    // ──────────────────── Write ─────────────────────────────────────

    /**
     * @notice Store a new compliance evidence record on-chain.
     * @param recordId       Unique ID (e.g. "NWS-CMMC-2026-Q2", "NWS-INC-2026-001")
     * @param dataHash       SHA-256 of the off-chain evidence payload
     * @param ipfsCID        Pinata IPFS CID of metadata JSON
     * @param evidenceType   Type of evidence record
     * @param classification UNCLASSIFIED or NATO_RESTRICTED
     * @param referenceId    Human-readable reference (STANAG article, incident ref, etc.)
     */
    function storeEvidence(
        string      calldata recordId,
        bytes32              dataHash,
        string      calldata ipfsCID,
        EvidenceType         evidenceType,
        ClassLevel           classification,
        string      calldata referenceId
    )
        external
        whenNotPaused
        nonReentrant
    {
        if (bytes(recordId).length == 0) revert InvalidId();
        if (dataHash == bytes32(0))      revert InvalidHash();
        if (records[recordId].exists)    revert AlreadyExists(recordId);

        _checkSubmitPermission(evidenceType);

        records[recordId] = EvidenceRecord({
            dataHash:       dataHash,
            ipfsCID:        ipfsCID,
            evidenceType:   evidenceType,
            classification: classification,
            referenceId:    referenceId,
            submitter:      msg.sender,
            timestamp:      block.timestamp,
            validated:      false,
            validator:      address(0),
            validatedAt:    0,
            exists:         true
        });

        hashHistory[recordId].push(dataHash);
        cidHistory[recordId].push(ipfsCID);
        recordIds.push(recordId);
        countByType[evidenceType]++;
        totalRecords++;

        emit EvidenceStored(
            recordId, dataHash, ipfsCID, evidenceType,
            classification, referenceId, msg.sender, block.timestamp
        );
    }

    /**
     * @notice Update evidence (e.g., supplementary forensic data added to incident).
     *         All previous versions preserved — non-repudiable history.
     */
    function updateEvidence(
        string  calldata recordId,
        bytes32          newHash,
        string  calldata newIpfsCID
    )
        external
        whenNotPaused
        nonReentrant
    {
        if (!records[recordId].exists) revert NotFound(recordId);
        if (newHash == bytes32(0))     revert InvalidHash();

        _checkSubmitPermission(records[recordId].evidenceType);

        bytes32 oldHash = records[recordId].dataHash;
        records[recordId].dataHash   = newHash;
        records[recordId].ipfsCID    = newIpfsCID;
        records[recordId].submitter  = msg.sender;
        records[recordId].timestamp  = block.timestamp;
        records[recordId].validated  = false;

        hashHistory[recordId].push(newHash);
        cidHistory[recordId].push(newIpfsCID);

        emit EvidenceUpdated(recordId, oldHash, newHash, newIpfsCID, msg.sender, block.timestamp);
    }

    /**
     * @notice Validate evidence — NATO Auditor use. Emits audit event regardless.
     */
    function validateEvidence(
        string  calldata recordId,
        bytes32          hashToValidate
    )
        external
        onlyRole(NATO_AUDITOR_ROLE)
        returns (bool isValid)
    {
        if (!records[recordId].exists) revert NotFound(recordId);

        isValid = (records[recordId].dataHash == hashToValidate);

        if (isValid) {
            records[recordId].validated   = true;
            records[recordId].validator   = msg.sender;
            records[recordId].validatedAt = block.timestamp;
        }

        emit EvidenceValidated(recordId, hashToValidate, isValid, msg.sender, block.timestamp);
    }

    /**
     * @notice Escalate a security incident — emits a dedicated event for NCIRC notification.
     * @dev    ISSO only. Does not modify the evidence record — pure audit signal.
     */
    function escalateIncident(string calldata recordId)
        external
        onlyRole(ISSO_ROLE)
    {
        if (!records[recordId].exists) revert NotFound(recordId);
        emit IncidentEscalated(
            recordId,
            records[recordId].referenceId,
            msg.sender,
            block.timestamp
        );
    }

    // ──────────────────── Read ──────────────────────────────────────

    function getEvidence(string calldata recordId)
        external view
        returns (
            bytes32      dataHash,
            string memory ipfsCID,
            EvidenceType evidenceType,
            ClassLevel   classification,
            string memory referenceId,
            address      submitter,
            uint256      timestamp,
            bool         validated
        )
    {
        if (!records[recordId].exists) revert NotFound(recordId);
        EvidenceRecord memory r = records[recordId];
        return (
            r.dataHash, r.ipfsCID, r.evidenceType, r.classification,
            r.referenceId, r.submitter, r.timestamp, r.validated
        );
    }

    function getHashHistory(string calldata recordId)
        external view returns (bytes32[] memory)
    {
        if (!records[recordId].exists) revert NotFound(recordId);
        return hashHistory[recordId];
    }

    function getCIDHistory(string calldata recordId)
        external view returns (string[] memory)
    {
        if (!records[recordId].exists) revert NotFound(recordId);
        return cidHistory[recordId];
    }

    function recordExists(string calldata recordId)
        external view returns (bool)
    {
        return records[recordId].exists;
    }

    function getAuditSummary()
        external view
        onlyRole(NATO_AUDITOR_ROLE)
        returns (
            uint256 stanagTests,
            uint256 cmmcAttestations,
            uint256 incidentRecords,
            uint256 itarFilings,
            uint256 do178cBuilds,
            uint256 total
        )
    {
        return (
            countByType[EvidenceType.STANAG_TEST],
            countByType[EvidenceType.CMMC_ATTESTATION],
            countByType[EvidenceType.INCIDENT_EVIDENCE],
            countByType[EvidenceType.ITAR_FILING],
            countByType[EvidenceType.DO178C_BUILD],
            totalRecords
        );
    }

    // ──────────────────── Admin ─────────────────────────────────────

    function pause()   external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    // ──────────────────── Internal ──────────────────────────────────

    /**
     * @dev Permission matrix:
     *   SYSADMIN_ROLE  → all types
     *   ISSO_ROLE      → INCIDENT_EVIDENCE only
     *   DEVELOPER_ROLE → DO178C_BUILD, STANAG_TEST
     *   DEFAULT_ADMIN_ROLE → all types
     */
    function _checkSubmitPermission(EvidenceType t) internal view {
        if (hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) return;
        if (hasRole(SYSADMIN_ROLE,      msg.sender)) return;

        if (hasRole(ISSO_ROLE, msg.sender)) {
            if (t != EvidenceType.INCIDENT_EVIDENCE)
                revert UnauthorizedType(t, msg.sender);
            return;
        }

        if (hasRole(DEVELOPER_ROLE, msg.sender)) {
            if (t != EvidenceType.DO178C_BUILD && t != EvidenceType.STANAG_TEST)
                revert UnauthorizedType(t, msg.sender);
            return;
        }

        revert UnauthorizedType(t, msg.sender);
    }
}
