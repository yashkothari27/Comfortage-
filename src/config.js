require("dotenv").config();

module.exports = {
  // Server
  port: parseInt(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || "development",

  // Reltime Blockchain
  blockchain: {
    rpcUrl: process.env.RELTIME_RPC_URL || "https://mainnet.reltime.com/",
    chainId: parseInt(process.env.RELTIME_CHAIN_ID) || 32323,
    contractAddress: process.env.CONTRACT_ADDRESS,
    privateKey: process.env.DEPLOYER_PRIVATE_KEY,
    gasPrice: 0,       // Reltime = zero gas fees
    gasLimit: 5000000,
  },

  // Auth
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: "24h",
  },

  // CORS
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",")
    : ["*"],

  // Logging
  logLevel: process.env.LOG_LEVEL || "info",
};
