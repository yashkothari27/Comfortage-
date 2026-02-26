require("dotenv").config();
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Verifying deployment on Reltime Mainnet...\n");

  const provider = new ethers.JsonRpcProvider(
    process.env.RELTIME_RPC_URL,
    {
      name: "reltime-mainnet",
      chainId: 32323,
    }
  );

  // Verify chain connection
  const network = await provider.getNetwork();
  console.log("Connected to chain ID:", network.chainId.toString());

  const blockNumber = await provider.getBlockNumber();
  console.log("Current block number:", blockNumber);

  // Verify contract
  const contractAddress = process.env.CONTRACT_ADDRESS;
  if (!contractAddress) {
    console.error("CONTRACT_ADDRESS not set in .env");
    process.exit(1);
  }

  const code = await provider.getCode(contractAddress);
  if (code === "0x") {
    console.error("❌ No contract found at", contractAddress);
    process.exit(1);
  }

  console.log("✅ Contract verified at:", contractAddress);
  console.log("   Bytecode length:", code.length, "chars");

  // Quick functional test
  const artifactPath = path.join(
    __dirname,
    "../artifacts/contracts/DataIntegrity.sol/DataIntegrity.json"
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  const contract = new ethers.Contract(contractAddress, artifact.abi, provider);
  const totalRecords = await contract.totalRecords();
  console.log("   Total records:", totalRecords.toString());

  console.log("\n✅ Deployment verification complete!");
}

main().catch(console.error);
