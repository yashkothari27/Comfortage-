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
  }

  async initialize() {
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
          setTimeout(() => reject(new Error("Network verification timeout after 15s")), 15000)
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

      // Verify contract is alive with timeout (optional - continue if RPC is slow)
      try {
        const recordsPromise = this.contract.totalRecords();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Contract read timeout after 15s")), 15000)
        );
        const totalRecords = await Promise.race([recordsPromise, timeoutPromise]);
        let msg9 = `Contract loaded. Total records on-chain: ${totalRecords}`;
        this.initLog.push(msg9);
        logger.info(msg9);
      } catch (contractError) {
        let warnMsg = `Contract read failed (will continue anyway): ${contractError.message}`;
        this.initLog.push(`WARN: ${warnMsg}`);
        logger.warn(warnMsg);
        // Don't throw - contract is instantiated, just verification failed
      }

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
   * Store a dataset hash on-chain.
   * Called by T3.1 ingestion pipeline via this API.
   */
  async storeHash(datasetId, hashHex, metadataCID = "") {
    this._ensureConnected();

    // Convert hex string to bytes32
    const hashBytes32 = this._toBytes32(hashHex);

    logger.info(`Storing hash for dataset: ${datasetId}`);
    logger.debug(`  Hash: ${hashHex}`);
    logger.debug(`  CID:  ${metadataCID || "(none)"}`);

    const tx = await this.contract.storeHash(
      datasetId,
      hashBytes32,
      metadataCID,
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
    this._ensureConnected();

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
    this._ensureConnected();

    const [datasetHash, timestamp, submitter, metadataCID] =
      await this.contract.getHash(datasetId);

    return {
      datasetId,
      hash: datasetHash,
      timestamp: Number(timestamp),
      timestampISO: new Date(Number(timestamp) * 1000).toISOString(),
      submitter,
      metadataCID,
    };
  }

  /**
   * Validate a hash against the on-chain record.
   * This calls the smart contract's validateHash which emits an audit event.
   */
  async validateHash(datasetId, hashHex) {
    this._ensureConnected();

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
    this._ensureConnected();

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
    this._ensureConnected();
    const history = await this.contract.getHashHistory(datasetId);
    return {
      datasetId,
      versions: history.map((h, i) => ({ version: i + 1, hash: h })),
      totalVersions: history.length,
    };
  }

  /**
   * Check if a dataset exists on-chain.
   */
  async datasetExists(datasetId) {
    this._ensureConnected();
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

  // ── Helpers ──

  _toBytes32(hexString) {
    // Accept "0x..." prefixed or raw hex
    if (!hexString.startsWith("0x")) {
      hexString = "0x" + hexString;
    }
    // Pad to 32 bytes if needed
    return ethers.zeroPadValue(hexString, 32);
  }

  _ensureConnected() {
    if (!this.isConnected) {
      throw new Error("Blockchain service not initialized. Check RPC connection and environment variables.");
    }
  }
}

// Singleton
module.exports = new BlockchainService();
