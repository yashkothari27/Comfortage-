const { ethers } = require('ethers');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const logger = require('../logger');
const { uploadJSONToIPFS } = require('./ipfsService');

const ABI_PATH = path.join(__dirname, '../../artifacts/contracts/DefenceCompliance.sol/DefenceCompliance.json');

const EVIDENCE_TYPE = {
  STANAG_TEST:       0,
  CMMC_ATTESTATION:  1,
  INCIDENT_EVIDENCE: 2,
  ITAR_FILING:       3,
  DO178C_BUILD:      4,
};

const CLASS_LEVEL = { UNCLASSIFIED: 0, NATO_RESTRICTED: 1 };

class NewsroomService {
  constructor() {
    this.provider = null;
    this.signer   = null;
    this.contract = null;
    this.ready    = false;
  }

  async initialize() {
    if (this.ready) return;

    const rpcUrl     = process.env.RELTIME_RPC_URL     || 'https://mainnet.reltime.com/';
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    const address    = process.env.NEWSROOM_CONTRACT_ADDRESS;

    if (!privateKey) throw new Error('DEPLOYER_PRIVATE_KEY not set');
    if (!address)    throw new Error('NEWSROOM_CONTRACT_ADDRESS not set — run: node scripts/deploy-newsroom.js');

    this.provider = new ethers.JsonRpcProvider(rpcUrl, { name: 'reltime-mainnet', chainId: 32323 });
    this.signer   = new ethers.Wallet(privateKey, this.provider);

    const artifact  = JSON.parse(fs.readFileSync(ABI_PATH, 'utf8'));
    this.contract   = new ethers.Contract(address, artifact.abi, this.signer);
    this.ready      = true;
    logger.info(`NewsroomService ready — contract: ${address}`);
  }

  /**
   * Full evidence anchoring flow:
   *   1. SHA-256 hash of payload JSON
   *   2. Upload metadata to Pinata IPFS
   *   3. Submit to DefenceCompliance contract on Reltime mainnet
   */
  async anchor({ recordId, evidenceType, classification = 0, referenceId = '', payload, extraMeta = {} }) {
    await this.initialize();

    const payloadStr      = JSON.stringify(payload);
    const dataHashHex     = '0x' + crypto.createHash('sha256').update(payloadStr).digest('hex');
    const dataHashBytes32 = ethers.hexlify(dataHashHex);

    const evidenceTypeName  = Object.keys(EVIDENCE_TYPE).find(k => EVIDENCE_TYPE[k] === evidenceType) || String(evidenceType);
    const classificationName = Object.keys(CLASS_LEVEL).find(k => CLASS_LEVEL[k] === classification) || 'UNCLASSIFIED';

    const metadata = {
      schema:          'reltime/defence-compliance/v1',
      recordId,
      evidenceType:    evidenceTypeName,
      classification:  classificationName,
      referenceId,
      dataHash:        dataHashHex,
      platform:        'NEWSROOM × Reltime Layer 1',
      network:         'reltime-mainnet',
      chainId:          32323,
      edfProject:      '101121 552',
      timestamp:        new Date().toISOString(),
      frameworks:      ['STANAG-4586', 'CMMC-2.0', 'NIST-800-171', 'ITAR', 'DO-178C'],
      ...extraMeta,
    };

    let ipfsCID = '';
    try {
      ipfsCID = await uploadJSONToIPFS(metadata, `newsroom-${recordId}`);
    } catch (err) {
      logger.warn('IPFS upload failed, proceeding without CID:', err.message);
    }

    const tx = await this.contract.storeEvidence(
      recordId,
      dataHashBytes32,
      ipfsCID,
      evidenceType,
      classification,
      referenceId,
      { gasPrice: 0, gasLimit: 500_000 }
    );
    const receipt = await tx.wait();

    return {
      recordId,
      dataHash:    dataHashHex,
      ipfsCID,
      ipfsUrl:     ipfsCID ? `https://gateway.pinata.cloud/ipfs/${ipfsCID}` : null,
      txHash:      receipt.hash,
      blockNumber: Number(receipt.blockNumber),
      timestamp:   new Date().toISOString(),
      contract:    await this.contract.getAddress(),
    };
  }

  async getEvidence(recordId) {
    await this.initialize();
    const r = await this.contract.getEvidence(recordId);
    return {
      dataHash:       r[0],
      ipfsCID:        r[1],
      evidenceType:   Number(r[2]),
      classification: Number(r[3]),
      referenceId:    r[4],
      submitter:      r[5],
      timestamp:      Number(r[6]),
      validated:      r[7],
    };
  }

  async escalateIncident(recordId) {
    await this.initialize();
    const tx = await this.contract.escalateIncident(recordId, { gasPrice: 0, gasLimit: 100_000 });
    const receipt = await tx.wait();
    return { txHash: receipt.hash, blockNumber: Number(receipt.blockNumber) };
  }

  async getAuditSummary() {
    await this.initialize();
    const s = await this.contract.getAuditSummary();
    return {
      stanagTests:       Number(s[0]),
      cmmcAttestations:  Number(s[1]),
      incidentRecords:   Number(s[2]),
      itarFilings:       Number(s[3]),
      do178cBuilds:      Number(s[4]),
      total:             Number(s[5]),
    };
  }

  async getHealth() {
    await this.initialize();
    const block = await this.provider.getBlockNumber();
    return { ready: true, blockNumber: block, contract: await this.contract.getAddress() };
  }
}

module.exports = new NewsroomService();
module.exports.EVIDENCE_TYPE  = EVIDENCE_TYPE;
module.exports.CLASS_LEVEL    = CLASS_LEVEL;
