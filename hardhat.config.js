// Hardhat config with toolbox for testing
require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    reltime_mainnet: {
      url: process.env.RELTIME_RPC_URL || "https://mainnet.reltime.com/",
      chainId: 32323,
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
      gasPrice: 0,
      gas: 10000000,
      timeout: 60000,
    },
    hardhat: {
      chainId: 32323,
      gasPrice: 0,
      initialBaseFeePerGas: 0,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};