// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title DataIntegrity
 * @notice COMFORTage T3.3 — Stores medical record hashes on the Reltime blockchain.
 *         Only cryptographic hashes are stored on-chain — NO personal data.
 * @dev    Deployed on Reltime Mainnet (Chain ID: 32323, PoA, zero gas fees).
 *
 *  Role hierarchy:
 *   DEFAULT_ADMIN_ROLE  — grants/revokes all roles
 *   INGESTION_ROLE      — nurse / IoT device: stores LAB_RESULT, DIAGNOSIS, IMAGING
 *   VALIDATOR_ROLE      — doctor: validates any record type (emits audit event)
 *   PHARMACIST_ROLE     — pharmacist: stores/updates PRESCRIPTION records only
 *   CONSENT_MANAGER_ROLE— patient advocate: stores/updates CONSENT_FORM records only
 *   AUDITOR_ROLE        — compliance officer: read-only audit summary
 */
contract DataIntegrity is AccessControl, Pausable, ReentrancyGuard {

    // ──────────────────────────── Roles ────────────────────────────
    bytes32 public constant INGESTION_ROLE       = keccak256("INGESTION_ROLE");
    bytes32 public constant VALIDATOR_ROLE        = keccak256("VALIDATOR_ROLE");
    bytes32 public constant PHARMACIST_ROLE       = keccak256("PHARMACIST_ROLE");
    bytes32 public constant CONSENT_MANAGER_ROLE  = keccak256("CONSENT_MANAGER_ROLE");
    bytes32 public constant AUDITOR_ROLE          = keccak256("AUDITOR_ROLE");

    // ──────────────────────────── Record Types ─────────────────────
    enum RecordType { LAB_RESULT, DIAGNOSIS, PRESCRIPTION, CONSENT_FORM, IMAGING }

    // ──────────────────────────── Structs ──────────────────────────
    struct HashRecord {
        bytes32    datasetHash;   // SHA-256 hash of the off-chain record
        uint256    timestamp;     // block.timestamp when stored
        address    submitter;     // address that submitted the hash
        string     metadataCID;   // optional IPFS CID for metadata
        RecordType recordType;    // type of medical record
        bool       exists;
    }

    // ──────────────────────────── State ────────────────────────────
    mapping(string => HashRecord)  private records;
    mapping(string => bytes32[])   private hashHistory;
    mapping(RecordType => uint256) public  countByType;

    string[] private datasetIds;
    uint256  public  totalRecords;

    // ──────────────────────────── Events ───────────────────────────
    event HashStored(
        string    indexed datasetId,
        bytes32           datasetHash,
        RecordType        recordType,
        string            metadataCID,
        address   indexed submitter,
        uint256           timestamp
    );

    event HashUpdated(
        string    indexed datasetId,
        bytes32           oldHash,
        bytes32           newHash,
        RecordType        recordType,
        address   indexed submitter,
        uint256           timestamp
    );

    event IntegrityChecked(
        string    indexed datasetId,
        bytes32           providedHash,
        bytes32           storedHash,
        RecordType        recordType,
        bool              isValid,
        address   indexed checker,
        uint256           timestamp
    );

    // ──────────────────────────── Errors ───────────────────────────
    error DatasetAlreadyExists(string datasetId);
    error DatasetNotFound(string datasetId);
    error InvalidHash();
    error InvalidDatasetId();
    error UnauthorizedRecordType(RecordType recordType, address caller);

    // ──────────────────────────── Constructor ──────────────────────
    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE,     admin);
        _grantRole(INGESTION_ROLE,         admin);
        _grantRole(VALIDATOR_ROLE,         admin);
        _grantRole(PHARMACIST_ROLE,        admin);
        _grantRole(CONSENT_MANAGER_ROLE,   admin);
        _grantRole(AUDITOR_ROLE,           admin);
    }

    // ──────────────────────────── Write Functions ──────────────────

    /**
     * @notice Store a new medical record hash on-chain.
     * @param datasetId   Unique identifier for the record (from T3.1 ingestion)
     * @param datasetHash SHA-256 hash of the off-chain record content
     * @param metadataCID Optional IPFS CID pointing to record metadata
     * @param recordType  Type of medical record being stored
     *
     * Access: INGESTION_ROLE (LAB_RESULT, DIAGNOSIS, IMAGING)
     *         PHARMACIST_ROLE (PRESCRIPTION)
     *         CONSENT_MANAGER_ROLE (CONSENT_FORM)
     */
    function storeHash(
        string     calldata datasetId,
        bytes32             datasetHash,
        string     calldata metadataCID,
        RecordType          recordType
    )
        external
        whenNotPaused
        nonReentrant
    {
        if (bytes(datasetId).length == 0) revert InvalidDatasetId();
        if (datasetHash == bytes32(0))    revert InvalidHash();
        if (records[datasetId].exists)    revert DatasetAlreadyExists(datasetId);

        _checkIngestPermission(recordType);

        records[datasetId] = HashRecord({
            datasetHash: datasetHash,
            timestamp:   block.timestamp,
            submitter:   msg.sender,
            metadataCID: metadataCID,
            recordType:  recordType,
            exists:      true
        });

        hashHistory[datasetId].push(datasetHash);
        datasetIds.push(datasetId);
        countByType[recordType]++;
        totalRecords++;

        emit HashStored(datasetId, datasetHash, recordType, metadataCID, msg.sender, block.timestamp);
    }

    /**
     * @notice Update the hash for an existing record (e.g., amended lab result).
     * @dev Same role restrictions as storeHash — only the appropriate role may update.
     */
    function updateHash(
        string     calldata datasetId,
        bytes32             newHash,
        string     calldata metadataCID
    )
        external
        whenNotPaused
        nonReentrant
    {
        if (!records[datasetId].exists) revert DatasetNotFound(datasetId);
        if (newHash == bytes32(0))      revert InvalidHash();

        RecordType rt = records[datasetId].recordType;
        _checkIngestPermission(rt);

        bytes32 oldHash = records[datasetId].datasetHash;

        records[datasetId].datasetHash = newHash;
        records[datasetId].timestamp   = block.timestamp;
        records[datasetId].submitter   = msg.sender;
        records[datasetId].metadataCID = metadataCID;

        hashHistory[datasetId].push(newHash);

        emit HashUpdated(datasetId, oldHash, newHash, rt, msg.sender, block.timestamp);
    }

    // ──────────────────────────── Read Functions ──────────────────

    /**
     * @notice Retrieve the current hash record for a dataset.
     */
    function getHash(string calldata datasetId)
        external
        view
        returns (
            bytes32    datasetHash,
            uint256    timestamp,
            address    submitter,
            string memory metadataCID,
            RecordType recordType
        )
    {
        if (!records[datasetId].exists) revert DatasetNotFound(datasetId);
        HashRecord memory r = records[datasetId];
        return (r.datasetHash, r.timestamp, r.submitter, r.metadataCID, r.recordType);
    }

    /**
     * @notice Validate a hash against the stored on-chain hash.
     * @dev    Emits an IntegrityChecked event for the audit trail.
     * @return isValid true if the provided hash matches the stored hash
     */
    function validateHash(
        string  calldata datasetId,
        bytes32          hashToValidate
    )
        external
        onlyRole(VALIDATOR_ROLE)
        returns (bool isValid)
    {
        if (!records[datasetId].exists) revert DatasetNotFound(datasetId);

        bytes32    storedHash = records[datasetId].datasetHash;
        RecordType rt         = records[datasetId].recordType;
        isValid = (storedHash == hashToValidate);

        emit IntegrityChecked(
            datasetId,
            hashToValidate,
            storedHash,
            rt,
            isValid,
            msg.sender,
            block.timestamp
        );
    }

    /**
     * @notice Get full hash history for a dataset (all versions).
     */
    function getHashHistory(string calldata datasetId)
        external
        view
        returns (bytes32[] memory)
    {
        if (!records[datasetId].exists) revert DatasetNotFound(datasetId);
        return hashHistory[datasetId];
    }

    /**
     * @notice Audit summary: record counts per type.
     * @dev    Readable by AUDITOR_ROLE (and admin). Useful for compliance dashboards.
     */
    function getAuditSummary()
        external
        view
        onlyRole(AUDITOR_ROLE)
        returns (
            uint256 labResults,
            uint256 diagnoses,
            uint256 prescriptions,
            uint256 consentForms,
            uint256 imagingRecords,
            uint256 total
        )
    {
        return (
            countByType[RecordType.LAB_RESULT],
            countByType[RecordType.DIAGNOSIS],
            countByType[RecordType.PRESCRIPTION],
            countByType[RecordType.CONSENT_FORM],
            countByType[RecordType.IMAGING],
            totalRecords
        );
    }

    /**
     * @notice Check if a dataset exists on-chain.
     */
    function datasetExists(string calldata datasetId)
        external
        view
        returns (bool)
    {
        return records[datasetId].exists;
    }

    // ──────────────────────────── Admin Functions ─────────────────

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ──────────────────────────── Internal ────────────────────────

    /**
     * @dev Enforces which role may ingest which record type.
     *      INGESTION_ROLE: LAB_RESULT, DIAGNOSIS, IMAGING
     *      PHARMACIST_ROLE: PRESCRIPTION
     *      CONSENT_MANAGER_ROLE: CONSENT_FORM
     *      DEFAULT_ADMIN_ROLE: all types
     */
    function _checkIngestPermission(RecordType rt) internal view {
        if (hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) return;

        if (rt == RecordType.PRESCRIPTION) {
            if (!hasRole(PHARMACIST_ROLE, msg.sender))
                revert UnauthorizedRecordType(rt, msg.sender);
        } else if (rt == RecordType.CONSENT_FORM) {
            if (!hasRole(CONSENT_MANAGER_ROLE, msg.sender))
                revert UnauthorizedRecordType(rt, msg.sender);
        } else {
            // LAB_RESULT, DIAGNOSIS, IMAGING
            if (!hasRole(INGESTION_ROLE, msg.sender))
                revert UnauthorizedRecordType(rt, msg.sender);
        }
    }
}
