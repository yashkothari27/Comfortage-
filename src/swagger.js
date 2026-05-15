/**
 * OpenAPI 3.0 specification — COMFORTage T3.3 DataIntegrity API
 */

const swaggerSpec = {
  openapi: '3.0.0',

  // ═══════════════════════════════════════════════════════════════
  // INFO & OVERVIEW
  // ═══════════════════════════════════════════════════════════════
  info: {
    title: 'COMFORTage — Healthcare Data Integrity API',
    version: '2.0.0',
    'x-logo': { url: '/comfortage-logo.svg', altText: 'COMFORTage Logo' },
    description: 'Healthcare data integrity API — SHA-256 record hashes stored on Reltime Mainnet (PoA, Chain ID 32323). See [Testing Guide](/guide) for test accounts, pre-seeded records, and workflow examples.',
    contact: { name: 'COMFORTage Team' },
    license: { name: 'MIT' },
  },

  servers: [
    { url: 'http://localhost:3000', description: 'Local Development' },
    { url: 'https://comfortage-t33.vercel.app', description: 'Production (Vercel)' },
  ],

  // ═══════════════════════════════════════════════════════════════
  // TAGS
  // ═══════════════════════════════════════════════════════════════
  tags: [
    { name: 'Account',    description: 'Register, login, and view your profile.' },
    { name: 'Admin',      description: 'Manage users and assign roles. Admin token required.' },
    { name: 'Records',    description: 'Store and retrieve medical record hashes on-chain.' },
    { name: 'Validation', description: 'Verify record integrity. Doctor token required.' },
    { name: 'Audit',      description: 'Compliance summary by record type. Auditor token required.' },
    { name: 'Health',     description: 'Service and blockchain connection status. No auth required.' },
  ],

  // ═══════════════════════════════════════════════════════════════
  // COMPONENTS
  // ═══════════════════════════════════════════════════════════════
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Login via POST /api/v1/auth/login, then paste the returned token here.',
      },
    },

    schemas: {
      // ── Errors ──
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error:   { type: 'string', example: 'Error description' },
          detail:  { type: 'string', example: 'Technical detail' },
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
                msg:   { type: 'string' },
                param: { type: 'string' },
              },
            },
          },
        },
      },

      // ── Auth ──
      RegisterRequest: {
        type: 'object',
        required: ['email', 'password', 'fullName'],
        properties: {
          email:    { type: 'string', format: 'email', example: 'new.user@comfortage.health' },
          password: { type: 'string', minLength: 8,    example: 'SecurePass@2024!' },
          fullName: { type: 'string',                  example: 'Jane Smith' },
        },
      },

      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email:    { type: 'string', format: 'email', example: 'sara.johnson@comfortage.health' },
          password: { type: 'string',                  example: 'Nurse@Sara2024!' },
        },
      },

      UserProfile: {
        type: 'object',
        properties: {
          id:            { type: 'integer', example: 2 },
          email:         { type: 'string',  example: 'sara.johnson@comfortage.health' },
          fullName:      { type: 'string',  example: 'Sara Johnson' },
          role:          { type: 'string',  enum: ['pending','nurse','doctor','pharmacist','consent_manager','auditor','admin'], example: 'nurse' },
          walletAddress: { type: 'string',  example: '0x8a11d644aaD9f880fB66258e87b2Bdcd11825Bc9', description: 'Auto-provisioned blockchain wallet — managed by the backend' },
          createdAt:     { type: 'string',  format: 'date-time' },
        },
      },

      AuthResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          user:    { $ref: '#/components/schemas/UserProfile' },
          token:   { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
        },
      },

      // ── Record Types ──
      RecordType: {
        type: 'string',
        enum: ['LAB_RESULT', 'DIAGNOSIS', 'PRESCRIPTION', 'CONSENT_FORM', 'IMAGING'],
        description: `Type of medical record:
- **LAB_RESULT** — Blood panels, urinalysis, pathology (submitted by Nurse)
- **DIAGNOSIS** — ICD-10 coded clinical diagnoses (submitted by Nurse)
- **PRESCRIPTION** — Medication orders with dosage/frequency (submitted by Pharmacist)
- **CONSENT_FORM** — Patient consent for treatment or research (submitted by Consent Manager)
- **IMAGING** — DICOM radiology records: X-ray, MRI, CT (submitted by Nurse)`,
      },

      // ── Hash Requests ──
      StoreHashRequest: {
        type: 'object',
        required: ['datasetId', 'hash', 'recordType'],
        properties: {
          datasetId: {
            type: 'string',
            example: 'LAB-P10042-CBC-20240318',
            description: 'Unique identifier — recommended format: TYPE-PATIENT-DESCRIPTION-DATE',
          },
          hash: {
            type: 'string',
            pattern: '^(0x)?[a-fA-F0-9]{64}$',
            example: '0x3c59dc048e8850243be8079a5c74d079934b91d7321b8e09f8ce1fde91baa2ae',
            description: 'SHA-256 hash of the off-chain record content (64 hex chars)',
          },
          recordType: { $ref: '#/components/schemas/RecordType' },
          metadataCID: {
            type: 'string',
            example: 'QmLabCBCP10042Mar2024',
            description: 'Optional IPFS CID pointing to additional metadata',
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
            example: '0xd4e5f678a9b012c345d6e7f8a9b012c345d6e7f8a9b012c345d6e7f8a9b012c3',
            description: 'New SHA-256 hash (amended record)',
          },
          metadataCID: {
            type: 'string',
            example: 'QmAmendedCBCCID',
            description: 'Updated IPFS CID (optional)',
          },
        },
      },

      ValidateHashRequest: {
        type: 'object',
        required: ['datasetId', 'hash'],
        properties: {
          datasetId: { type: 'string', example: 'LAB-P10042-CBC-20240318' },
          hash: {
            type: 'string',
            pattern: '^(0x)?[a-fA-F0-9]{64}$',
            example: '0x3c59dc048e8850243be8079a5c74d079934b91d7321b8e09f8ce1fde91baa2ae',
            description: 'Hash of the record you have — the system compares this against what is stored on-chain',
          },
        },
      },

      // ── Hash Responses ──
      HashRecord: {
        type: 'object',
        properties: {
          datasetId:      { type: 'string',  example: 'LAB-P10042-CBC-20240318' },
          hash:           { type: 'string',  example: '0x3c59dc048e8850243be8079a5c74d079934b91d7321b8e09f8ce1fde91baa2ae' },
          recordType:     { type: 'integer', example: 0, description: '0=LAB_RESULT 1=DIAGNOSIS 2=PRESCRIPTION 3=CONSENT_FORM 4=IMAGING' },
          recordTypeName: { type: 'string',  example: 'LAB_RESULT' },
          timestamp:      { type: 'integer', example: 1710762000, description: 'Unix timestamp when stored' },
          timestampISO:   { type: 'string',  example: '2024-03-18T10:00:00.000Z' },
          submitter:      { type: 'string',  example: '0x8a11d644aaD9f880fB66258e87b2Bdcd11825Bc9', description: 'Blockchain wallet address of the user who submitted' },
          metadataCID:    { type: 'string',  example: 'QmLabCBCP10042Mar2024' },
        },
      },

      StoreHashResponse: {
        type: 'object',
        properties: {
          success:        { type: 'boolean', example: true },
          message:        { type: 'string',  example: 'Hash stored on Reltime blockchain' },
          data: {
            type: 'object',
            properties: {
              datasetId:       { type: 'string',  example: 'LAB-P10042-CBC-20240318' },
              recordType:      { type: 'string',  example: 'LAB_RESULT' },
              transactionHash: { type: 'string',  example: '0xabc123def456789...' },
              blockNumber:     { type: 'integer', example: 37171102 },
              gasUsed:         { type: 'string',  example: '85000' },
              status:          { type: 'string',  example: 'confirmed' },
            },
          },
        },
      },

      ValidateHashResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              datasetId:       { type: 'string',  example: 'LAB-P10042-CBC-20240318' },
              isValid:         { type: 'boolean', example: true, description: '✅ true = data is intact  ❌ false = data has been tampered' },
              recordTypeName:  { type: 'string',  example: 'LAB_RESULT' },
              transactionHash: { type: 'string',  example: '0xdef789abc123...', description: 'On-chain transaction containing the IntegrityChecked audit event' },
              blockNumber:     { type: 'integer', example: 37171103 },
            },
          },
        },
      },

      CheckIntegrityResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              datasetId:      { type: 'string',  example: 'LAB-P10042-CBC-20240318' },
              isValid:        { type: 'boolean', example: true },
              providedHash:   { type: 'string',  example: '0x3c59dc048e8850243be8079a5c74d079934b91d7321b8e09f8ce1fde91baa2ae' },
              storedHash:     { type: 'string',  example: '0x3c59dc048e8850243be8079a5c74d079934b91d7321b8e09f8ce1fde91baa2ae' },
              storedTimestamp:{ type: 'string',  example: '2024-03-18T10:00:00.000Z' },
            },
          },
        },
      },

      HashHistoryResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              datasetId:     { type: 'string',  example: 'LAB-P10042-CBC-20240318' },
              totalVersions: { type: 'integer', example: 2 },
              versions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    version: { type: 'integer', example: 1 },
                    hash:    { type: 'string',  example: '0x3c59dc048e8850243be8079a5c74d079934b91d7321b8e09f8ce1fde91baa2ae' },
                  },
                },
              },
            },
          },
        },
      },

      AuditSummaryResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            description: 'Counts of all records stored on-chain by type — no patient data exposed',
            properties: {
              labResults:     { type: 'integer', example: 3, description: 'Total LAB_RESULT records on-chain' },
              diagnoses:      { type: 'integer', example: 1, description: 'Total DIAGNOSIS records on-chain' },
              prescriptions:  { type: 'integer', example: 3, description: 'Total PRESCRIPTION records on-chain' },
              consentForms:   { type: 'integer', example: 2, description: 'Total CONSENT_FORM records on-chain' },
              imagingRecords: { type: 'integer', example: 1, description: 'Total IMAGING records on-chain' },
              total:          { type: 'integer', example: 10, description: 'Grand total across all types' },
            },
          },
        },
      },

      // ── Admin ──
      AssignRoleRequest: {
        type: 'object',
        required: ['role'],
        properties: {
          role: {
            type: 'string',
            enum: ['nurse', 'doctor', 'pharmacist', 'consent_manager', 'auditor', 'admin', 'pending'],
            example: 'nurse',
            description: 'Assigning a clinical role automatically calls grantRole() on the smart contract',
          },
        },
      },

      HealthStatus: {
        type: 'object',
        properties: {
          status:          { type: 'string',  enum: ['healthy','unhealthy'], example: 'healthy' },
          chain:           { type: 'string',  example: 'Reltime Mainnet' },
          chainId:         { type: 'integer', example: 32323 },
          currentBlock:    { type: 'integer', example: 37171101 },
          contractAddress: { type: 'string',  example: '0xb032Fca326E02254d50509f35F8D6fd4cccDB3B0' },
          totalRecords:    { type: 'integer', example: 10 },
          rpcUrl:          { type: 'string',  example: 'https://mainnet.reltime.com/' },
        },
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // PATHS
  // ═══════════════════════════════════════════════════════════════
  paths: {

    // ── HEALTH ──────────────────────────────────────────────────
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Service health & blockchain status',
        description: 'Checks API server status and live connection to Reltime Mainnet. No authentication required.',
        operationId: 'getHealth',
        responses: {
          '200': { description: 'Healthy', content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthStatus' } } } },
          '503': { description: 'Unhealthy', content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthStatus' } } } },
        },
      },
    },

    // ── AUTH ─────────────────────────────────────────────────────
    '/api/v1/auth/register': {
      post: {
        tags: ['Account'],
        summary: 'Register a new user',
        description: `
Create a new account. The backend will:
1. Hash your password with bcrypt
2. Generate a new Ethereum-compatible wallet on Reltime Mainnet
3. Encrypt the private key (AES-256-GCM) and store it securely
4. Return your account details + a JWT token

> **Note:** New accounts start with role \`pending\`. An admin must assign your clinical role before you can submit or validate records.
        `,
        operationId: 'register',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RegisterRequest' },
              examples: {
                newNurse: {
                  summary: 'Register a nurse',
                  value: { email: 'new.nurse@comfortage.health', password: 'SecurePass@2024!', fullName: 'Maria Garcia' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Account created', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          '400': { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationError' } } } },
          '409': { description: 'Email already registered' },
        },
      },
    },

    '/api/v1/auth/login': {
      post: {
        tags: ['Account'],
        summary: 'Login and get JWT token',
        description: `
Authenticate with email and password. Returns a JWT token valid for **24 hours**.

**Test accounts ready to use:**

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@comfortage.health | Admin@Comfortage2024! |
| Nurse 1 | sara.johnson@comfortage.health | Nurse@Sara2024! |
| Nurse 2 | miguel.torres@comfortage.health | Nurse@Miguel2024! |
| Doctor 1 | dr.emily.chen@comfortage.health | Doctor@Emily2024! |
| Doctor 2 | dr.james.patel@comfortage.health | Doctor@James2024! |
| Pharmacist 1 | anna.schmidt@comfortage.health | Pharma@Anna2024! |
| Pharmacist 2 | lucas.martin@comfortage.health | Pharma@Lucas2024! |
| Consent Mgr 1 | sofia.russo@comfortage.health | Consent@Sofia2024! |
| Consent Mgr 2 | alex.nguyen@comfortage.health | Consent@Alex2024! |
| Auditor 1 | claire.dubois@comfortage.health | Audit@Claire2024! |
| Auditor 2 | peter.kowalski@comfortage.health | Audit@Peter2024! |
        `,
        operationId: 'login',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginRequest' },
              examples: {
                nurse: {
                  summary: '🩺 Login as Nurse (Sara Johnson)',
                  value: { email: 'sara.johnson@comfortage.health', password: 'Nurse@Sara2024!' },
                },
                doctor: {
                  summary: '👨‍⚕️ Login as Doctor (Dr. Emily Chen)',
                  value: { email: 'dr.emily.chen@comfortage.health', password: 'Doctor@Emily2024!' },
                },
                pharmacist: {
                  summary: '💊 Login as Pharmacist (Anna Schmidt)',
                  value: { email: 'anna.schmidt@comfortage.health', password: 'Pharma@Anna2024!' },
                },
                consentManager: {
                  summary: '📋 Login as Consent Manager (Sofia Russo)',
                  value: { email: 'sofia.russo@comfortage.health', password: 'Consent@Sofia2024!' },
                },
                auditor: {
                  summary: '🔍 Login as Auditor (Claire Dubois)',
                  value: { email: 'claire.dubois@comfortage.health', password: 'Audit@Claire2024!' },
                },
                admin: {
                  summary: '🔐 Login as Admin',
                  value: { email: 'admin@comfortage.health', password: 'Admin@Comfortage2024!' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Login successful — copy the token for use in Authorize', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          '401': { description: 'Invalid email or password' },
        },
      },
    },

    '/api/v1/auth/me': {
      get: {
        tags: ['Account'],
        summary: 'Get your profile',
        description: 'Returns the authenticated user\'s profile including role and wallet address.',
        operationId: 'getMe',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Profile returned', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          '401': { description: 'Unauthorized' },
        },
      },
    },

    // ── ADMIN ────────────────────────────────────────────────────
    '/api/v1/admin/users': {
      get: {
        tags: ['Admin'],
        summary: 'List all users',
        description: 'Returns all registered users with their roles and wallet addresses. **Admin only.**',
        operationId: 'listUsers',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': {
            description: 'User list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    count:   { type: 'integer', example: 11 },
                    users:   { type: 'array', items: { $ref: '#/components/schemas/UserProfile' } },
                  },
                },
              },
            },
          },
          '403': { description: 'Forbidden — admin role required' },
        },
      },
    },

    '/api/v1/admin/users/{id}': {
      get: {
        tags: ['Admin'],
        summary: 'Get a single user',
        operationId: 'getUser',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer', example: 2 } }],
        responses: {
          '200': { description: 'User found', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          '404': { description: 'User not found' },
        },
      },
      delete: {
        tags: ['Admin'],
        summary: 'Delete a user',
        operationId: 'deleteUser',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer', example: 2 } }],
        responses: {
          '200': { description: 'User deleted' },
          '404': { description: 'User not found' },
        },
      },
    },

    '/api/v1/admin/users/{id}/role': {
      put: {
        tags: ['Admin'],
        summary: 'Assign a role to a user',
        description: `
**Admin only.** This single call does two things atomically:

1. **Database** — updates the user's role
2. **Blockchain** — calls \`contract.grantRole(roleHash, walletAddress)\` on Reltime Mainnet using the deployer wallet

After this call, the user can immediately start submitting/validating records according to their new role's permissions. No manual blockchain interaction required.

**Try it:** Assign \`nurse\` to user ID 2, then login as sara.johnson and store a LAB_RESULT hash.
        `,
        operationId: 'assignRole',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer', example: 2 }, description: 'User ID from GET /admin/users' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AssignRoleRequest' },
              examples: {
                assignNurse:          { summary: 'Assign nurse role',          value: { role: 'nurse' } },
                assignDoctor:         { summary: 'Assign doctor role',         value: { role: 'doctor' } },
                assignPharmacist:     { summary: 'Assign pharmacist role',     value: { role: 'pharmacist' } },
                assignConsentManager: { summary: 'Assign consent_manager role',value: { role: 'consent_manager' } },
                assignAuditor:        { summary: 'Assign auditor role',        value: { role: 'auditor' } },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Role assigned on both DB and blockchain',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string',  example: "Role 'nurse' assigned to sara.johnson@comfortage.health" },
                    user:    { $ref: '#/components/schemas/UserProfile' },
                    onChain: {
                      type: 'object',
                      properties: {
                        transactionHash: { type: 'string', example: '0xabc123...' },
                        blockNumber:     { type: 'integer', example: 37171200 },
                      },
                    },
                  },
                },
              },
            },
          },
          '403': { description: 'Admin role required' },
          '404': { description: 'User not found' },
        },
      },
    },

    // ── RECORDS ──────────────────────────────────────────────────
    '/api/v1/hash': {
      post: {
        tags: ['Records'],
        summary: 'Store a medical record hash on-chain',
        description: `
Store the SHA-256 fingerprint of a medical record on Reltime Mainnet. The transaction is signed by **your wallet** (managed by the backend — no wallet interaction needed).

**Role restrictions enforced at both API and smart contract level:**

| Your Role | Allowed Record Types |
|-----------|---------------------|
| nurse | LAB_RESULT, DIAGNOSIS, IMAGING |
| pharmacist | PRESCRIPTION |
| consent_manager | CONSENT_FORM |
| admin | All types |

**What to put in the \`hash\` field:**
Compute SHA-256 of the actual record file/JSON bytes. Never send patient data — only the hash.

\`\`\`js
// Example: hashing a lab result JSON
const hash = '0x' + require('crypto').createHash('sha256')
  .update(JSON.stringify(labResultObject))
  .digest('hex');
\`\`\`
        `,
        operationId: 'storeHash',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/StoreHashRequest' },
              examples: {
                labResult: {
                  summary: '🩸 Store CBC blood panel (Nurse)',
                  value: {
                    datasetId:   'LAB-P10042-NEWCBC-20240401',
                    hash:        '0x3c59dc048e8850243be8079a5c74d079934b91d7321b8e09f8ce1fde91baa2ae',
                    recordType:  'LAB_RESULT',
                    metadataCID: 'QmLabCBCP10042Apr2024',
                  },
                },
                diagnosis: {
                  summary: '🏥 Store clinical diagnosis (Nurse)',
                  value: {
                    datasetId:   'DX-P10042-CKD-20240401',
                    hash:        '0xa1b2c3d4e5f678901234567890123456789012345678901234567890a1b2c3d4',
                    recordType:  'DIAGNOSIS',
                    metadataCID: 'QmDxCKDP10042',
                  },
                },
                prescription: {
                  summary: '💊 Store prescription (Pharmacist)',
                  value: {
                    datasetId:   'RX-P10042-LISI-20240401',
                    hash:        '0xb2c3d4e5f67890123456789012345678901234567890123456789012b2c3d4e5',
                    recordType:  'PRESCRIPTION',
                    metadataCID: 'QmRxLisinoprilP10042',
                  },
                },
                consentForm: {
                  summary: '📋 Store consent form (Consent Manager)',
                  value: {
                    datasetId:   'CONSENT-P10042-FOLLOWUP-20240401',
                    hash:        '0xc3d4e5f6789012345678901234567890123456789012345678901234c3d4e5f6',
                    recordType:  'CONSENT_FORM',
                    metadataCID: 'QmConsentFollowupP10042',
                  },
                },
                imaging: {
                  summary: '🩻 Store imaging record (Nurse)',
                  value: {
                    datasetId:   'IMG-P10042-MRI-20240401',
                    hash:        '0xd4e5f67890123456789012345678901234567890123456789012345678d4e5f6',
                    recordType:  'IMAGING',
                    metadataCID: 'QmMriP10042Apr2024',
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Hash stored on-chain ✅', content: { 'application/json': { schema: { $ref: '#/components/schemas/StoreHashResponse' } } } },
          '400': { description: 'Validation failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationError' } } } },
          '401': { description: 'Authentication required' },
          '403': { description: 'Your role cannot submit this record type', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '409': { description: 'Dataset ID already exists — use PUT to update', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    '/api/v1/hash/{datasetId}': {
      get: {
        tags: ['Records'],
        summary: 'Retrieve a stored hash record',
        description: `
Fetch the current on-chain record for a dataset.

**Try these pre-seeded dataset IDs:**
- \`LAB-P10042-CBC-20240318\` — CBC blood panel
- \`RX-P10042-MET-20240318\` — Metformin prescription
- \`CONSENT-P10042-STUDY-20240315\` — Study consent form
- \`IMG-P10099-CXR-20240320\` — Chest X-ray
- \`DX-P10042-T2DM-HTN-20240318\` — T2DM + Hypertension diagnosis
        `,
        operationId: 'getHash',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'datasetId', in: 'path', required: true,
            schema: { type: 'string', example: 'LAB-P10042-CBC-20240318' },
            description: 'The dataset ID used when the hash was stored',
          },
        ],
        responses: {
          '200': { description: 'Record found', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean', example: true }, data: { $ref: '#/components/schemas/HashRecord' } } } } } },
          '401': { description: 'Authentication required' },
          '404': { description: 'Dataset not found on blockchain' },
        },
      },

      put: {
        tags: ['Records'],
        summary: 'Update a record hash (amended record)',
        description: `
Update the hash for an existing record — for example, when a lab result is amended or a prescription is changed.

- Old hash is **preserved in history** (never deleted)
- New hash becomes the current record
- Same role restriction as the original submission applies (e.g., only a pharmacist can amend a PRESCRIPTION)
        `,
        operationId: 'updateHash',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'datasetId', in: 'path', required: true, schema: { type: 'string', example: 'LAB-P10042-CBC-20240318' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateHashRequest' },
              examples: {
                amendedLab: {
                  summary: 'Amended CBC result (corrected WBC count)',
                  value: { hash: '0xd4e5f678a9b012c345d6e7f8a9b012c345d6e7f8a9b012c345d6e7f8a9b012c3', metadataCID: 'QmAmendedCBCCID' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Hash updated on-chain ✅', content: { 'application/json': { schema: { $ref: '#/components/schemas/StoreHashResponse' } } } },
          '403': { description: 'Role cannot update this record type' },
          '404': { description: 'Dataset not found' },
        },
      },
    },

    '/api/v1/hash/history/{datasetId}': {
      get: {
        tags: ['Records'],
        summary: 'Get full version history of a record',
        description: `
Returns every hash ever stored for a dataset in chronological order.

This is the **"time machine"** feature — you can see how a record has evolved over time and verify any historical version.

**Try:** \`LAB-P10042-CBC-20240318\` (amended during seeding, so has 2 versions)
        `,
        operationId: 'getHashHistory',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'datasetId', in: 'path', required: true, schema: { type: 'string', example: 'LAB-P10042-CBC-20240318' } },
        ],
        responses: {
          '200': { description: 'Version history', content: { 'application/json': { schema: { $ref: '#/components/schemas/HashHistoryResponse' } } } },
          '401': { description: 'Authentication required' },
        },
      },
    },

    // ── VALIDATION ───────────────────────────────────────────────
    '/api/v1/hash/validate': {
      post: {
        tags: ['Validation'],
        summary: 'Validate integrity — records on-chain audit event',
        description: `
**Doctor role required.** Compares the hash you provide against what is stored on Reltime Mainnet and emits an \`IntegrityChecked\` event on-chain regardless of the result.

This event contains:
- Validator's wallet address (permanent identity)
- Timestamp (block time)
- Record type
- Match result (true/false)

**Test tamper detection:** Change one character of the hash and resubmit — \`isValid\` will be \`false\`.

**Pre-seeded records to validate (use Doctor login):**
- \`LAB-P10042-CBC-20240318\` → hash: \`0x3c59dc048e8850243be8079a5c74d079934b91d7321b8e09f8ce1fde91baa2ae\`
- \`RX-P10042-MET-20240318\` → hash: \`0xa1b2c3d4e5...\` (see GET /hash/{datasetId} to retrieve)
        `,
        operationId: 'validateHash',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidateHashRequest' },
              examples: {
                validCheck: {
                  summary: '✅ Validate a real record (will return isValid: true)',
                  value: { datasetId: 'LAB-P10042-CBC-20240318', hash: '0x3c59dc048e8850243be8079a5c74d079934b91d7321b8e09f8ce1fde91baa2ae' },
                },
                tamperedCheck: {
                  summary: '❌ Simulate tampered data (will return isValid: false)',
                  value: { datasetId: 'LAB-P10042-CBC-20240318', hash: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Validation result recorded on-chain', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidateHashResponse' } } } },
          '403': { description: 'Doctor role required' },
        },
      },
    },

    '/api/v1/hash/check/{datasetId}/{hash}': {
      get: {
        tags: ['Validation'],
        summary: 'Quick integrity check — read-only, no on-chain tx',
        description: `
Instantly compare a hash against the stored on-chain value without sending a transaction.

Use this for:
- Batch validation pipelines
- Developer testing
- High-frequency integrity checks where you don't need the official audit trail

For official doctor sign-off, use \`POST /hash/validate\` instead.
        `,
        operationId: 'checkIntegrity',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'datasetId', in: 'path', required: true, schema: { type: 'string', example: 'LAB-P10042-CBC-20240318' } },
          { name: 'hash', in: 'path', required: true, schema: { type: 'string', example: '0x3c59dc048e8850243be8079a5c74d079934b91d7321b8e09f8ce1fde91baa2ae' } },
        ],
        responses: {
          '200': { description: 'Integrity check result', content: { 'application/json': { schema: { $ref: '#/components/schemas/CheckIntegrityResponse' } } } },
          '401': { description: 'Authentication required' },
        },
      },
    },

    // ── AUDIT ────────────────────────────────────────────────────
    '/api/v1/hash/audit/summary': {
      get: {
        tags: ['Audit'],
        summary: 'Compliance audit summary by record type',
        description: `
**Auditor role required.** Returns record counts for each medical record type stored on Reltime Mainnet.

This view is designed for:
- Compliance officers verifying data ingestion volumes
- Hospital administrators reviewing system usage
- Regulators confirming all record categories are being captured

**No patient data is exposed** — only aggregate counts.

**Try it:** Login as \`claire.dubois@comfortage.health\` (Auditor 1) and run this endpoint.
        `,
        operationId: 'getAuditSummary',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Audit summary', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuditSummaryResponse' } } } },
          '403': { description: 'Auditor or admin role required' },
        },
      },
    },
  },
};

module.exports = swaggerSpec;
