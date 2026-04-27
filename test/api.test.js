/**
 * COMFORTage T3.3 — Full API Integration Test Suite
 *
 * Tests every endpoint end-to-end through the real Express server:
 *   Account   — register, login, /me
 *   Admin     — list users, assign roles (mocked on-chain grant)
 *   Records   — store hash (all 5 types), get, update, history
 *   Validation— validate (on-chain audit), quick check (read-only)
 *   Audit     — compliance summary
 *   Health    — blockchain status
 *   Auth      — missing token, wrong role, cross-role blocks
 */

process.env.DB_PATH = '/tmp/comfortage-api-test.db';

const { expect } = require('chai');
const http       = require('http');
const crypto     = require('crypto');

// ── Patch blockchain service BEFORE requiring server ─────────────
// All on-chain calls are mocked so tests run without RPC connectivity.
const blockchainService = require('../src/services/blockchainService');

function mockTxResult(blockNumber = 100) {
  return { transactionHash: '0xmocktxhash', blockNumber, gasUsed: '80000', status: 'confirmed' };
}

blockchainService.isConnected = true;
blockchainService.storeHashAs  = async () => mockTxResult(101);
blockchainService.updateHashAs = async () => mockTxResult(102);
blockchainService.validateHashAs = async (pk, datasetId, hash) => ({
  datasetId, isValid: true, recordTypeName: 'LAB_RESULT',
  transactionHash: '0xvalidatetx', blockNumber: 103,
});
blockchainService.getAuditSummaryAs = async () => ({
  labResults: 3, diagnoses: 1, prescriptions: 3,
  consentForms: 2, imagingRecords: 1, total: 10,
});
blockchainService.grantUserRole = async () => ({ transactionHash: '0xgranttx', blockNumber: 99 });
blockchainService.getHash = async (id) => ({
  datasetId: id, hash: '0x' + 'a'.repeat(64), recordType: 0,
  recordTypeName: 'LAB_RESULT', timestamp: 1710762000,
  timestampISO: '2024-03-18T10:00:00.000Z',
  submitter: '0xSubmitterAddress', metadataCID: 'QmTestCID',
});
blockchainService.checkIntegrity = async (id, hash) => ({
  datasetId: id, isValid: true,
  providedHash: hash, storedHash: hash,
  storedTimestamp: '2024-03-18T10:00:00.000Z',
});
blockchainService.getHashHistory = async (id) => ({
  datasetId: id, totalVersions: 2,
  versions: [{ version: 1, hash: '0x' + 'a'.repeat(64) }, { version: 2, hash: '0x' + 'b'.repeat(64) }],
});
blockchainService.datasetExists = async () => true;
blockchainService.getHealth = async () => ({
  status: 'healthy', chain: 'Reltime Mainnet', chainId: 32323,
  currentBlock: 37171101, contractAddress: '0xb032Fca326E02254d50509f35F8D6fd4cccDB3B0',
  totalRecords: 10, rpcUrl: 'https://mainnet.reltime.com/',
});
blockchainService.contract = {
  INGESTION_ROLE:       async () => '0x' + '1'.repeat(64),
  VALIDATOR_ROLE:       async () => '0x' + '2'.repeat(64),
  PHARMACIST_ROLE:      async () => '0x' + '3'.repeat(64),
  CONSENT_MANAGER_ROLE: async () => '0x' + '4'.repeat(64),
  AUDITOR_ROLE:         async () => '0x' + '5'.repeat(64),
  grantRole: async () => ({ wait: async () => ({ hash: '0xgranttx', blockNumber: 99 }) }),
};

const app    = require('../src/server');
const db     = require('../src/db/database');

// ── Test helpers ──────────────────────────────────────────────────
let server;
let baseUrl;

function sha256(str) {
  return '0x' + crypto.createHash('sha256').update(str).digest('hex');
}

async function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: '127.0.0.1',
      port: server.address().port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const r = http.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

// Store tokens and user IDs across tests
const ctx = {};

// ─────────────────────────────────────────────────────────────────
before(async function () {
  this.timeout(10000);

  // Clean slate
  db.prepare("DELETE FROM users WHERE email LIKE '%@test.comfortage'").run();

  server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  console.log(`\n  Test server: ${baseUrl}\n`);
});

after(() => { server?.close(); });

// ═════════════════════════════════════════════════════════════════
describe('Health', function () {
  it('GET /health returns healthy status', async function () {
    const { status, body } = await req('GET', '/health');
    expect(status).to.equal(200);
    expect(body.status).to.equal('healthy');
    expect(body.chain).to.equal('Reltime Mainnet');
    expect(body.chainId).to.equal(32323);
    expect(body.contractAddress).to.be.a('string').that.match(/^0x/);
    expect(body.totalRecords).to.be.a('number');
  });
});

// ═════════════════════════════════════════════════════════════════
describe('Account — Register & Login', function () {

  it('POST /auth/register — creates account with auto-provisioned wallet', async function () {
    const { status, body } = await req('POST', '/api/v1/auth/register', {
      email: 'sara@test.comfortage', password: 'TestPass@2024!', fullName: 'Sara Test',
    });
    expect(status).to.equal(201);
    expect(body.success).to.be.true;
    expect(body.user.role).to.equal('pending');
    expect(body.user.walletAddress).to.match(/^0x[a-fA-F0-9]{40}$/);
    expect(body.token).to.be.a('string').with.length.above(20);
    ctx.nurseId    = body.user.id;
    ctx.nurseEmail = body.user.email;
  });

  it('POST /auth/register — rejects duplicate email', async function () {
    const { status } = await req('POST', '/api/v1/auth/register', {
      email: 'sara@test.comfortage', password: 'TestPass@2024!', fullName: 'Sara Test',
    });
    expect(status).to.equal(409);
  });

  it('POST /auth/register — validates email format', async function () {
    const { status } = await req('POST', '/api/v1/auth/register', {
      email: 'not-an-email', password: 'TestPass@2024!', fullName: 'Bad Email',
    });
    expect(status).to.equal(400);
  });

  it('POST /auth/register — validates password length', async function () {
    const { status } = await req('POST', '/api/v1/auth/register', {
      email: 'short@test.comfortage', password: 'abc', fullName: 'Short Pass',
    });
    expect(status).to.equal(400);
  });

  it('POST /auth/login — returns token for valid credentials', async function () {
    const { status, body } = await req('POST', '/api/v1/auth/login', {
      email: 'sara@test.comfortage', password: 'TestPass@2024!',
    });
    expect(status).to.equal(200);
    expect(body.success).to.be.true;
    expect(body.token).to.be.a('string');
    ctx.nurseToken = body.token; // role = pending
  });

  it('POST /auth/login — rejects wrong password', async function () {
    const { status } = await req('POST', '/api/v1/auth/login', {
      email: 'sara@test.comfortage', password: 'WrongPassword!',
    });
    expect(status).to.equal(401);
  });

  it('POST /auth/login — rejects unknown email', async function () {
    const { status } = await req('POST', '/api/v1/auth/login', {
      email: 'ghost@test.comfortage', password: 'TestPass@2024!',
    });
    expect(status).to.equal(401);
  });

  // Register remaining test users
  it('registers doctor, pharmacist, consent_manager, auditor test accounts', async function () {
    this.timeout(10000);
    const users = [
      { email: 'doctor@test.comfortage',  password: 'TestPass@2024!', fullName: 'Dr. Test',      role: 'doctor'          },
      { email: 'pharma@test.comfortage',  password: 'TestPass@2024!', fullName: 'Pharma Test',    role: 'pharmacist'      },
      { email: 'consent@test.comfortage', password: 'TestPass@2024!', fullName: 'Consent Test',   role: 'consent_manager' },
      { email: 'auditor@test.comfortage', password: 'TestPass@2024!', fullName: 'Auditor Test',   role: 'auditor'         },
      { email: 'admin@test.comfortage',   password: 'TestPass@2024!', fullName: 'Admin Test',     role: 'admin'           },
    ];
    for (const u of users) {
      db.prepare("DELETE FROM users WHERE email = ?").run(u.email);
      const r = await req('POST', '/api/v1/auth/register', { email: u.email, password: u.password, fullName: u.fullName });
      expect(r.status).to.equal(201);
      ctx[u.role + 'Id'] = r.body.user.id;
    }
  });

  it('GET /auth/me — returns profile with valid token', async function () {
    const { status, body } = await req('GET', '/api/v1/auth/me', null, ctx.nurseToken);
    expect(status).to.equal(200);
    expect(body.user.email).to.equal('sara@test.comfortage');
  });

  it('GET /auth/me — rejects missing token', async function () {
    const { status } = await req('GET', '/api/v1/auth/me');
    expect(status).to.equal(401);
  });
});

// ═════════════════════════════════════════════════════════════════
describe('Admin — Role Assignment', function () {

  before(async function () {
    // Login as admin
    db.prepare("UPDATE users SET role = 'admin' WHERE email = 'admin@test.comfortage'").run();
    const r = await req('POST', '/api/v1/auth/login', {
      email: 'admin@test.comfortage', password: 'TestPass@2024!',
    });
    ctx.adminToken = r.body.token;
  });

  it('GET /admin/users — admin can list all users', async function () {
    const { status, body } = await req('GET', '/api/v1/admin/users', null, ctx.adminToken);
    expect(status).to.equal(200);
    expect(body.success).to.be.true;
    expect(body.users).to.be.an('array').with.length.above(0);
    expect(body.count).to.equal(body.users.length);
  });

  it('GET /admin/users — nurse cannot access admin routes', async function () {
    const { status } = await req('GET', '/api/v1/admin/users', null, ctx.nurseToken);
    expect(status).to.equal(403);
  });

  it('GET /admin/users/:id — get specific user', async function () {
    const { status, body } = await req('GET', `/api/v1/admin/users/${ctx.nurseId}`, null, ctx.adminToken);
    expect(status).to.equal(200);
    expect(body.user.email).to.equal('sara@test.comfortage');
  });

  it('PUT /admin/users/:id/role — assigns nurse role + triggers on-chain grantRole', async function () {
    const { status, body } = await req('PUT', `/api/v1/admin/users/${ctx.nurseId}/role`,
      { role: 'nurse' }, ctx.adminToken);
    expect(status).to.equal(200);
    expect(body.success).to.be.true;
    expect(body.user.role).to.equal('nurse');
    expect(body.onChain).to.have.property('transactionHash');
    expect(body.onChain.transactionHash).to.match(/^0x/);

    // Re-login to get updated token with nurse role
    const lr = await req('POST', '/api/v1/auth/login', { email: 'sara@test.comfortage', password: 'TestPass@2024!' });
    ctx.nurseToken = lr.body.token;
  });

  it('PUT /admin/users/:id/role — assigns doctor role', async function () {
    const { status, body } = await req('PUT', `/api/v1/admin/users/${ctx.doctorId}/role`,
      { role: 'doctor' }, ctx.adminToken);
    expect(status).to.equal(200);
    expect(body.user.role).to.equal('doctor');
    const lr = await req('POST', '/api/v1/auth/login', { email: 'doctor@test.comfortage', password: 'TestPass@2024!' });
    ctx.doctorToken = lr.body.token;
  });

  it('PUT /admin/users/:id/role — assigns pharmacist role', async function () {
    const { status, body } = await req('PUT', `/api/v1/admin/users/${ctx.pharmacistId}/role`,
      { role: 'pharmacist' }, ctx.adminToken);
    expect(status).to.equal(200);
    const lr = await req('POST', '/api/v1/auth/login', { email: 'pharma@test.comfortage', password: 'TestPass@2024!' });
    ctx.pharmacistToken = lr.body.token;
  });

  it('PUT /admin/users/:id/role — assigns consent_manager role', async function () {
    const { status, body } = await req('PUT', `/api/v1/admin/users/${ctx.consent_managerId}/role`,
      { role: 'consent_manager' }, ctx.adminToken);
    expect(status).to.equal(200);
    const lr = await req('POST', '/api/v1/auth/login', { email: 'consent@test.comfortage', password: 'TestPass@2024!' });
    ctx.consentToken = lr.body.token;
  });

  it('PUT /admin/users/:id/role — assigns auditor role', async function () {
    const { status, body } = await req('PUT', `/api/v1/admin/users/${ctx.auditorId}/role`,
      { role: 'auditor' }, ctx.adminToken);
    expect(status).to.equal(200);
    const lr = await req('POST', '/api/v1/auth/login', { email: 'auditor@test.comfortage', password: 'TestPass@2024!' });
    ctx.auditorToken = lr.body.token;
  });

  it('PUT /admin/users/:id/role — rejects invalid role', async function () {
    const { status } = await req('PUT', `/api/v1/admin/users/${ctx.nurseId}/role`,
      { role: 'superhero' }, ctx.adminToken);
    expect(status).to.equal(400);
  });

  it('PUT /admin/users/:id/role — returns 404 for unknown user', async function () {
    const { status } = await req('PUT', '/api/v1/admin/users/99999/role',
      { role: 'nurse' }, ctx.adminToken);
    expect(status).to.equal(404);
  });
});

// ═════════════════════════════════════════════════════════════════
describe('Records — Hash Storage', function () {

  const VALID_HASH = sha256('CBC|patient:P10042|WBC:6.2|RBC:4.81|date:2024-03-18');

  it('POST /hash — nurse stores LAB_RESULT', async function () {
    const { status, body } = await req('POST', '/api/v1/hash', {
      datasetId:   'LAB-TEST-CBC-001',
      hash:        VALID_HASH,
      recordType:  'LAB_RESULT',
      metadataCID: 'QmTestCID001',
    }, ctx.nurseToken);
    expect(status).to.equal(201);
    expect(body.success).to.be.true;
    expect(body.data.transactionHash).to.match(/^0x/);
    expect(body.data.blockNumber).to.be.a('number');
  });

  it('POST /hash — nurse stores DIAGNOSIS', async function () {
    const { status, body } = await req('POST', '/api/v1/hash', {
      datasetId:  'DX-TEST-T2DM-001',
      hash:       sha256('ICD10:E11.9|patient:P10042|attending:DR-CHEN'),
      recordType: 'DIAGNOSIS',
    }, ctx.nurseToken);
    expect(status).to.equal(201);
    expect(body.success).to.be.true;
  });

  it('POST /hash — nurse stores IMAGING', async function () {
    const { status, body } = await req('POST', '/api/v1/hash', {
      datasetId:  'IMG-TEST-CXR-001',
      hash:       sha256('DICOM|CXR|patient:P10099|radiologist:DR-PATEL'),
      recordType: 'IMAGING',
    }, ctx.nurseToken);
    expect(status).to.equal(201);
    expect(body.success).to.be.true;
  });

  it('POST /hash — pharmacist stores PRESCRIPTION', async function () {
    const { status, body } = await req('POST', '/api/v1/hash', {
      datasetId:  'RX-TEST-MET-001',
      hash:       sha256('Metformin|500mg|BID|patient:P10042|qty:60'),
      recordType: 'PRESCRIPTION',
    }, ctx.pharmacistToken);
    expect(status).to.equal(201);
    expect(body.success).to.be.true;
  });

  it('POST /hash — consent_manager stores CONSENT_FORM', async function () {
    const { status, body } = await req('POST', '/api/v1/hash', {
      datasetId:  'CONSENT-TEST-001',
      hash:       sha256('Consent|study:COMFORT-T33|patient:P10042|signed:2024-03-15'),
      recordType: 'CONSENT_FORM',
    }, ctx.consentToken);
    expect(status).to.equal(201);
    expect(body.success).to.be.true;
  });

  // ── Cross-role blocks ──
  it('POST /hash — BLOCKS nurse from submitting PRESCRIPTION', async function () {
    const { status, body } = await req('POST', '/api/v1/hash', {
      datasetId: 'RX-NURSE-ATTEMPT', hash: sha256('badRx'), recordType: 'PRESCRIPTION',
    }, ctx.nurseToken);
    expect(status).to.equal(403);
    expect(body.error).to.equal('Forbidden');
  });

  it('POST /hash — BLOCKS nurse from submitting CONSENT_FORM', async function () {
    const { status } = await req('POST', '/api/v1/hash', {
      datasetId: 'CONSENT-NURSE-ATTEMPT', hash: sha256('badConsent'), recordType: 'CONSENT_FORM',
    }, ctx.nurseToken);
    expect(status).to.equal(403);
  });

  it('POST /hash — BLOCKS pharmacist from submitting LAB_RESULT', async function () {
    const { status } = await req('POST', '/api/v1/hash', {
      datasetId: 'LAB-PHARMA-ATTEMPT', hash: sha256('badLab'), recordType: 'LAB_RESULT',
    }, ctx.pharmacistToken);
    expect(status).to.equal(403);
  });

  it('POST /hash — BLOCKS doctor from submitting any record', async function () {
    const { status } = await req('POST', '/api/v1/hash', {
      datasetId: 'LAB-DOCTOR-ATTEMPT', hash: sha256('badLab'), recordType: 'LAB_RESULT',
    }, ctx.doctorToken);
    expect(status).to.equal(403);
  });

  it('POST /hash — BLOCKS auditor from submitting any record', async function () {
    const { status } = await req('POST', '/api/v1/hash', {
      datasetId: 'LAB-AUDITOR-ATTEMPT', hash: sha256('badLab'), recordType: 'LAB_RESULT',
    }, ctx.auditorToken);
    expect(status).to.equal(403);
  });

  it('POST /hash — rejects invalid hash format', async function () {
    const { status } = await req('POST', '/api/v1/hash', {
      datasetId: 'BAD-HASH-001', hash: 'not-a-hash', recordType: 'LAB_RESULT',
    }, ctx.nurseToken);
    expect(status).to.equal(400);
  });

  it('POST /hash — rejects missing recordType', async function () {
    const { status } = await req('POST', '/api/v1/hash', {
      datasetId: 'NO-TYPE-001', hash: VALID_HASH,
    }, ctx.nurseToken);
    expect(status).to.equal(400);
  });

  it('POST /hash — rejects unauthenticated request', async function () {
    const { status } = await req('POST', '/api/v1/hash', {
      datasetId: 'UNAUTH-001', hash: VALID_HASH, recordType: 'LAB_RESULT',
    });
    expect(status).to.equal(401);
  });
});

// ═════════════════════════════════════════════════════════════════
describe('Records — Retrieval & History', function () {

  it('GET /hash/:datasetId — retrieves stored record', async function () {
    const { status, body } = await req('GET', '/api/v1/hash/LAB-P10042-CBC-20240318', null, ctx.nurseToken);
    expect(status).to.equal(200);
    expect(body.success).to.be.true;
    expect(body.data).to.have.property('hash');
    expect(body.data).to.have.property('recordTypeName');
    expect(body.data).to.have.property('timestampISO');
    expect(body.data).to.have.property('submitter');
  });

  it('GET /hash/:datasetId — any authenticated role can read', async function () {
    for (const [role, token] of [['nurse', ctx.nurseToken], ['doctor', ctx.doctorToken], ['auditor', ctx.auditorToken]]) {
      const { status } = await req('GET', '/api/v1/hash/LAB-P10042-CBC-20240318', null, token);
      expect(status, `${role} should be able to GET hash`).to.equal(200);
    }
  });

  it('PUT /hash/:datasetId — nurse updates a lab result', async function () {
    const newHash = sha256('CBC|patient:P10042|WBC:6.8|RBC:4.9|AMENDED');
    const { status, body } = await req('PUT', '/api/v1/hash/LAB-TEST-CBC-001',
      { hash: newHash, metadataCID: 'QmAmendedCID' }, ctx.nurseToken);
    expect(status).to.equal(200);
    expect(body.success).to.be.true;
    expect(body.data.transactionHash).to.match(/^0x/);
  });

  it('GET /hash/history/:datasetId — returns version history', async function () {
    const { status, body } = await req('GET', '/api/v1/hash/history/LAB-P10042-CBC-20240318', null, ctx.nurseToken);
    expect(status).to.equal(200);
    expect(body.success).to.be.true;
    expect(body.data.versions).to.be.an('array').with.length.above(0);
    expect(body.data.totalVersions).to.be.a('number');
  });
});

// ═════════════════════════════════════════════════════════════════
describe('Validation', function () {

  const HASH = sha256('CBC|patient:P10042|WBC:6.2|RBC:4.81|date:2024-03-18');

  it('POST /hash/validate — doctor validates and emits on-chain audit event', async function () {
    const { status, body } = await req('POST', '/api/v1/hash/validate',
      { datasetId: 'LAB-P10042-CBC-20240318', hash: HASH }, ctx.doctorToken);
    expect(status).to.equal(200);
    expect(body.success).to.be.true;
    expect(body.data.isValid).to.be.true;
    expect(body.data.transactionHash).to.match(/^0x/);
    expect(body.data.blockNumber).to.be.a('number');
  });

  it('POST /hash/validate — BLOCKS nurse from validating', async function () {
    const { status } = await req('POST', '/api/v1/hash/validate',
      { datasetId: 'LAB-P10042-CBC-20240318', hash: HASH }, ctx.nurseToken);
    expect(status).to.equal(403);
  });

  it('POST /hash/validate — BLOCKS pharmacist from validating', async function () {
    const { status } = await req('POST', '/api/v1/hash/validate',
      { datasetId: 'LAB-P10042-CBC-20240318', hash: HASH }, ctx.pharmacistToken);
    expect(status).to.equal(403);
  });

  it('POST /hash/validate — BLOCKS auditor from validating', async function () {
    const { status } = await req('POST', '/api/v1/hash/validate',
      { datasetId: 'LAB-P10042-CBC-20240318', hash: HASH }, ctx.auditorToken);
    expect(status).to.equal(403);
  });

  it('POST /hash/validate — rejects invalid hash format', async function () {
    const { status } = await req('POST', '/api/v1/hash/validate',
      { datasetId: 'LAB-P10042-CBC-20240318', hash: 'bad' }, ctx.doctorToken);
    expect(status).to.equal(400);
  });

  it('GET /hash/check/:id/:hash — quick read-only check (no on-chain tx)', async function () {
    const { status, body } = await req('GET',
      `/api/v1/hash/check/LAB-P10042-CBC-20240318/${HASH}`, null, ctx.nurseToken);
    expect(status).to.equal(200);
    expect(body.success).to.be.true;
    expect(body.data).to.have.property('isValid');
    expect(body.data).to.have.property('storedHash');
  });

  it('GET /hash/check — any authenticated role can run quick check', async function () {
    for (const [role, token] of [['doctor', ctx.doctorToken], ['auditor', ctx.auditorToken], ['pharmacist', ctx.pharmacistToken]]) {
      const { status } = await req('GET', `/api/v1/hash/check/LAB-P10042-CBC-20240318/${HASH}`, null, token);
      expect(status, `${role} should be able to quick check`).to.equal(200);
    }
  });
});

// ═════════════════════════════════════════════════════════════════
describe('Audit', function () {

  it('GET /hash/audit/summary — auditor gets compliance counts', async function () {
    const { status, body } = await req('GET', '/api/v1/hash/audit/summary', null, ctx.auditorToken);
    expect(status).to.equal(200);
    expect(body.success).to.be.true;
    expect(body.data).to.include.keys('labResults','diagnoses','prescriptions','consentForms','imagingRecords','total');
    expect(body.data.total).to.equal(10);
    expect(body.data.labResults).to.equal(3);
    expect(body.data.prescriptions).to.equal(3);
  });

  it('GET /hash/audit/summary — admin can also read audit summary', async function () {
    const { status } = await req('GET', '/api/v1/hash/audit/summary', null, ctx.adminToken);
    expect(status).to.equal(200);
  });

  it('GET /hash/audit/summary — BLOCKS nurse from audit summary', async function () {
    const { status } = await req('GET', '/api/v1/hash/audit/summary', null, ctx.nurseToken);
    expect(status).to.equal(403);
  });

  it('GET /hash/audit/summary — BLOCKS doctor from audit summary', async function () {
    const { status } = await req('GET', '/api/v1/hash/audit/summary', null, ctx.doctorToken);
    expect(status).to.equal(403);
  });

  it('GET /hash/audit/summary — BLOCKS pharmacist from audit summary', async function () {
    const { status } = await req('GET', '/api/v1/hash/audit/summary', null, ctx.pharmacistToken);
    expect(status).to.equal(403);
  });
});

// ═════════════════════════════════════════════════════════════════
describe('Swagger & Static', function () {

  it('GET /docs returns HTML with Swagger UI', async function () {
    const { status, body } = await req('GET', '/docs');
    expect(status).to.equal(200);
    expect(body).to.include('swagger-ui');
  });

  it('GET /openapi.json returns valid OpenAPI spec', async function () {
    const { status, body } = await req('GET', '/openapi.json');
    expect(status).to.equal(200);
    expect(body.openapi).to.equal('3.0.0');
    expect(body.info.title).to.include('COMFORTage');
    expect(Object.keys(body.paths).length).to.be.above(10);
    expect(body.tags.map(t => t.name)).to.include.members(['Account','Admin','Records','Validation','Audit','Health']);
  });
});
