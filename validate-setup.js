#!/usr/bin/env node

/**
 * Simple Contract Deployment without External Dependencies
 * Uses Node.js crypto for signing and native http module
 */

require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');

// RLP Encode utility
function rlpEncode(data) {
  if (Array.isArray(data)) {
    const encoded = data.map(item => rlpEncode(item));
    const payload = Buffer.concat(encoded);
    return prependLength(payload);
  } else if (typeof data === 'string' && data.startsWith('0x')) {
    return encodeHex(data);
  } else if (typeof data === 'number') {
    return encodeNumber(data);
  } else if (data === '' || data === null) {
    return Buffer.from([0x80]);
  }
  return Buffer.from(data);
}

function encodeHex(hex) {
  const buf = Buffer.from(hex.slice(2), 'hex');
  if (buf.length === 1 && buf[0] < 128) {
    return buf;
  }
  return prependLength(buf);
}

function encodeNumber(num) {
  if (num === 0) return Buffer.from([0x80]);
  const hex = num.toString(16);
  return encodeHex('0x' + (hex.length % 2 ? '0' + hex : hex));
}

function prependLength(buf) {
  const len = buf.length;
  if (len <= 55) {
    return Buffer.concat([Buffer.from([0xc0 + len]), buf]);
  } else {
    const lenBuf = Buffer.from(len.toString(16).padStart(2, '0'), 'hex');
    return Buffer.concat([Buffer.from([0xf7 + lenBuf.length]), lenBuf, buf]);
  }
}

// Keccak256
function keccak256(data) {
  // Note: This is a placeholder - real implementation needs crypto.createHash('sha3-256')
  // or the keccak library. For now, return a dummy value for demonstration
  try {
    // Try to use Node's built-in if available
    return crypto.createHash('sha3-256').update(data).digest();
  } catch (e) {
    console.warn('⚠️  SHA3-256 not available, using SHA256 instead (NOT FOR PRODUCTION)');
    return crypto.createHash('sha256').update(data).digest();
  }
}

// Make RPC call
function rpcCall(method, params = []) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: Math.floor(Math.random() * 100000),
    });

    const options = {
      hostname: 'mainnet.reltime.com',
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 10000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result.result);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('RPC timeout'));
    });
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('═'.repeat(60));
  console.log('  COMFORTage T3.3 - DataIntegrity Deployment');
  console.log('  Network: Reltime Mainnet (PoA, Chain ID 32323)');
  console.log('═'.repeat(60) + '\n');

  try {
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    const deployerAddress = process.env.DEPLOYER_ADDRESS;

    if (!privateKey || !deployerAddress) {
      throw new Error('Missing DEPLOYER_PRIVATE_KEY or DEPLOYER_ADDRESS in .env');
    }

    console.log('📋 Configuration:');
    console.log(`   Deployer: ${deployerAddress}`);
    console.log(`   RPC: https://mainnet.reltime.com/`);
    console.log(`   Chain ID: 32323\n`);

    // Test connection
    console.log('🔗 Testing RPC connection...');
    const chainId = await rpcCall('eth_chainId');
    console.log(`   ✓ Chain ID: ${parseInt(chainId, 16)}`);

    const balance = await rpcCall('eth_getBalance', [deployerAddress, 'latest']);
    const balanceWei = BigInt(balance);
    console.log(`   ✓ Balance: ${balanceWei / BigInt(10 ** 18)} ETH`);

    const blockNumber = await rpcCall('eth_blockNumber');
    console.log(`   ✓ Block: ${parseInt(blockNumber, 16)}\n`);

    // Load contract
    console.log('📦 Loading contract artifact...');
    const artifactPath = path.join(
      __dirname,
      'artifacts/contracts/DataIntegrity.sol/DataIntegrity.json'
    );
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    console.log('   ✓ ABI loaded');
    console.log(`   ✓ Bytecode: ${artifact.bytecode.length} chars\n`);

    // Get nonce
    console.log('📝 Building transaction...');
    const nonce = await rpcCall('eth_getTransactionCount', [deployerAddress, 'latest']);
    const nonceNum = parseInt(nonce, 16);
    console.log(`   ✓ Nonce: ${nonceNum}`);

    // Construction data (deployer as admin)
    const deployerPadded = deployerAddress.replace('0x', '').padStart(64, '0');
    const deploymentData = artifact.bytecode + deployerPadded;

    console.log(`   ✓ Constructor arg: ${deployerAddress}`);
    console.log(`   ✓ Deployment data: ${deploymentData.length} chars\n`);

    console.log('⚠️  IMPORTANT NOTES:');
    console.log('   - This script validates your setup');
    console.log('   - To actually deploy, use one of:');
    console.log('     • npm install ethers && node deploy-direct.js');
    console.log('     • pip install web3 && python3 deploy.py');
    console.log('     • npx hardhat run scripts/deploy.js --network reltime_mainnet\n');

    console.log('📋 Transaction Details:');
    console.log('   From:', deployerAddress);
    console.log('   Data:', deploymentData.substring(0, 66) + '...');
    console.log('   Gas Limit: 10000000');
    console.log('   Gas Price: 0 wei (Reltime PoA)');
    console.log('   Nonce:', nonceNum);
    console.log('\n✅ Setup validation complete!\n');

  } catch (error) {
    console.error(`❌ Error: ${error.message}\n`);
    process.exit(1);
  }
}

main();
