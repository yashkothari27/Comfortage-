const { ethers } = require('ethers');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const logger = require('../logger');
const { uploadJSONToIPFS } = require('./ipfsService');

const ABI_PATH = path.join(__dirname, '../../artifacts/contracts/KYCAttestation.sol/KYCAttestation.json');

// Attestation type enum — must match contract order
const ATTESTATION_TYPE = {
  UBO_DECLARATION:  0,
  PEP_CHECK:        1,
  CCD2_ATTESTATION: 2,
  CREDIT_DECISION:  3,
  DORA_INCIDENT:    4,
};

class NorionService {
  constructor() {
    this.provider = null;
    this.signer   = null;
    this.contract = null;
    this.ready    = false;
  }

  async initialize() {
    if (this.ready) return;

    const rpcUrl     = process.env.RELTIME_RPC_URL    || 'https://mainnet.reltime.com/';
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    const address    = process.env.NORION_CONTRACT_ADDRESS;

    if (!privateKey) throw new Error('DEPLOYER_PRIVATE_KEY not set');
    if (!address)    throw new Error('NORION_CONTRACT_ADDRESS not set — run: node scripts/deploy-norion.js');

    this.provider = new ethers.JsonRpcProvider(rpcUrl, { name: 'reltime-mainnet', chainId: 32323 });
    this.signer   = new ethers.Wallet(privateKey, this.provider);

    const artifact  = JSON.parse(fs.readFileSync(ABI_PATH, 'utf8'));
    this.contract   = new ethers.Contract(address, artifact.abi, this.signer);
    this.ready      = true;
    logger.info(`NorionService ready — contract: ${address}`);
  }

  /**
   * Full attestation flow:
   *   1. SHA-256 hash of payload JSON
   *   2. Upload metadata to Pinata IPFS
   *   3. Submit to KYCAttestation contract on Reltime mainnet
   * Returns { attestationId, dataHash, ipfsCID, txHash, blockNumber, timestamp }
   */
  async anchor({ attestationId, attestationType, payload, extraMeta = {} }) {
    await this.initialize();

    // 1. Hash
    const payloadStr = JSON.stringify(payload);
    const dataHashHex = '0x' + crypto.createHash('sha256').update(payloadStr).digest('hex');
    const dataHashBytes32 = ethers.hexlify(dataHashHex);

    // 2. IPFS metadata
    const metadata = {
      schema:          'reltime/kyc-attestation/v1',
      attestationId,
      attestationType: Object.keys(ATTESTATION_TYPE).find(k => ATTESTATION_TYPE[k] === attestationType) || attestationType,
      dataHash:        dataHashHex,
      platform:        'Norion Bank × Reltime Layer 1',
      network:         'reltime-mainnet',
      chainId:          32323,
      timestamp:        new Date().toISOString(),
      frameworks:      ['KYC/AML', 'GDPR', 'DORA', 'AI-Act', 'CCD2'],
      ...extraMeta,
    };

    let ipfsCID = '';
    try {
      ipfsCID = await uploadJSONToIPFS(metadata, `norion-${attestationId}`);
    } catch (err) {
      logger.warn('IPFS upload failed, proceeding without CID:', err.message);
    }

    // 3. On-chain
    const tx = await this.contract.storeAttestation(
      attestationId,
      dataHashBytes32,
      ipfsCID,
      attestationType,
      { gasPrice: 0, gasLimit: 500_000 }
    );
    const receipt = await tx.wait();

    return {
      attestationId,
      dataHash:    dataHashHex,
      ipfsCID,
      ipfsUrl:     ipfsCID ? `https://gateway.pinata.cloud/ipfs/${ipfsCID}` : null,
      txHash:      receipt.hash,
      blockNumber: Number(receipt.blockNumber),
      timestamp:   new Date().toISOString(),
      contract:    await this.contract.getAddress(),
    };
  }

  async getAttestation(attestationId) {
    await this.initialize();
    const r = await this.contract.getAttestation(attestationId);
    return {
      dataHash:        r[0],
      ipfsCID:         r[1],
      attestationType: Number(r[2]),
      submitter:       r[3],
      timestamp:       Number(r[4]),
      validated:       r[5],
      validator:       r[6],
      validatedAt:     Number(r[7]),
    };
  }

  async getAuditSummary() {
    await this.initialize();
    const s = await this.contract.getAuditSummary();
    return {
      uboDeclarations:  Number(s[0]),
      pepChecks:        Number(s[1]),
      ccd2Attestations: Number(s[2]),
      creditDecisions:  Number(s[3]),
      doraIncidents:    Number(s[4]),
      total:            Number(s[5]),
    };
  }

  async getHealth() {
    await this.initialize();
    const block = await this.provider.getBlockNumber();
    return { ready: true, blockNumber: block, contract: await this.contract.getAddress() };
  }
}

module.exports = new NorionService();
module.exports.ATTESTATION_TYPE = ATTESTATION_TYPE;
