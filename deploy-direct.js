require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  COMFORTage T3.3 — Deploying DataIntegrity Contract');
  console.log('  Network: Reltime Mainnet (Chain ID: 32323)');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // Setup provider and signer
    const rpcUrl = process.env.RELTIME_RPC_URL || 'https://mainnet.reltime.com/';
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;

    if (!privateKey) {
      throw new Error('DEPLOYER_PRIVATE_KEY not set in .env');
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl, {
      name: 'reltime-mainnet',
      chainId: 32323,
    });

    const signer = new ethers.Wallet(privateKey, provider);
    console.log('Deployer address:', signer.address);

    const balance = await provider.getBalance(signer.address);
    console.log('Deployer balance:', ethers.formatEther(balance), 'ETH\n');

    // Verify network
    const network = await provider.getNetwork();
    console.log('Network Chain ID:', network.chainId);
    const blockNumber = await provider.getBlockNumber();
    console.log('Current block:', blockNumber, '\n');

    // Load contract artifact
    const artifactPath = path.join(__dirname, '../artifacts/contracts/DataIntegrity.sol/DataIntegrity.json');
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

    // Deploy
    console.log('Deploying DataIntegrity...');
    const ContractFactory = new ethers.ContractFactory(
      artifact.abi,
      artifact.bytecode,
      signer
    );

    const contract = await ContractFactory.deploy(signer.address, {
      gasPrice: 0,
      gasLimit: 10000000,
    });

    await contract.waitForDeployment();
    const contractAddress = await contract.getAddress();

    console.log('\n✅ DataIntegrity deployed to:', contractAddress);
    console.log('\n──────────────────────────────────────────────────────');
    console.log('  IMPORTANT: Update your .env file:');
    console.log(`  CONTRACT_ADDRESS=${contractAddress}`);
    console.log('──────────────────────────────────────────────────────');

    // Grant roles if addresses provided
    const VALIDATOR_ADDRESS = process.env.VALIDATOR_ADDRESS;
    if (VALIDATOR_ADDRESS) {
      console.log('\nGranting VALIDATOR_ROLE to:', VALIDATOR_ADDRESS);
      const VALIDATOR_ROLE = await contract.VALIDATOR_ROLE();
      const tx = await contract.grantRole(VALIDATOR_ROLE, VALIDATOR_ADDRESS, {
        gasPrice: 0,
      });
      await tx.wait();
      console.log('✅ VALIDATOR_ROLE granted.');
    }

    const INGESTION_ADDRESS = process.env.INGESTION_ADDRESS;
    if (INGESTION_ADDRESS) {
      console.log('Granting INGESTION_ROLE to:', INGESTION_ADDRESS);
      const INGESTION_ROLE = await contract.INGESTION_ROLE();
      const tx = await contract.grantRole(INGESTION_ROLE, INGESTION_ADDRESS, {
        gasPrice: 0,
      });
      await tx.wait();
      console.log('✅ INGESTION_ROLE granted.');
    }

    console.log('\n🎉 Deployment complete!\n');

    // Return contract address
    return contractAddress;

  } catch (error) {
    console.error('\n❌ Deployment failed:', error.message);
    process.exit(1);
  }
}

main();
