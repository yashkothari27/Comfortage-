# COMFORTage T3.3 — Blockchain Data Integrity Service

**Reltime Mainnet Implementation** (Chain ID: 32323, PoA, Zero Gas Fees)

A secure, blockchain-based service for storing and verifying dataset hashes on the Reltime blockchain. Part of the COMFORTage ecosystem's data integrity layer (T3.3/T3.4).

## Overview

This service:
- **Stores** dataset hashes on-chain via the DataIntegrity smart contract
- **Validates** data integrity by comparing computed hashes against stored records
- **Tracks** hash history for dataset versioning
- **Provides** a REST API for integration with T3.1 (ingestion) and T3.4 (validation)

### Key Features

✅ **Zero Gas Fees** — Reltime is a PoA chain with no transaction costs  
✅ **Role-Based Access** — INGESTION_ROLE, VALIDATOR_ROLE  
✅ **Hash Versioning** — Track dataset evolution  
✅ **JWT Authentication** — Secure API endpoints  
✅ **Docker Ready** — Pre-configured for containerization  

---

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Compile Smart Contracts
```bash
npm run compile
```

Artifacts will be generated in `./artifacts/contracts/DataIntegrity.sol/`

### 3. Configure Environment
```bash
cp .env.example .env
```

Edit `.env` with your Reltime credentials:
```env
RELTIME_RPC_URL=https://mainnet.reltime.com/
RELTIME_CHAIN_ID=32323
DEPLOYER_PRIVATE_KEY=your_private_key_here (without 0x)
CONTRACT_ADDRESS=0x... (after deployment)
JWT_SECRET=your_very_long_random_secret_here
```

### 4. Deploy to Reltime Mainnet
```bash
npm run deploy
```

Copy the deployed contract address to your `.env`:
```env
CONTRACT_ADDRESS=0x...
```

### 5. Generate API Token
```bash
node -e "require('./src/middleware/auth').generateToken('t34-validator')"
```

Copy the token for use in API requests.

### 6. Start the API Server
```bash
npm start       # Production
npm run dev     # Development with hot reload
```

Health check: `http://localhost:3000/health`

---

## Project Structure

```
comfortage-t33-blockchain/
├── contracts/
│   └── DataIntegrity.sol              # Main smart contract
├── scripts/
│   ├── deploy.js                      # Deployment script
│   └── verify-deployment.js           # Verification script
├── src/
│   ├── server.js                      # Express API server
│   ├── config.js                      # Configuration management
│   ├── logger.js                      # Winston logging
│   ├── middleware/
│   │   └── auth.js                   # JWT authentication
│   ├── routes/
│   │   └── hashRoutes.js             # REST API routes
│   └── services/
│       └── blockchainService.js      # Blockchain interaction
├── test/
│   └── DataIntegrity.test.js         # Contract tests
├── logs/                              # Application logs
├── hardhat.config.js                  # Hardhat config for Reltime
├── package.json
├── .env.example
├── Dockerfile
└── docker-compose.yml
```

---

## API Reference

### Health Check (No Auth Required)
```http
GET /health
```

Response:
```json
{
  "status": "healthy",
  "chain": "Reltime Mainnet",
  "chainId": 32323,
  "currentBlock": 12345,
  "contractAddress": "0x...",
  "totalRecords": 0
}
```

### Store Hash (Requires JWT)
```http
POST /api/v1/hash
Authorization: Bearer <token>
Content-Type: application/json

{
  "datasetId": "DS-PILOT-001",
  "hash": "0x1234567890abcdef...",
  "metadataCID": "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco"
}
```

### Retrieve Hash
```http
GET /api/v1/hash/:datasetId
Authorization: Bearer <token>
```

### Update Hash
```http
PUT /api/v1/hash/:datasetId
Authorization: Bearer <token>
Content-Type: application/json

{
  "hash": "0x...",
  "metadataCID": "QmXoy..."
}
```

### Validate Hash (With On-Chain Audit Event)
```http
POST /api/v1/hash/validate
Authorization: Bearer <token>
Content-Type: application/json

{
  "datasetId": "DS-PILOT-001",
  "hash": "0x..."
}
```

### Quick Hash Check (Read-Only, No Event)
```http
GET /api/v1/hash/check/:datasetId/:hash
Authorization: Bearer <token>
```

### Get Hash History
```http
GET /api/v1/hash/history/:datasetId
Authorization: Bearer <token>
```

---

## Development

### Run Tests
```bash
npm test
```

### Run in Development Mode
```bash
npm run dev
```

Watches files in `src/` and restarts on changes.

### Docker Deployment
```bash
docker-compose up
```

---

## Smart Contract Functions

### Store Hash
```solidity
function storeHash(
  string calldata datasetId,
  bytes32 datasetHash,
  string calldata metadataCID
) external onlyRole(INGESTION_ROLE)
```

### Get Hash
```solidity
function getHash(string calldata datasetId) external view returns (
  bytes32 datasetHash,
  uint256 timestamp,
  address submitter,
  string memory metadataCID
)
```

### Validate Hash
```solidity
function validateHash(
  string calldata datasetId,
  bytes32 hashToValidate
) external onlyRole(VALIDATOR_ROLE) returns (bool isValid)
```

### Update Hash
```solidity
function updateHash(
  string calldata datasetId,
  bytes32 newHash,
  string calldata metadataCID
) external onlyRole(INGESTION_ROLE)
```

### Get Hash History
```solidity
function getHashHistory(string calldata datasetId) 
  external view returns (bytes32[] memory)
```

---

## Role-Based Access Control (RBAC)

- **DEFAULT_ADMIN_ROLE** — Contract admin (deployment, pause/unpause)
- **INGESTION_ROLE** — Can store and update hashes (T3.1)
- **VALIDATOR_ROLE** — Can validate hashes and emit audit events (T3.4)

Grant a role:
```bash
npx hardhat run -c scripts/grant-role.js --network reltime_mainnet
```

---

## Security Features

✅ **OpenZeppelin AccessControl** — Role-based access management  
✅ **ReentrancyGuard** — Protection against reentrancy attacks  
✅ **Pausable** — Emergency pause mechanism  
✅ **JWT Authentication** — Secure API endpoints  
✅ **Helmet.js** — HTTP security headers  
✅ **CORS Configuration** — Restricted origin access  
✅ **Rate Limiting** — 100 requests/minute per IP  
✅ **Input Validation** — Express-validator for all inputs  

---

## Logging

Logs are written to:
- **Console** — Color-coded output
- **logs/error.log** — Error messages only
- **logs/combined.log** — All logs

Log level is configurable via `LOG_LEVEL` env var.

---

## Troubleshooting

### Contract Not Found
```
Error: No contract found at 0x...
```
**Solution:** Ensure `CONTRACT_ADDRESS` in `.env` matches deployed contract.

### Unauthorized
```
401: Authentication required
```
**Solution:** Include `Authorization: Bearer <token>` header in requests.

### Dataset Already Exists
```
409: Dataset already exists. Use PUT to update.
```
**Solution:** Use PUT endpoint to update existing hashes.

---

## Integration with COMFORTage

- **T3.1 Ingestion** → Uses POST/PUT endpoints to store dataset hashes
- **T3.4 Validator** → Uses GET/POST validate endpoints to verify integrity
- **T3.5 Storage** → References IPFS CID in metadataCID field

---

## License

MIT

---

## Support

For issues and questions:
1. Check `.env.example` for configuration requirements
2. Review API documentation above
3. Check logs in `logs/` directory
4. Verify contract deployment with `npm run verify-deploy`
# Comfortage-
