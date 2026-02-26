#!/usr/bin/env node
/**
 * Standalone deployment script for DataIntegrity contract
 * Works with minimal dependencies
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Try to use ethers if available, otherwise use web3
let ethers;
try {
  ethers = require('ethers');
} catch (e) {
  console.error('❌ ethers.js not found. Please run: npm install ethers');
  process.exit(1);
}

const RELTIME_RPC = process.env.RELTIME_RPC_URL || 'https://mainnet.reltime.com/';
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const CONTRACT_ADDRESS_ENV = process.env.CONTRACT_ADDRESS;

if (!PRIVATE_KEY) {
  console.error('❌ DEPLOYER_PRIVATE_KEY not set in .env');
  process.exit(1);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  COMFORTage T3.3 — Deploying DataIntegrity Contract');
  console.log('  Network: Reltime Mainnet (Chain ID: 32323)');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // Setup provider and signer
    const provider = new ethers.JsonRpcProvider(RELTIME_RPC, {
      name: 'reltime-mainnet',
      chainId: 32323,
    });

    const signer = new ethers.Wallet(PRIVATE_KEY, provider);
    console.log('✅ Signer address:', signer.address);

    // Get balance
    const balance = await provider.getBalance(signer.address);
    console.log('✅ Account balance:', ethers.formatEther(balance), 'ETH\n');

    // Verify network
    const network = await provider.getNetwork();
    console.log('✅ Network: Chain ID', network.chainId);
    const blockNumber = await provider.getBlockNumber();
    console.log('✅ Current block:', blockNumber, '\n');

    // Load contract artifact
    const artifactPath = path.join(__dirname, '/artifacts/contracts/DataIntegrity.sol/DataIntegrity.json');
    if (!fs.existsSync(artifactPath)) {
      console.error('❌ Contract artifact not found at:', artifactPath);
      console.error('   Run: npm run compile');
      process.exit(1);
    }

    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

    // Deploy contract
    console.log('🚀 Deploying DataIntegrity...');
    const Contract = new ethers.ContractFactory(
      artifact.abi,
      artifact.bytecode,
      signer
    );

    const contract = await Contract.deploy(signer.address, {
      gasPrice: 0,
      gasLimit: 10000000,
    });

    await contract.waitForDeployment();
    const contractAddress = await contract.getAddress();

    console.log('\n✅ DataIntegrity deployed!');
    console.log('   Address:', contractAddress);
    console.log('   Tx Hash:', contract.deploymentTransaction()?.hash);

    // Verify deployment
    console.log('\n🔍 Verifying deployment...');
    const code = await provider.getCode(contractAddress);
    if (code === '0x') {
      console.error('❌ No contract code found at address');
      process.exit(1);
    }
    console.log('✅ Contract verified at:', contractAddress);
    console.log('   Bytecode length:', code.length, 'chars');

    // Test basic function
    const totalRecords = await contract.totalRecords();
    console.log('✅ Total records:', totalRecords.toString());

    console.log('\n📋 IMPORTANT: Update your .env file with:');
    console.log(`   CONTRACT_ADDRESS=${contractAddress}`);

    console.log('\n✅ Deployment successful!\n');

  } catch (error) {
    console.error('\n❌ Deployment failed:', error.message);
    if (error.code === 'ETIMEDOUT') {
      console.error('   Network timeout - check your connection to Reltime RPC');
    }
    process.exit(1);
  }
}

main();
