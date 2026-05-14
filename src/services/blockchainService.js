const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const config = require("../config");
const logger = require("../logger");

class BlockchainService {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.contract = null;
    this.isConnected = false;
    this.initError = null;
    this.initLog = [];
    this._initPromise = null;
  }

  initialize() {
    if (!this._initPromise) {
      this._initPromise = this._doInitialize();
    }
    return this._initPromise;
  }

  async _doInitialize() {
    try {
      const msg = "Starting blockchain service initialization...";
      this.initLog.push(msg);
      logger.info(msg);

      // Validate required environment variables
      if (!config.blockchain.contractAddress) {
        throw new Error("CONTRACT_ADDRESS environment variable is not set");
      }
      if (!config.blockchain.privateKey) {
        throw new Error("DEPLOYER_PRIVATE_KEY environment variable is not set");
      }

      let msg2 = `RPC URL: ${config.blockchain.rpcUrl}`;
      this.initLog.push(msg2);
      logger.info(msg2);

      let msg3 = `Contract Address: ${config.blockchain.contractAddress}`;
      this.initLog.push(msg3);
      logger.info(msg3);

      // Connect to Reltime Mainnet
      this.provider = new ethers.JsonRpcProvider(
        config.blockchain.rpcUrl,
        {
          name: "reltime-mainnet",
          chainId: config.blockchain.chainId,
        }
      );
      let msg4 = "Provider created";
      this.initLog.push(msg4);
      logger.info(msg4);

      // Verify connection with timeout (optional - continue if RPC is slow)
      try {
        const networkPromise = this.provider.getNetwork();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Network verification timeout after 5s")), 5000)
        );
        const network = await Promise.race([networkPromise, timeoutPromise]);
        let msg5 = `Connected to Reltime Mainnet, Chain ID: ${network.chainId}`;
        this.initLog.push(msg5);
        logger.info(msg5);
      } catch (netError) {
        let warnMsg = `Network verification failed (will continue anyway): ${netError.message}`;
        this.initLog.push(`WARN: ${warnMsg}`);
        logger.warn(warnMsg);
        // Don't throw - continue initialization even if RPC is slow/unreachable
      }

      // Setup signer
      this.signer = new ethers.Wallet(config.blockchain.privateKey, this.provider);
      let msg6 = `Signer address: ${this.signer.address}`;
      this.initLog.push(msg6);
      logger.info(msg6);

      // Load contract ABI
      const artifactPath = path.join(
        __dirname,
        "../../artifacts/contracts/DataIntegrity.sol/DataIntegrity.json"
      );

      if (!fs.existsSync(artifactPath)) {
        throw new Error(
          `Contract artifact not found at ${artifactPath}. ` +
          `Make sure to run 'npx hardhat compile' before deploying.`
        );
      }

      const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
      let msg7 = "Contract artifact loaded";
      this.initLog.push(msg7);
      logger.info(msg7);

      // Instantiate contract
      this.contract = new ethers.Contract(
        config.blockchain.contractAddress,
        artifact.abi,
        this.signer
      );
      let msg8 = "Contract instance created";
      this.initLog.push(msg8);
      logger.info(msg8);

      // Skip contract verification - RPC is too slow in Vercel
      // Contract will be verified when first transaction is attempted
      let msg9 = "Contract instantiated (verification deferred)";
      this.initLog.push(msg9);
      logger.info(msg9);

      this.isConnected = true;
      let msg10 = "Blockchain service initialization completed successfully";
      this.initLog.push(msg10);
      logger.info(msg10);
    } catch (error) {
      this.initError = error.message;
      this.initLog.push(`FATAL: ${error.message}`);
      logger.error("Blockchain initialization failed:", error.message);
      if (error.stack) {
        logger.error("Stack trace:", error.stack);
      }
      throw error;
    }
  }

  /**
   * Record type enum mirrors the Solidity RecordType enum.
   * LAB_RESULT=0, DIAGNOSIS=1, PRESCRIPTION=2, CONSENT_FORM=3, IMAGING=4
   */
  static RECORD_TYPES = {
    LAB_RESULT:      0,
    DIAGNOSIS:       1,
    PRESCRIPTION:    2,
    CONSENT_FORM:    3,
    IMAGING:         4,
  };

  static RECORD_TYPE_NAMES = ["LAB_RESULT", "DIAGNOSIS", "PRESCRIPTION", "CONSENT_FORM", "IMAGING"];

  /**
   * Store a medical record hash on-chain.
   * Called by T3.1 ingestion pipeline via this API.
   * @param {number} recordType — use BlockchainService.RECORD_TYPES
   */
  async storeHash(datasetId, hashHex, metadataCID = "", recordType = 0) {
    await this._ensureConnected();

    const hashBytes32 = this._toBytes32(hashHex);

    logger.info(`Storing hash for dataset: ${datasetId} (type: ${BlockchainService.RECORD_TYPE_NAMES[recordType]})`);
    logger.debug(`  Hash: ${hashHex}`);
    logger.debug(`  CID:  ${metadataCID || "(none)"}`);

    const tx = await this.contract.storeHash(
      datasetId,
      hashBytes32,
      metadataCID,
      recordType,
      {
        gasPrice: 0,
        gasLimit: config.blockchain.gasLimit,
      }
    );

    logger.info(`Transaction submitted: ${tx.hash}`);
    const receipt = await tx.wait();
    logger.info(`Transaction confirmed in block: ${receipt.blockNumber}`);

    return {
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      status: receipt.status === 1 ? "confirmed" : "failed",
    };
  }

  /**
   * Update an existing dataset hash on-chain.
   */
  async updateHash(datasetId, newHashHex, metadataCID = "") {
    await this._ensureConnected();

    const hashBytes32 = this._toBytes32(newHashHex);

    const tx = await this.contract.updateHash(
      datasetId,
      hashBytes32,
      metadataCID,
      {
        gasPrice: 0,
        gasLimit: config.blockchain.gasLimit,
      }
    );

    const receipt = await tx.wait();
    logger.info(`Hash updated for ${datasetId} in block ${receipt.blockNumber}`);

    return {
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      status: receipt.status === 1 ? "confirmed" : "failed",
    };
  }

  /**
   * Retrieve the stored hash for a dataset.
   * Called by DataIntegrityValidator (T3.4).
   */
  async getHash(datasetId) {
    await this._ensureConnected();

    const [datasetHash, timestamp, submitter, metadataCID, recordType] =
      await this.contract.getHash(datasetId);

    return {
      datasetId,
      hash: datasetHash,
      timestamp: Number(timestamp),
      timestampISO: new Date(Number(timestamp) * 1000).toISOString(),
      submitter,
      metadataCID,
      recordType: Number(recordType),
      recordTypeName: BlockchainService.RECORD_TYPE_NAMES[Number(recordType)] ?? "UNKNOWN",
    };
  }

  /**
   * Validate a hash against the on-chain record.
   * This calls the smart contract's validateHash which emits an audit event.
   */
  async validateHash(datasetId, hashHex) {
    await this._ensureConnected();

    const hashBytes32 = this._toBytes32(hashHex);

    // This is a state-changing call (emits event), not a view call
    const tx = await this.contract.validateHash(datasetId, hashBytes32, {
      gasPrice: 0,
      gasLimit: config.blockchain.gasLimit,
    });

    const receipt = await tx.wait();

    // Parse the IntegrityChecked event from the receipt
    const event = receipt.logs
      .map((log) => {
        try {
          return this.contract.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((e) => e && e.name === "IntegrityChecked");

    const isValid = event ? event.args.isValid : null;

    return {
      datasetId,
      isValid,
      providedHash: hashHex,
      storedHash: event ? event.args.storedHash : null,
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
    };
  }

  /**
   * Read-only integrity check (no on-chain event, no gas, instant).
   */
  async checkIntegrity(datasetId, hashHex) {
    await this._ensureConnected();

    const stored = await this.getHash(datasetId);
    const hashBytes32 = this._toBytes32(hashHex);

    return {
      datasetId,
      isValid: stored.hash === hashBytes32,
      providedHash: hashBytes32,
      storedHash: stored.hash,
      storedTimestamp: stored.timestampISO,
    };
  }

  /**
   * Get hash version history for a dataset.
   */
  async getHashHistory(datasetId) {
    await this._ensureConnected();
    const history = await this.contract.getHashHistory(datasetId);
    return {
      datasetId,
      versions: history.map((h, i) => ({ version: i + 1, hash: h })),
      totalVersions: history.length,
    };
  }

  /**
   * Audit summary: record counts per type. Requires AUDITOR_ROLE on-chain.
   */
  async getAuditSummary() {
    await this._ensureConnected();
    const [labResults, diagnoses, prescriptions, consentForms, imagingRecords, total] =
      await this.contract.getAuditSummary();
    return {
      labResults:      Number(labResults),
      diagnoses:       Number(diagnoses),
      prescriptions:   Number(prescriptions),
      consentForms:    Number(consentForms),
      imagingRecords:  Number(imagingRecords),
      total:           Number(total),
    };
  }

  /**
   * Check if a dataset exists on-chain.
   */
  async datasetExists(datasetId) {
    await this._ensureConnected();
    return await this.contract.datasetExists(datasetId);
  }

  /**
   * Get blockchain health info.
   */
  async getHealth() {
    try {
      if (!this.isConnected) {
        return {
          status: "unhealthy",
          error: "Blockchain service not initialized",
        };
      }

      const [blockNumber, network, totalRecords] = await Promise.all([
        this.provider.getBlockNumber(),
        this.provider.getNetwork(),
        this.contract.totalRecords(),
      ]);

      return {
        status: "healthy",
        chain: "Reltime Mainnet",
        chainId: Number(network.chainId),
        currentBlock: blockNumber,
        contractAddress: config.blockchain.contractAddress,
        totalRecords: Number(totalRecords),
        rpcUrl: config.blockchain.rpcUrl,
      };
    } catch (error) {
      return {
        status: "unhealthy",
        error: error.message,
      };
    }
  }

  // ── Per-user wallet helpers ────────────────────────────────────

  /**
   * Return a contract instance connected to a specific user wallet.
   * Used so each user's on-chain transactions are signed by their own address.
   */
  async getContractAs(privateKey) {
    await this._ensureConnected();
    const wallet = new ethers.Wallet(privateKey, this.provider);
    return this.contract.connect(wallet);
  }

  /**
   * Grant an on-chain role to a wallet address.
   * Called by the admin route when a user's role is assigned.
   * Uses the deployer (admin) wallet which holds DEFAULT_ADMIN_ROLE.
   *
   * @param {string} roleKey — "nurse" | "doctor" | "pharmacist" | "consent_manager" | "auditor"
   * @param {string} walletAddress — user's wallet address
   */
  async grantUserRole(roleKey, walletAddress) {
    await this._ensureConnected();

    const ROLE_MAP = {
      nurse:           this.contract.INGESTION_ROLE,
      doctor:          this.contract.VALIDATOR_ROLE,
      pharmacist:      this.contract.PHARMACIST_ROLE,
      consent_manager: this.contract.CONSENT_MANAGER_ROLE,
      auditor:         this.contract.AUDITOR_ROLE,
    };

    const roleFn = ROLE_MAP[roleKey];
    if (!roleFn) throw new Error(`Unknown role: ${roleKey}`);

    const roleHash = await roleFn.call(this.contract);
    const tx = await this.contract.grantRole(roleHash, walletAddress, {
      gasPrice: 0,
      gasLimit: config.blockchain.gasLimit,
    });
    const receipt = await tx.wait();
    logger.info(`Granted ${roleKey} to ${walletAddress} in block ${receipt.blockNumber}`);
    return { transactionHash: receipt.hash, blockNumber: receipt.blockNumber };
  }

  /**
   * Store hash using a specific user's wallet (not the deployer).
   */
  async storeHashAs(privateKey, datasetId, hashHex, metadataCID = "", recordType = 0) {
    await this._ensureConnected();
    const contractAs = await this.getContractAs(privateKey);
    const hashBytes32 = this._toBytes32(hashHex);

    logger.info(`Storing hash for dataset: ${datasetId} (type: ${BlockchainService.RECORD_TYPE_NAMES[recordType]})`);

    const tx = await contractAs.storeHash(datasetId, hashBytes32, metadataCID, recordType, {
      gasPrice: 0,
      gasLimit: config.blockchain.gasLimit,
    });
    const receipt = await tx.wait();
    return {
      transactionHash: receipt.hash,
      blockNumber:     receipt.blockNumber,
      gasUsed:         receipt.gasUsed.toString(),
      status:          receipt.status === 1 ? "confirmed" : "failed",
    };
  }

  /**
   * Update hash using a specific user's wallet.
   */
  async updateHashAs(privateKey, datasetId, newHashHex, metadataCID = "") {
    await this._ensureConnected();
    const contractAs = await this.getContractAs(privateKey);
    const hashBytes32 = this._toBytes32(newHashHex);

    const tx = await contractAs.updateHash(datasetId, hashBytes32, metadataCID, {
      gasPrice: 0,
      gasLimit: config.blockchain.gasLimit,
    });
    const receipt = await tx.wait();
    return {
      transactionHash: receipt.hash,
      blockNumber:     receipt.blockNumber,
      status:          receipt.status === 1 ? "confirmed" : "failed",
    };
  }

  /**
   * Validate hash using a specific user's wallet (doctor role).
   */
  async validateHashAs(privateKey, datasetId, hashHex) {
    await this._ensureConnected();
    const contractAs = await this.getContractAs(privateKey);
    const hashBytes32 = this._toBytes32(hashHex);

    const tx = await contractAs.validateHash(datasetId, hashBytes32, {
      gasPrice: 0,
      gasLimit: config.blockchain.gasLimit,
    });
    const receipt = await tx.wait();

    const event = receipt.logs
      .map(log => { try { return this.contract.interface.parseLog(log); } catch { return null; } })
      .find(e => e?.name === "IntegrityChecked");

    return {
      datasetId,
      isValid:         event ? event.args.isValid : null,
      recordTypeName:  event ? BlockchainService.RECORD_TYPE_NAMES[Number(event.args.recordType)] : null,
      transactionHash: receipt.hash,
      blockNumber:     receipt.blockNumber,
    };
  }

  /**
   * Fetch audit summary using a specific user's wallet (auditor role).
   */
  async getAuditSummaryAs(privateKey) {
    await this._ensureConnected();
    const contractAs = await this.getContractAs(privateKey);
    const [labResults, diagnoses, prescriptions, consentForms, imagingRecords, total] =
      await contractAs.getAuditSummary();
    return {
      labResults:      Number(labResults),
      diagnoses:       Number(diagnoses),
      prescriptions:   Number(prescriptions),
      consentForms:    Number(consentForms),
      imagingRecords:  Number(imagingRecords),
      total:           Number(total),
    };
  }

  // ── Helpers ──

  _toBytes32(hexString) {
    // Accept "0x..." prefixed or raw hex
    if (!hexString.startsWith("0x")) {
      hexString = "0x" + hexString;
    }
    // Pad to 32 bytes if needed
    return ethers.zeroPadValue(hexString, 32);
  }

  async _ensureConnected() {
    if (!this.isConnected && this._initPromise) {
      try { await this._initPromise; } catch { /* initError already stored */ }
    }
    if (!this.isConnected) {
      throw new Error("Blockchain service not initialized. Check RPC connection and environment variables.");
    }
  }
}

// Singleton
module.exports = new BlockchainService();
