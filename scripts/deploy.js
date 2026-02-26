require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  COMFORTage T3.3 — Deploying DataIntegrity Contract');
  console.log('  Network: Reltime Mainnet (Chain ID: 32323)');
  console.log('═══════════════════════════════════════════════════════\n');

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

  const deployer = new ethers.Wallet(privateKey, provider);
  console.log("Deployer address:", deployer.address);

  const balance = await provider.getBalance(deployer.address);
  console.log("Deployer balance:", ethers.formatEther(balance), "ETH\n");

  // Verify network
  const network = await provider.getNetwork();
  console.log("Network Chain ID:", network.chainId);
  const blockNumber = await provider.getBlockNumber();
  console.log("Current block:", blockNumber, "\n");

  // Deploy
  console.log("Deploying DataIntegrity...");
  const artifactPath = path.join(__dirname, '../artifacts/contracts/DataIntegrity.sol/DataIntegrity.json');
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

  const ContractFactory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    deployer
  );

  // Reltime has zero gas fees — use explicit gasPrice: 0
  const contract = await ContractFactory.deploy(deployer.address, {
    gasPrice: 0,
    gasLimit: 10000000,
  });

  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();

  console.log("\n✅ DataIntegrity deployed to:", contractAddress);
  console.log("\n──────────────────────────────────────────────────────");
  console.log("  IMPORTANT: Update your .env file:");
  console.log(`  CONTRACT_ADDRESS=${contractAddress}`);
  console.log("──────────────────────────────────────────────────────");

  // Grant roles to the DataIntegrityValidator service account
  // (You will set this address for T3.4's service account)
  const VALIDATOR_ADDRESS = process.env.VALIDATOR_ADDRESS;
  if (VALIDATOR_ADDRESS) {
    console.log("\nGranting VALIDATOR_ROLE to:", VALIDATOR_ADDRESS);
    const VALIDATOR_ROLE = await contract.VALIDATOR_ROLE();
    const tx = await contract.grantRole(VALIDATOR_ROLE, VALIDATOR_ADDRESS, {
      gasPrice: 0,
    });
    await tx.wait();
    console.log("✅ VALIDATOR_ROLE granted.");
  }

  const INGESTION_ADDRESS = process.env.INGESTION_ADDRESS;
  if (INGESTION_ADDRESS) {
    console.log("Granting INGESTION_ROLE to:", INGESTION_ADDRESS);
    const INGESTION_ROLE = await contract.INGESTION_ROLE();
    const tx = await contract.grantRole(INGESTION_ROLE, INGESTION_ADDRESS, {
      gasPrice: 0,
    });
    await tx.wait();
    console.log("✅ INGESTION_ROLE granted.");
  }

  console.log("\n🎉 Deployment complete!\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });