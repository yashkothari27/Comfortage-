# COMFORTage T3.3 — Role-Based Access Guide

**Live API:** `https://comfortage.vercel.app/docs`

---

## How to Use This Guide

Every action in this system requires a JWT token. Steps for each role:

1. Go to `/docs` → expand **Account → POST /api/v1/auth/login**
2. Click **Try it out** → pick your account from the dropdown → **Execute**
3. Copy the `token` value from the response
4. Click **Authorize 🔓** (top-right) → paste token → **Authorize → Close**
5. All endpoints for your role now work

Token expires after **24 hours** — just login again.

---

## Role Summary

| Role | Login Email | Password | Can Do |
|------|------------|----------|--------|
| **Admin** | `admin@comfortage.health` | `Admin@Comfortage2024!` | Manage users & roles |
| **Nurse** | `sara.johnson@comfortage.health` | `Nurse@Sara2024!` | Submit lab results, diagnoses, imaging |
| **Nurse** | `miguel.torres@comfortage.health` | `Nurse@Miguel2024!` | Submit lab results, diagnoses, imaging |
| **Doctor** | `dr.emily.chen@comfortage.health` | `Doctor@Emily2024!` | Validate records on-chain |
| **Doctor** | `dr.james.patel@comfortage.health` | `Doctor@James2024!` | Validate records on-chain |
| **Pharmacist** | `anna.schmidt@comfortage.health` | `Pharma@Anna2024!` | Submit prescriptions |
| **Pharmacist** | `lucas.martin@comfortage.health` | `Pharma@Lucas2024!` | Submit prescriptions |
| **Consent Officer** | `sofia.russo@comfortage.health` | `Consent@Sofia2024!` | Submit consent forms |
| **Consent Officer** | `alex.nguyen@comfortage.health` | `Consent@Alex2024!` | Submit consent forms |
| **Auditor** | `claire.dubois@comfortage.health` | `Audit@Claire2024!` | View compliance summary |
| **Auditor** | `peter.kowalski@comfortage.health` | `Audit@Peter2024!` | View compliance summary |

---

## Role 1 — Admin

**What they do:** Manage users and assign roles. Cannot submit blockchain records (no on-chain permission).

### Allowed Endpoints

#### GET /api/v1/auth/me
View your own profile and wallet address.

#### GET /api/v1/admin/users
List all registered users with their roles and wallet addresses.

```json
Response:
{
  "users": [
    { "id": 1, "email": "admin@comfortage.health", "role": "admin", "walletAddress": "0x..." },
    { "id": 2, "email": "sara.johnson@comfortage.health", "role": "nurse", "walletAddress": "0x..." }
  ]
}
```

#### GET /api/v1/admin/users/{id}
Get a single user by ID.

#### PUT /api/v1/admin/users/{id}/role
Assign a role to a user. When a role is assigned, the backend automatically calls `grantRole()` on the smart contract — the user's wallet gets the on-chain permission instantly.

```json
Request body:
{ "role": "nurse" }

Valid roles: nurse · doctor · pharmacist · consent_officer · auditor · pending
```

#### DELETE /api/v1/admin/users/{id}
Remove a user from the system.

#### GET /api/v1/hash/{datasetId}  *(read only)*
Admin can read any record on-chain.

### Blocked Endpoints
| Endpoint | Response |
|----------|----------|
| POST /api/v1/hash | 403 — admin has no INGESTION_ROLE on-chain |
| POST /api/v1/hash/validate | 403 — admin has no VALIDATOR_ROLE on-chain |
| GET /api/v1/hash/audit/summary | 403 — auditor role required |

---

## Role 2 — Nurse

**What they do:** Submit medical record hashes to the blockchain. Nurses hold `INGESTION_ROLE` on-chain.

**Permitted record types:** `LAB_RESULT` · `DIAGNOSIS` · `IMAGING`

### Allowed Endpoints

#### POST /api/v1/hash — Store a record hash
Submit a SHA-256 hash of a medical file. The file itself stays in your hospital system — only the fingerprint goes on-chain.

```json
Request body:
{
  "datasetId":   "LAB-P10042-CBC-20240401",
  "hash":        "0x3c59dc048e8850243be8079a5c74d079934b91d7321b8e09f8ce1fde91baa2ae",
  "recordType":  "LAB_RESULT",
  "metadataCID": "QmLabCBCP10042"
}

Response (201):
{
  "success": true,
  "data": {
    "transactionHash": "0xabc...",
    "blockNumber": 38644017,
    "status": "confirmed"
  }
}
```

#### POST /api/v1/hash/upload — Upload file directly to IPFS
Upload a real file (PDF, Word, DICOM, image — max 4 MB). Hash is computed automatically, file is pinned to Pinata IPFS, and hash is stored on-chain.

```
Form fields:
  file        → select your PDF/Word/image file
  datasetId   → unique ID e.g. LAB-P10042-XRAY-001
  recordType  → LAB_RESULT / DIAGNOSIS / IMAGING

Response:
{
  "hash":    "0x3c59dc...",
  "cid":     "QmXyz...",
  "ipfsUrl": "https://gateway.pinata.cloud/ipfs/QmXyz..."  ← open in browser
}
```

#### PUT /api/v1/hash/{datasetId} — Update an existing record
Amend a record (e.g. corrected lab result). The old hash is preserved in history on-chain.

```json
Request body:
{
  "hash":        "0xnew64charhashhere...",
  "metadataCID": "QmUpdatedCID"
}
```

#### GET /api/v1/hash/{datasetId} — Read a record
Retrieve any stored record. Returns hash, timestamp, submitter address, and record type.

#### GET /api/v1/hash/history/{datasetId} — Version history
See all previous hashes for an amended record.

#### GET /api/v1/hash/check/{datasetId}/{hash} — Integrity check
Verify a file against its on-chain hash. Returns `isValid: true/false`. No blockchain transaction — instant and free.

### Blocked Endpoints
| Endpoint | Response |
|----------|----------|
| POST /hash with PRESCRIPTION | 403 — pharmacist role required |
| POST /hash with CONSENT_FORM | 403 — consent officer role required |
| POST /hash/validate | 403 — doctor role required |
| GET /audit/summary | 403 — auditor role required |

### Pre-Seeded Records (already on-chain)
| Dataset ID | Type |
|-----------|------|
| `LAB-P10042-CBC-20240318` | LAB_RESULT |
| `LAB-P10042-CMP-20240318` | LAB_RESULT |
| `LAB-P10099-HBA1C-20240320` | LAB_RESULT |
| `IMG-P10099-CXR-20240320` | IMAGING |
| `DX-P10042-T2DM-HTN-20240318` | DIAGNOSIS |

---

## Role 3 — Doctor

**What they do:** Validate that a record has not been tampered with. Doctors hold `VALIDATOR_ROLE` on-chain. Validation writes an `IntegrityChecked` audit event to the blockchain.

### Allowed Endpoints

#### POST /api/v1/hash/validate — Validate a record (on-chain)
Confirm a record's integrity. This writes a permanent audit event on-chain — who validated, when, and whether the hash matched.

```json
Request body:
{
  "datasetId": "LAB-P10042-CBC-20240318",
  "hash":      "0x3c59dc048e8850243be8079a5c74d079934b91d7321b8e09f8ce1fde91baa2ae"
}

Response:
{
  "success": true,
  "data": {
    "isValid":         true,
    "recordTypeName":  "LAB_RESULT",
    "transactionHash": "0xabc...",
    "blockNumber":     38667735
  }
}
```

> To get the correct hash: call `GET /hash/{datasetId}` first — the `hash` field in the response is what to validate against.

#### GET /api/v1/hash/check/{datasetId}/{hash} — Quick read-only check
No blockchain transaction. Instant comparison against stored hash. Use this to check before committing a full on-chain validation.

#### GET /api/v1/hash/{datasetId} — Read a record
#### GET /api/v1/hash/history/{datasetId} — Version history

### Blocked Endpoints
| Endpoint | Response |
|----------|----------|
| POST /hash | 403 — nurse/pharmacist/consent officer only |
| GET /audit/summary | 403 — auditor role required |

---

## Role 4 — Pharmacist

**What they do:** Submit prescription hashes to the blockchain. Pharmacists hold `PHARMACIST_ROLE` on-chain.

**Permitted record types:** `PRESCRIPTION` only

### Allowed Endpoints

#### POST /api/v1/hash — Store a prescription
```json
{
  "datasetId":   "RX-P10042-MET-20240401",
  "hash":        "0xb2c3d4e5f67890123456789012345678901234567890123456789012b2c3d4e5",
  "recordType":  "PRESCRIPTION",
  "metadataCID": "QmRxMetforminP10042"
}
```

#### POST /api/v1/hash/upload — Upload prescription file to IPFS
Upload the actual prescription document. Returns an IPFS link the patient or doctor can open.

#### PUT /api/v1/hash/{datasetId} — Amend a prescription
#### GET /api/v1/hash/{datasetId} — Read any record
#### GET /api/v1/hash/check/{datasetId}/{hash} — Verify a prescription

### Blocked Endpoints
| Endpoint | Response |
|----------|----------|
| POST /hash with LAB_RESULT | 403 |
| POST /hash with DIAGNOSIS | 403 |
| POST /hash with IMAGING | 403 |
| POST /hash with CONSENT_FORM | 403 |
| POST /hash/validate | 403 |

### Pre-Seeded Records
| Dataset ID | Type |
|-----------|------|
| `RX-P10042-MET-20240318` | PRESCRIPTION |
| `RX-P10042-AML-20240318` | PRESCRIPTION |
| `RX-P10099-INS-20240320` | PRESCRIPTION |

---

## Role 5 — Consent Officer

**What they do:** Submit patient consent form hashes. Holds `CONSENT_MANAGER_ROLE` on-chain.

**Permitted record types:** `CONSENT_FORM` only

### Allowed Endpoints

#### POST /api/v1/hash — Store a consent form
```json
{
  "datasetId":   "CONSENT-P10042-STUDY-20240401",
  "hash":        "0xc3d4e5f6789012345678901234567890123456789012345678901234c3d4e5f6",
  "recordType":  "CONSENT_FORM",
  "metadataCID": "QmConsentP10042Study"
}
```

#### POST /api/v1/hash/upload — Upload consent document to IPFS
#### PUT /api/v1/hash/{datasetId} — Amend a consent record
#### GET /api/v1/hash/{datasetId} — Read any record

### Blocked Endpoints
| Endpoint | Response |
|----------|----------|
| POST /hash with any other type | 403 |
| POST /hash/validate | 403 |

### Pre-Seeded Records
| Dataset ID | Type |
|-----------|------|
| `CONSENT-P10042-STUDY-20240315` | CONSENT_FORM |
| `CONSENT-P10099-STUDY-20240316` | CONSENT_FORM |

---

## Role 6 — Auditor

**What they do:** Read compliance statistics. Holds `AUDITOR_ROLE` on-chain. Cannot write anything.

### Allowed Endpoints

#### GET /api/v1/hash/audit/summary — Compliance dashboard
Returns record counts by type across the entire system.

```json
Response:
{
  "success": true,
  "data": {
    "labResults":     7,
    "diagnoses":      1,
    "prescriptions":  5,
    "consentForms":   2,
    "imagingRecords": 1,
    "total":          16
  }
}
```

#### GET /api/v1/hash/{datasetId} — Read any record
#### GET /api/v1/hash/history/{datasetId} — Version history
#### GET /api/v1/hash/check/{datasetId}/{hash} — Integrity check

### Blocked Endpoints
| Endpoint | Response |
|----------|----------|
| POST /hash | 403 |
| POST /hash/validate | 403 |
| Any admin endpoint | 403 |

---

## Complete Permission Matrix

| Endpoint | Admin | Nurse | Doctor | Pharmacist | Consent Officer | Auditor |
|----------|:-----:|:-----:|:------:|:----------:|:---------------:|:-------:|
| GET /auth/me | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| POST /hash (LAB_RESULT) | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| POST /hash (DIAGNOSIS) | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| POST /hash (IMAGING) | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| POST /hash (PRESCRIPTION) | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| POST /hash (CONSENT_FORM) | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| POST /hash/upload | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ |
| PUT /hash/:id | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ |
| GET /hash/:id | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| GET /hash/history/:id | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| POST /hash/validate | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| GET /hash/check/:id/:hash | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| GET /hash/audit/summary | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| GET /admin/users | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| PUT /admin/users/:id/role | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| DELETE /admin/users/:id | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## End-to-End Workflow Example

```
Step 1 — Nurse stores a blood test result
  Login: sara.johnson@comfortage.health / Nurse@Sara2024!
  POST /hash
    datasetId:  "LAB-P10042-CBC-20240401"
    hash:       "0x3c59dc048e8850243be8079a5c74d079934b91d7321b8e09f8ce1fde91baa2ae"
    recordType: "LAB_RESULT"
  → confirmed on Reltime Mainnet (transactionHash, blockNumber)

Step 2 — Doctor reviews and validates
  Login: dr.emily.chen@comfortage.health / Doctor@Emily2024!
  GET /hash/LAB-P10042-CBC-20240401  ← get the stored hash
  POST /hash/validate
    datasetId: "LAB-P10042-CBC-20240401"
    hash:      "0x3c59dc..."
  → isValid: true, IntegrityChecked event written on-chain

Step 3 — Pharmacist submits the prescription
  Login: anna.schmidt@comfortage.health / Pharma@Anna2024!
  POST /hash
    datasetId:  "RX-P10042-MET-20240401"
    hash:       "0xb2c3d4e5..."
    recordType: "PRESCRIPTION"
  → confirmed on-chain

Step 4 — Auditor checks compliance
  Login: claire.dubois@comfortage.health / Audit@Claire2024!
  GET /hash/audit/summary
  → { labResults: 8, prescriptions: 6, total: 17 }
```

---

## Generating a SHA-256 Hash

```bash
# Node.js
const hash = '0x' + require('crypto').createHash('sha256').update(fileBuffer).digest('hex');

# Python
import hashlib
hash = '0x' + hashlib.sha256(open('record.pdf','rb').read()).hexdigest()

# Mac / Linux terminal
shasum -a 256 record.pdf
```

Or use **POST /hash/upload** — the API computes the hash automatically from your file.

---

## Common Errors

| HTTP | Error | Cause | Fix |
|------|-------|-------|-----|
| 401 | Invalid email or password | Wrong credentials | Check the password in the table above |
| 401 | Authentication required | No token | Click Authorize 🔓 and paste token |
| 403 | Role not permitted | Using wrong account for this action | Switch to the correct role account |
| 400 | hash must be 64-char hex | Hash is wrong length or format | Must be `0x` + exactly 64 hex characters |
| 409 | Dataset already exists | datasetId already used | Use a unique datasetId or PUT to update |
| 503 | IPFS service not configured | PINATA_JWT missing | Add PINATA_JWT to Vercel environment variables |

---

## Local Setup

```bash
npm install
npm run seed         # seed all 11 test users
PORT=3001 npm start
open http://localhost:3001/docs
open http://localhost:3001/guide
```

---

## Pinata IPFS Setup (for file upload)

1. Create a free account at **[pinata.cloud](https://pinata.cloud)**
2. Go to **API Keys → New Key** → enable `pinFileToIPFS` → generate
3. Copy the **JWT** (long token starting with `eyJ...`)
4. In Vercel: **Settings → Environment Variables → `PINATA_JWT`** = your JWT
5. Redeploy — `POST /hash/upload` will then accept real files
