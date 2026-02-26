- [x] Verify that the copilot-instructions.md file in the .github directory is created.

- [x] Clarify Project Requirements
  - Project type: Blockchain - COMFORTage T3.3 Data Integrity service
  - Frontend: None (API-only backend)
  - Chain: Reltime Mainnet (PoA, zero gas fees)

- [x] Scaffold the Project
  - Created contracts: DataIntegrity.sol (main contract)
  - Created backend services in src/:
    - server.js: Express API server
    - config.js: Configuration management
    - logger.js: Winston logging
    - middleware/auth.js: JWT authentication
    - routes/hashRoutes.js: REST API routes
    - services/blockchainService.js: Blockchain interaction layer
  - Created deployment scripts: deploy.js, verify-deployment.js
  - Created test suite: DataIntegrity.test.js
  - Created Docker configuration: Dockerfile, docker-compose.yml
  - Created environment config: .env.example

- [x] Customize the Project
  - Configured Hardhat for Reltime Mainnet (zero gas PoA chain)
  - Set up ethers v6 with provider/signer pattern
  - Implemented role-based access control (INGESTION_ROLE, VALIDATOR_ROLE)
  - Added OpenZeppelin contracts for security

- [x] Install Required Extensions
  - No extensions specified

- [ ] Compile the Project
  - Run: npm install
  - Then: npm run compile
  - Verify artifacts in ./artifacts/contracts/DataIntegrity.sol/

- [ ] Create and Run Task
  - Use "npm run dev" for development with nodemon
  - Use "npm start" for production
  - Use "npm test" to run Hardhat tests
  - Tasks created in VS Code for build and development

- [ ] Launch the Project
  - Create .env file from .env.example with your Reltime credentials
  - For API server: npm start
  - For development: npm run dev
  - Health check: http://localhost:3000/health

- [ ] Ensure Documentation is Complete
  - Updated README.md with new project structure
  - This file reflects current completion status
---

## Project Structure

comfortage-t33-blockchain/
├── contracts/
│   ├── DataIntegrity.sol          (Main smart contract)
│   └── ComfortageT33.sol          (Legacy - can be removed)
├── scripts/
│   ├── deploy.js                  (Deploy DataIntegrity to Reltime)
│   └── verify-deployment.js       (Verify deployment status)
├── src/
│   ├── server.js                  (Express API entry point)
│   ├── config.js                  (Configuration management)
│   ├── logger.js                  (Winston logging)
│   ├── middleware/
│   │   └── auth.js               (JWT authentication)
│   ├── routes/
│   │   └── hashRoutes.js         (REST API v1 routes)
│   └── services/
│       └── blockchainService.js  (Blockchain service)
├── test/
│   ├── DataIntegrity.test.js     (Main contract tests)
│   └── ComfortageT33.test.js     (Legacy - can be removed)
├── logs/                          (Application logs)
├── hardhat.config.js              (Hardhat configuration for Reltime)
├── package.json                   (Dependencies and scripts)
├── .env.example                   (Environment template)
├── Dockerfile                     (Docker container configuration)
├── docker-compose.yml             (Docker Compose setup)
├── README.md                      (Project documentation)
└── .gitignore                     (Git ignore rules)

## Key Features

- **DataIntegrity Contract**
  - Store SHA-256 hashes of datasets on-chain
  - Verify data integrity (tamper detection)
  - Hash versioning for dataset evolution tracking
  - Role-based access (INGESTION_ROLE, VALIDATOR_ROLE)
  - Zero gas fees (Reltime PoA network)

- **REST API** (src/server.js)
  - Health check endpoint: GET /health
  - Store hash: POST /api/v1/hash
  - Retrieve hash: GET /api/v1/hash/:datasetId
  - Update hash: PUT /api/v1/hash/:datasetId
  - Validate: POST /api/v1/hash/validate
  - Quick check: GET /api/v1/hash/check/:datasetId/:hash
  - Version history: GET /api/v1/hash/history/:datasetId

- **Security**
  - JWT authentication for all API endpoints (except /health)
  - Rate limiting (100 requests per minute)
  - Helmet for HTTP security headers
  - CORS configuration
  - Input validation using express-validator

## Next Steps

1. **Install Dependencies**: Run `npm install`
2. **Compile Contracts**: Run `npm run compile`
3. **Configure Environment**: Copy .env.example to .env and add credentials
4. **Deploy Contract**: Run `npm run deploy --network reltime_mainnet`
5. **Generate Token**: `node -e "require('./src/middleware/auth').generateToken('t34-validator')"`
6. **Start Server**: `npm start` or `npm run dev` for development
7. **Docker**: `docker-compose up` to run in container
