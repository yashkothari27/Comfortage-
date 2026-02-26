#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');

// Minimal web3 RPC call implementation
function makeRpcCall(method, params = []) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: Math.floor(Math.random() * 10000),
    });

    const options = {
      hostname: 'mainnet.reltime.com',
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.error) {
            reject(new Error(result.error.message));
          } else {
            resolve(result.result);
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// Simple Keccak256 for message prefixing (just use raw tx)
function toChecksumAddress(address) {
  return address.toLowerCase() === address.toLowerCase() ? address : null;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  COMFORTage T3.3 — Deploying DataIntegrity Contract');
  console.log('  Network: Reltime Mainnet (Chain ID: 32323)');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('DEPLOYER_PRIVATE_KEY not set in .env');
    }

    // Derive address from private key (simplified - would need elliptic for full implementation)
    // For now, use the provided address
    const deployerAddress = process.env.DEPLOYER_ADDRESS || '0xe5C29fbcd61Db1b0c0Ee428b83Ff294842F89873';

    console.log('Deployer address:', deployerAddress);

    // Get balance
    const balanceHex = await makeRpcCall('eth_getBalance', [deployerAddress, 'latest']);
    const balanceWei = BigInt(balanceHex);
    const balanceEth = balanceWei / BigInt(10) ** BigInt(18);
    console.log('Deployer balance:', balanceEth.toString(), 'ETH\n');

    // Get chain ID
    const chainId = await makeRpcCall('eth_chainId');
    console.log('Chain ID:', parseInt(chainId, 16));

    // Get block number
    const blockNumber = await makeRpcCall('eth_blockNumber');
    console.log('Current block:', parseInt(blockNumber, 16), '\n');

    // Load contract artifact
    const artifactPath = path.join(__dirname, 'artifacts/contracts/DataIntegrity.sol/DataIntegrity.json');
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

    // Constructor bytecode (with deployer address as argument)
    const deployerAddressPadded = deployerAddress.replace('0x', '').padStart(64, '0');
    const constructorArg = deployerAddressPadded;
    const deploymentData = artifact.bytecode + constructorArg;

    console.log('Deploying contract...');
    console.log('Bytecode length:', deploymentData.length, 'characters');

    // Get nonce
    const nonceHex = await makeRpcCall('eth_getTransactionCount', [deployerAddress, 'latest']);
    const nonce = parseInt(nonceHex, 16);
    console.log('Account nonce:', nonce);

    // Create deployment transaction
    const deployTx = {
      from: deployerAddress,
      data: deploymentData,
      gas: '0x989680', // 10,000,000
      gasPrice: '0x0', // 0 gas fee on Reltime
      nonce: '0x' + nonce.toString(16),
    };

    console.log('\n📝 Transaction details:');
    console.log('  Gas limit: 10000000');
    console.log('  Gas price: 0 wei (Reltime PoA)');
    console.log('  Nonce:', nonce);

    console.log('\n⚠️  Note: This script demonstrates the deployment flow.');
    console.log('    For actual deployment, use ethers.js with proper signing.\n');

    console.log('💡 To deploy with ethers, run:');
    console.log('   npm install ethers');
    console.log('   node deploy-direct.js\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
