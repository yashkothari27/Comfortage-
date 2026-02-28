/**
 * OpenAPI/Swagger 3.0 specification for DataIntegrity API
 * COMFORTage T3.3 - Blockchain Data Integrity Service on Reltime Mainnet
 */

const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'DataIntegrity API',
    version: '1.0.0',
    'x-logo': {
      url: '/comfortage-logo.svg',
      altText: 'COMFORTage Logo',
    },
    description: `
COMFORTage T3.3 — Blockchain Data Integrity Service

**Purpose**: Store and validate dataset hashes on Reltime Mainnet for data integrity verification by T3.4 DataIntegrityValidator.

**Chain**: Reltime Mainnet (PoA, Chain ID 32323, zero gas fees)
**Contract**: 0x546C149cD65D369c5E9047ebeBeBB6c56898f15B

**Key Features**:
- Store SHA-256 dataset hashes on-chain
- Versioned hash history tracking
- Role-based access control (INGESTION_ROLE, VALIDATOR_ROLE)
- Audit events for all validations
- JWT authentication for all endpoints
- No personal data stored on-chain

## 🔐 Authentication

All endpoints (except /health) require JWT token in \`Authorization: Bearer <token>\` header.

### Generate Your Token

Run this command to create a JWT token:

\`\`\`bash
node -e "require('./src/middleware/auth').generateToken('my-service')"
\`\`\`

**Replace 'my-service' with your service name.**

The output will be:
\`\`\`
═══ Service Token ═══
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzZXJ2aWNlSWQiOiJteS1zZXJ2aWNlIi...
═════════════════════
\`\`\`

Copy the token (between the === lines) and use it in requests:
\`\`\`
Authorization: Bearer YOUR_TOKEN_HERE
\`\`\`
    `,
    contact: {
      name: 'COMFORTage Team',
      url: 'https://comfortage.example.com',
    },
    license: {
      name: 'MIT',
    },
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Local Development',
    },
    {
      url: 'https://api.comfortage-t34.example.com',
      description: 'Production',
    },
  ],
  tags: [
    {
      name: 'Authentication',
      description: `Generate JWT tokens for API access and download Postman collection.

**Quick Start:**
1. Download the pre-configured Postman collection from the **Download Postman Collection** endpoint below
2. Import it into Postman
3. Generate a token: \`node -e "require('./src/middleware/auth').generateToken('my-service')"\`
4. Set the token in your Postman collection's Authorization header
5. Start testing all endpoints immediately

**Generate Token Command:**
\`\`\`bash
node -e "require('./src/middleware/auth').generateToken('my-service')"
\`\`\`

Copy the token output and use it in the "Authorize" button at the top right of Swagger, or paste it into Postman collection headers.`,
    },
    {
      name: 'Health',
      description: 'Service health and status (no auth required)',
    },
    {
      name: 'Hash Storage',
      description: 'Store and update dataset hashes',
    },
    {
      name: 'Hash Retrieval',
      description: 'Query stored hashes and history',
    },
    {
      name: 'Validation',
      description: 'Validate data integrity and check tamper detection',
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: `JWT token generated for service account.

**How to get your token:**

1. Run this command in your terminal:
\`\`\`bash
node -e "require('./src/middleware/auth').generateToken('my-service')"
\`\`\`

2. Copy the token output (the long string between === lines)

3. Paste it here when you click the "Authorize" button

**Example token format:**
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzZXJ2aWNlSWQiOiJteS1zZXJ2aWNlIiwicm9sZSI6InZhbGlkYXRvciIsImlhdCI6MTc3MjEzMDI2OCwiZXhwIjoxODAzNjY2MjY4fQ...`,
      },
    },
    schemas: {
      // ────── Error Schemas ──────
      Error: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: false,
          },
          error: {
            type: 'string',
            example: 'Failed to store hash on blockchain',
          },
          detail: {
            type: 'string',
            example: 'Error message details',
          },
        },
      },
      ValidationError: {
        type: 'object',
        properties: {
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                msg: {
                  type: 'string',
                },
                param: {
                  type: 'string',
                },
              },
            },
          },
        },
      },

      // ────── Health Schema ──────
      HealthStatus: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['healthy', 'checking'],
            example: 'healthy',
            description: 'Service health status',
          },
          chain: {
            type: 'string',
            example: 'Reltime Mainnet',
            description: 'Connected blockchain network',
          },
          chainId: {
            type: 'integer',
            example: 32323,
            description: 'Blockchain chain ID',
          },
          currentBlock: {
            type: 'integer',
            example: 37171101,
            description: 'Latest block number',
          },
          contractAddress: {
            type: 'string',
            example: '0x546C149cD65D369c5E9047ebeBeBB6c56898f15B',
            description: 'Deployed DataIntegrity contract address',
          },
          totalRecords: {
            type: 'integer',
            example: 42,
            description: 'Total number of stored dataset hashes',
          },
          rpcUrl: {
            type: 'string',
            example: 'https://mainnet.reltime.com/',
            description: 'RPC endpoint URL',
          },
        },
      },

      // ────── Request Schemas ──────
      StoreHashRequest: {
        type: 'object',
        required: ['datasetId', 'hash'],
        properties: {
          datasetId: {
            type: 'string',
            example: 'DS-PILOT-001',
            description: 'Unique identifier for the dataset',
          },
          hash: {
            type: 'string',
            pattern: '^(0x)?[a-fA-F0-9]{64}$',
            example: '0x3c59dc048e8850243be8079a5c74d079934b91d7321b8e09f8ce1fde91baa2ae',
            description: 'SHA-256 hash of dataset content (64 hex chars)',
          },
          metadataCID: {
            type: 'string',
            example: 'QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco',
            description: 'Optional IPFS CID of metadata',
          },
        },
      },

      UpdateHashRequest: {
        type: 'object',
        required: ['hash'],
        properties: {
          hash: {
            type: 'string',
            pattern: '^(0x)?[a-fA-F0-9]{64}$',
            example: '0x3c59dc048e8850243be8079a5c74d079934b91d7321b8e09f8ce1fde91baa2ae',
            description: 'New SHA-256 hash of updated dataset',
          },
          metadataCID: {
            type: 'string',
            example: 'QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco',
            description: 'Optional updated IPFS CID of metadata',
          },
        },
      },

      ValidateHashRequest: {
        type: 'object',
        required: ['datasetId', 'hash'],
        properties: {
          datasetId: {
            type: 'string',
            example: 'DS-PILOT-001',
            description: 'Dataset identifier',
          },
          hash: {
            type: 'string',
            pattern: '^(0x)?[a-fA-F0-9]{64}$',
            example: '0x3c59dc048e8850243be8079a5c74d079934b91d7321b8e09f8ce1fde91baa2ae',
            description: 'Hash to validate against stored hash',
          },
        },
      },

      // ────── Response Schemas ──────
      HashRecord: {
        type: 'object',
        properties: {
          datasetId: {
            type: 'string',
            example: 'DS-PILOT-001',
          },
          hash: {
            type: 'string',
            example: '0x3c59dc048e8850243be8079a5c74d079934b91d7321b8e09f8ce1fde91baa2ae',
          },
          metadataCID: {
            type: 'string',
            example: 'QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco',
          },
          storedAt: {
            type: 'string',
            format: 'date-time',
            example: '2026-02-27T14:30:00Z',
          },
          blockNumber: {
            type: 'integer',
            example: 37171102,
          },
          transactionHash: {
            type: 'string',
            example: '0xabc123def456...',
          },
        },
      },

      StoreHashResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true,
          },
          message: {
            type: 'string',
            example: 'Hash stored on Reltime blockchain',
          },
          data: {
            type: 'object',
            properties: {
              datasetId: {
                type: 'string',
                example: 'DS-PILOT-001',
              },
              hash: {
                type: 'string',
                example: '0x3c59dc048e8850243be8079a5c74d079934b91d7321b8e09f8ce1fde91baa2ae',
              },
              blockNumber: {
                type: 'integer',
                example: 37171102,
              },
              transactionHash: {
                type: 'string',
                example: '0xabc123def456...',
              },
            },
          },
        },
      },

      ValidateHashResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true,
          },
          data: {
            type: 'object',
            properties: {
              datasetId: {
                type: 'string',
                example: 'DS-PILOT-001',
              },
              isValid: {
                type: 'boolean',
                example: true,
                description: 'True if provided hash matches stored hash',
              },
              storedHash: {
                type: 'string',
                example: '0x3c59dc048e8850243be8079a5c74d079934b91d7321b8e09f8ce1fde91baa2ae',
              },
              providedHash: {
                type: 'string',
                example: '0x3c59dc048e8850243be8079a5c74d079934b91d7321b8e09f8ce1fde91baa2ae',
              },
              auditEventBlockNumber: {
                type: 'integer',
                example: 37171103,
                description: 'Block where validation audit event was recorded',
              },
              timestamp: {
                type: 'string',
                format: 'date-time',
              },
            },
          },
        },
      },

      CheckIntegrityResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true,
          },
          data: {
            type: 'object',
            properties: {
              datasetId: {
                type: 'string',
                example: 'DS-PILOT-001',
              },
              isIntact: {
                type: 'boolean',
                example: true,
                description: 'True if hash matches, indicating data integrity',
              },
              recordedHash: {
                type: 'string',
                example: '0x3c59dc048e8850243be8079a5c74d079934b91d7321b8e09f8ce1fde91baa2ae',
              },
              timestamp: {
                type: 'string',
                format: 'date-time',
              },
            },
          },
        },
      },

      HashHistoryResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true,
          },
          data: {
            type: 'object',
            properties: {
              datasetId: {
                type: 'string',
                example: 'DS-PILOT-001',
              },
              currentHash: {
                type: 'string',
                example: '0x3c59dc048e8850243be8079a5c74d079934b91d7321b8e09f8ce1fde91baa2ae',
              },
              historyCount: {
                type: 'integer',
                example: 3,
              },
              history: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    hash: {
                      type: 'string',
                    },
                    storedAt: {
                      type: 'string',
                      format: 'date-time',
                    },
                    blockNumber: {
                      type: 'integer',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },

  paths: {
    // ════════════════════════════════════════════════════════════════
    // HEALTH (NO AUTH)
    // ════════════════════════════════════════════════════════════════
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Get service health status',
        description: 'Check if the API and blockchain connection are operational. No authentication required.',
        operationId: 'getHealth',
        responses: {
          '200': {
            description: 'Service is healthy',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/HealthStatus',
                },
              },
            },
          },
          '503': {
            description: 'Service is unhealthy',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/HealthStatus',
                },
              },
            },
          },
        },
      },
    },

    // ════════════════════════════════════════════════════════════════
    // POSTMAN COLLECTION (NO AUTH)
    // ════════════════════════════════════════════════════════════════
    '/postman-collection.json': {
      get: {
        tags: ['Authentication'],
        summary: 'Download Postman Collection',
        description: `Download a pre-configured Postman collection for testing all API endpoints.

**Features:**
- All 7 endpoints pre-configured
- Authorization variables set up
- Base URL and dataset ID variables
- Ready to import into Postman, Insomnia, or other tools
- Everything configured, just set your JWT token

**How to use:**
1. Click "Download" button below (or GET this endpoint)
2. Open Postman
3. Go to File → Import
4. Select the downloaded file
5. Set your JWT token in the Authorization section
6. Test endpoints immediately!

**File includes:**
✓ All endpoints with examples
✓ Pre-configured request bodies
✓ Environment variables (base_url, jwt_token, dataset_id)
✓ Error test cases
✓ Success workflows`,
        operationId: 'downloadPostmanCollection',
        responses: {
          '200': {
            description: 'Postman collection file downloaded successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  description: 'Postman collection in v2.1.0 format',
                },
              },
            },
          },
          '404': {
            description: 'Collection file not found',
          },
          '500': {
            description: 'Server error',
          },
        },
      },
    },

    // ════════════════════════════════════════════════════════════════
    // HASH STORAGE
    // ════════════════════════════════════════════════════════════════
    '/api/v1/hash': {
      post: {
        tags: ['Hash Storage'],
        summary: 'Store a new dataset hash',
        description: `
Store a SHA-256 hash of a dataset on Reltime Mainnet.
- Requires INGESTION_ROLE on-chain
- Prevents duplicate dataset IDs
- Records metadata CID optionally
- Emits DatasetStored event on-chain
        `,
        operationId: 'storeHash',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/StoreHashRequest',
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Hash successfully stored on blockchain',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/StoreHashResponse',
                },
              },
            },
          },
          '400': {
            description: 'Invalid request - validation failed',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ValidationError',
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized - missing or invalid token',
          },
          '409': {
            description: 'Conflict - Dataset already exists. Use PUT to update.',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
              },
            },
          },
          '500': {
            description: 'Server error',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
              },
            },
          },
        },
        examples: {
          'Store new dataset hash': {
            value: {
              datasetId: 'DS-PILOT-001',
              hash: '0x3c59dc048e8850243be8079a5c74d079934b91d7321b8e09f8ce1fde91baa2ae',
              metadataCID: 'QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco',
            },
          },
        },
      },
    },

    // ════════════════════════════════════════════════════════════════
    // HASH RETRIEVAL
    // ════════════════════════════════════════════════════════════════
    '/api/v1/hash/{datasetId}': {
      get: {
        tags: ['Hash Retrieval'],
        summary: 'Retrieve stored hash for a dataset',
        description: 'Get the current stored hash and metadata for a dataset.',
        operationId: 'getHash',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'datasetId',
            in: 'path',
            required: true,
            description: 'Dataset identifier',
            schema: {
              type: 'string',
              example: 'DS-PILOT-001',
            },
          },
        ],
        responses: {
          '200': {
            description: 'Hash record found',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: {
                      type: 'boolean',
                      example: true,
                    },
                    data: {
                      $ref: '#/components/schemas/HashRecord',
                    },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized - missing or invalid token',
          },
          '404': {
            description: 'Dataset not found on blockchain',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
              },
            },
          },
          '500': {
            description: 'Server error',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
              },
            },
          },
        },
      },

      put: {
        tags: ['Hash Storage'],
        summary: 'Update hash for a dataset',
        description: `
Update the SHA-256 hash for an existing dataset.
- Requires INGESTION_ROLE on-chain
- Dataset must already exist (use POST to create)
- Maintains full history of previous hashes
- Emits HashUpdated event on-chain
        `,
        operationId: 'updateHash',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'datasetId',
            in: 'path',
            required: true,
            description: 'Dataset identifier',
            schema: {
              type: 'string',
              example: 'DS-PILOT-001',
            },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/UpdateHashRequest',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Hash successfully updated',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/StoreHashResponse',
                },
              },
            },
          },
          '400': {
            description: 'Invalid request',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ValidationError',
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
          },
          '404': {
            description: 'Dataset not found. Use POST to create.',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
              },
            },
          },
          '500': {
            description: 'Server error',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
              },
            },
          },
        },
      },
    },

    // ════════════════════════════════════════════════════════════════
    // VALIDATION
    // ════════════════════════════════════════════════════════════════
    '/api/v1/hash/validate': {
      post: {
        tags: ['Validation'],
        summary: 'Validate data integrity with audit event',
        description: `
Validate if provided hash matches stored hash.
- Requires VALIDATOR_ROLE on-chain
- Records on-chain audit event regardless of match result
- Used by T3.4 DataIntegrityValidator for validation workflow
- Emits ValidationAudit event containing validator ID and result
        `,
        operationId: 'validateHash',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ValidateHashRequest',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Validation completed and recorded on-chain',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ValidateHashResponse',
                },
              },
            },
          },
          '400': {
            description: 'Invalid request',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ValidationError',
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
          },
          '500': {
            description: 'Server error',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
              },
            },
          },
        },
      },
    },

    '/api/v1/hash/check/{datasetId}/{hash}': {
      get: {
        tags: ['Validation'],
        summary: 'Quick integrity check (read-only)',
        description: `
Quick check if provided hash matches stored hash.
- No on-chain transaction (read-only state query)
- Does NOT record audit event
- Use for rapid validation without blockchain latency
- Compare with /validate endpoint which records on-chain
        `,
        operationId: 'checkIntegrity',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'datasetId',
            in: 'path',
            required: true,
            description: 'Dataset identifier',
            schema: {
              type: 'string',
              example: 'DS-PILOT-001',
            },
          },
          {
            name: 'hash',
            in: 'path',
            required: true,
            description: 'Hash to check (64 hex chars)',
            schema: {
              type: 'string',
              pattern: '^(0x)?[a-fA-F0-9]{64}$',
              example: '0x3c59dc048e8850243be8079a5c74d079934b91d7321b8e09f8ce1fde91baa2ae',
            },
          },
        ],
        responses: {
          '200': {
            description: 'Integrity check completed',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/CheckIntegrityResponse',
                },
              },
            },
          },
          '400': {
            description: 'Invalid request',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ValidationError',
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
          },
          '500': {
            description: 'Server error',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
              },
            },
          },
        },
      },
    },

    '/api/v1/hash/history/{datasetId}': {
      get: {
        tags: ['Hash Retrieval'],
        summary: 'Get complete hash version history',
        description: `
Retrieve all hash versions for a dataset.
- Shows chronological order of all hash updates
- Useful for chain-of-custody audits
- Includes timestamps and block numbers
- Helps track dataset evolution over time
        `,
        operationId: 'getHashHistory',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'datasetId',
            in: 'path',
            required: true,
            description: 'Dataset identifier',
            schema: {
              type: 'string',
              example: 'DS-PILOT-001',
            },
          },
        ],
        responses: {
          '200': {
            description: 'Hash history retrieved',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/HashHistoryResponse',
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
          },
          '500': {
            description: 'Server error',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
              },
            },
          },
        },
      },
    },
  },
};

module.exports = swaggerSpec;
