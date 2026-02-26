// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title DataIntegrity
 * @notice COMFORTage T3.3 — Stores dataset hashes on the Reltime blockchain
 *         for data integrity validation by the T3.4 DataIntegrityValidator.
 * @dev    Deployed on Reltime Mainnet (Chain ID: 32323, PoA, zero gas fees).
 *         Only hashes are stored on-chain — NO personal data.
 */
contract DataIntegrity is AccessControl, Pausable, ReentrancyGuard {

    // ──────────────────────────── Roles ────────────────────────────
    bytes32 public constant INGESTION_ROLE = keccak256("INGESTION_ROLE");
    bytes32 public constant VALIDATOR_ROLE  = keccak256("VALIDATOR_ROLE");

    // ──────────────────────────── Structs ──────────────────────────
    struct HashRecord {
        bytes32 datasetHash;      // SHA-256 hash of the dataset
        uint256 timestamp;        // block.timestamp when stored
        address submitter;        // address that submitted the hash
        string  metadataCID;      // optional IPFS CID for metadata
        bool    exists;           // flag to check existence
    }

    // ──────────────────────────── State ────────────────────────────
    mapping(string => HashRecord) private records;    // datasetId => record
    mapping(string => bytes32[])  private hashHistory; // datasetId => all hashes (versioning)
    
    string[] private datasetIds;  // for enumeration
    uint256  public totalRecords;

    // ──────────────────────────── Events ───────────────────────────
    event HashStored(
        string indexed datasetId,
        bytes32 datasetHash,
        string  metadataCID,
        address indexed submitter,
        uint256 timestamp
    );

    event HashUpdated(
        string indexed datasetId,
        bytes32 oldHash,
        bytes32 newHash,
        address indexed submitter,
        uint256 timestamp
    );

    event IntegrityChecked(
        string indexed datasetId,
        bytes32 providedHash,
        bytes32 storedHash,
        bool    isValid,
        address indexed checker,
        uint256 timestamp
    );

    // ──────────────────────────── Errors ───────────────────────────
    error DatasetAlreadyExists(string datasetId);
    error DatasetNotFound(string datasetId);
    error InvalidHash();
    error InvalidDatasetId();

    // ──────────────────────────── Constructor ──────────────────────
    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(INGESTION_ROLE, admin);
        _grantRole(VALIDATOR_ROLE, admin);
    }

    // ──────────────────────────── Write Functions ──────────────────

    /**
     * @notice Store a new dataset hash on-chain.
     * @param datasetId   Unique identifier for the dataset (from T3.1 ingestion)
     * @param datasetHash SHA-256 hash of the dataset content
     * @param metadataCID Optional IPFS CID pointing to dataset metadata
     */
    function storeHash(
        string calldata datasetId,
        bytes32 datasetHash,
        string calldata metadataCID
    ) 
        external 
        onlyRole(INGESTION_ROLE) 
        whenNotPaused 
        nonReentrant 
    {
        if (bytes(datasetId).length == 0) revert InvalidDatasetId();
        if (datasetHash == bytes32(0))    revert InvalidHash();
        if (records[datasetId].exists)    revert DatasetAlreadyExists(datasetId);

        records[datasetId] = HashRecord({
            datasetHash: datasetHash,
            timestamp:   block.timestamp,
            submitter:   msg.sender,
            metadataCID: metadataCID,
            exists:      true
        });

        hashHistory[datasetId].push(datasetHash);
        datasetIds.push(datasetId);
        totalRecords++;

        emit HashStored(datasetId, datasetHash, metadataCID, msg.sender, block.timestamp);
    }

    /**
     * @notice Update the hash for an existing dataset (e.g., dataset re-ingestion).
     * @param datasetId   The dataset to update
     * @param newHash     The new SHA-256 hash
     * @param metadataCID Updated metadata CID
     */
    function updateHash(
        string calldata datasetId,
        bytes32 newHash,
        string calldata metadataCID
    )
        external
        onlyRole(INGESTION_ROLE)
        whenNotPaused
        nonReentrant
    {
        if (!records[datasetId].exists) revert DatasetNotFound(datasetId);
        if (newHash == bytes32(0))      revert InvalidHash();

        bytes32 oldHash = records[datasetId].datasetHash;

        records[datasetId].datasetHash = newHash;
        records[datasetId].timestamp   = block.timestamp;
        records[datasetId].submitter   = msg.sender;
        records[datasetId].metadataCID = metadataCID;

        hashHistory[datasetId].push(newHash);

        emit HashUpdated(datasetId, oldHash, newHash, msg.sender, block.timestamp);
    }

    // ──────────────────────────── Read Functions ──────────────────

    /**
     * @notice Retrieve the current hash record for a dataset.
     * @dev    Called by DataIntegrityValidator (T3.4) to verify integrity.
     */
    function getHash(string calldata datasetId)
        external
        view
        returns (
            bytes32 datasetHash,
            uint256 timestamp,
            address submitter,
            string memory metadataCID
        )
    {
        if (!records[datasetId].exists) revert DatasetNotFound(datasetId);
        HashRecord memory r = records[datasetId];
        return (r.datasetHash, r.timestamp, r.submitter, r.metadataCID);
    }

    /**
     * @notice Validate a hash against the stored on-chain hash.
     * @dev    Emits an IntegrityChecked event for audit trail.
     * @return isValid true if the provided hash matches the stored hash
     */
    function validateHash(
        string calldata datasetId,
        bytes32 hashToValidate
    )
        external
        onlyRole(VALIDATOR_ROLE)
        returns (bool isValid)
    {
        if (!records[datasetId].exists) revert DatasetNotFound(datasetId);

        bytes32 storedHash = records[datasetId].datasetHash;
        isValid = (storedHash == hashToValidate);

        emit IntegrityChecked(
            datasetId,
            hashToValidate,
            storedHash,
            isValid,
            msg.sender,
            block.timestamp
        );

        return isValid;
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
}
