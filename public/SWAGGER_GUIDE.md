# COMFORTage T3.3 — API Reference & Testing Guide

**Swagger UI:** `http://localhost:3001/docs` (local) · `/docs` on your Vercel deployment

---

## About This System

**Network:** Reltime Mainnet · PoA · Chain ID 32323 · Zero gas fees
**Contract:** `0xb032Fca326E02254d50509f35F8D6fd4cccDB3B0`

### Why Proof of Authority (PoA) in Healthcare?

| Benefit | Detail |
|---------|--------|
| **Scalability & Speed** | Faster transactions with high throughput — critical for real-time medical data management |
| **Energy Efficiency** | No resource-intensive mining (unlike PoW) — sustainable for large-scale health infrastructure |
| **Trusted Security** | Pre-approved, identified validators (hospitals, regulators) ensure integrity; bad actors can be identified and removed |

### What Gets Stored On-Chain?

Nothing personal. Only the cryptographic fingerprint (SHA-256 hash) of the record is stored.

| What You Have (Off-Chain) | What Blockchain Stores |
|---------------------------|------------------------|
| CBC blood panel PDF | `0x3c59dc04…` (64-char hash) |
| Metformin prescription | `0xa1b2c3d4…` (64-char hash) |
| Signed consent form | `0xf9e8d7c6…` (64-char hash) |
| Chest X-ray DICOM | `0x11223344…` (64-char hash) |

Even if the entire blockchain were compromised, an attacker would only see strings of random characters — **zero readable medical information**.

### Record Types

| Type | Code | Who Can Submit | Real-World Example |
|------|------|----------------|--------------------|
| Lab Result | `LAB_RESULT` | Nurse | CBC blood panel, HbA1c, CMP |
| Diagnosis | `DIAGNOSIS` | Nurse | ICD-10 coded clinical diagnosis |
| Prescription | `PRESCRIPTION` | Pharmacist | Metformin 500mg BID × 60 |
| Consent Form | `CONSENT_FORM` | Consent Manager | Study participation consent |
| Imaging | `IMAGING` | Nurse | Chest X-ray, MRI, CT scan |

### Real-World Clinical Workflow

```
STEP 1 — Nurse uploads a lab test (PDF, Word, DICOM, etc.)
  Nurse has a lab result file (e.g. "CBC_blood_panel.pdf")
  → Compute SHA-256 hash of the file (see "Generating a SHA-256 Hash" below)
  → POST /api/v1/hash  with recordType: LAB_RESULT
  → Hash is stored on-chain; the actual file stays in your hospital system

STEP 2 — Doctor reviews and writes a prescription
  Doctor calls GET /api/v1/hash/{datasetId} to confirm the record exists
  → POST /api/v1/hash/validate to certify it on-chain (IntegrityChecked audit event)
  Pharmacist or Nurse then submits the prescription file:
  → POST /api/v1/hash  with recordType: PRESCRIPTION

STEP 3 — Pharmacist verifies the prescription
  Pharmacist receives the physical prescription or file
  → Compute SHA-256 hash of their copy of the file
  → GET /api/v1/hash/check/{datasetId}/{hash}  (read-only, no gas)
  → isValid: true  = file is unchanged, safe to dispense
  → isValid: false = file was tampered — do NOT dispense
```

> **Important:** The API stores the cryptographic fingerprint (hash) of files, not the files themselves.
> PDFs, Word docs, and images live in your existing hospital system or secure storage.
> The blockchain acts as a tamper-proof receipt — anyone with the original file can verify it instantly.

### How the System Works

```
1. TRUTH MACHINE — Version tracking
   Nurse uploads lab result → hash stored on-chain
   Record updated → new hash stored → old hash preserved in history
   Anyone can compare file against on-chain hash — one changed character = mismatch = TAMPERED

2. ACCOUNTABILITY — Role-based audit trail
   Nurse uploads → on-chain record: who, when, what type
   Doctor validates → on-chain IntegrityChecked event: validator address + result
   Auditor reads summary → compliance dashboard, no patient data exposed

3. PATIENT PORTABILITY — Data is yours
   Records live off-chain (hospital system, secure app, cloud)
   Blockchain holds the "receipt" — any new hospital can verify authenticity instantly
```

### How Authentication Works

Users never interact with blockchain wallets directly. The backend manages wallets transparently.

```
Register  →  backend generates wallet  →  private key encrypted (AES-256-GCM) in DB
Login     →  JWT returned with role
API call  →  backend decrypts key  →  signs on-chain tx using your wallet
```

---

## Quick Start (3 Steps)

### Step 1 — Login to get your token

In Swagger: expand **Account → POST /api/v1/auth/login**, click **Try it out**, pick an example from the dropdown, click **Execute**, and copy the `token` value from the response.

Or via curl:
```bash
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"sara.johnson@comfortage.health","password":"Nurse@Sara2024!"}'
```

### Step 2 — Authorize in Swagger

Click the **Authorize 🔓** button (top-right). Paste the token (no prefix, just the raw `eyJ…` string). Click **Authorize → Close**.

### Step 3 — Call any endpoint

All protected endpoints now work for your session. Token expires after 24 hours — just login again.

---

## Test Accounts

| Role | Email | Password | What they can do |
|------|-------|----------|-----------------|
| **Admin** | `admin@comfortage.health` | `Admin@Comfortage2024!` | Manage users, assign roles — **cannot submit blockchain records** (no on-chain role) |
| **Nurse 1** | `sara.johnson@comfortage.health` | `Nurse@Sara2024!` | Store LAB_RESULT, DIAGNOSIS, IMAGING |
| **Nurse 2** | `miguel.torres@comfortage.health` | `Nurse@Miguel2024!` | Store LAB_RESULT, DIAGNOSIS, IMAGING |
| **Doctor 1** | `dr.emily.chen@comfortage.health` | `Doctor@Emily2024!` | Validate any record type (on-chain audit) |
| **Doctor 2** | `dr.james.patel@comfortage.health` | `Doctor@James2024!` | Validate any record type (on-chain audit) |
| **Pharmacist 1** | `anna.schmidt@comfortage.health` | `Pharma@Anna2024!` | Store PRESCRIPTION only |
| **Pharmacist 2** | `lucas.martin@comfortage.health` | `Pharma@Lucas2024!` | Store PRESCRIPTION only |
| **Consent Mgr 1** | `sofia.russo@comfortage.health` | `Consent@Sofia2024!` | Store CONSENT_FORM only |
| **Consent Mgr 2** | `alex.nguyen@comfortage.health` | `Consent@Alex2024!` | Store CONSENT_FORM only |
| **Auditor 1** | `claire.dubois@comfortage.health` | `Audit@Claire2024!` | Read compliance audit summary |
| **Auditor 2** | `peter.kowalski@comfortage.health` | `Audit@Peter2024!` | Read compliance audit summary |

> Each role maps to an on-chain permission. Using an action your role doesn't have will return a 500 transaction revert.

---

## Pre-Seeded Records

These dataset IDs are already stored on-chain. Use them directly in `GET /hash/{datasetId}`.

| Dataset ID | Type | Patient | Submitted By |
|-----------|------|---------|--------------|
| `LAB-P10042-CBC-20240318` | LAB_RESULT | P10042 | Sara Johnson (Nurse) |
| `LAB-P10042-CMP-20240318` | LAB_RESULT | P10042 | Sara Johnson (Nurse) |
| `LAB-P10099-HBA1C-20240320` | LAB_RESULT | P10099 | Miguel Torres (Nurse) |
| `IMG-P10099-CXR-20240320` | IMAGING | P10099 | Miguel Torres (Nurse) |
| `DX-P10042-T2DM-HTN-20240318` | DIAGNOSIS | P10042 | Sara Johnson (Nurse) |
| `RX-P10042-MET-20240318` | PRESCRIPTION | P10042 | Anna Schmidt (Pharmacist) |
| `RX-P10042-AML-20240318` | PRESCRIPTION | P10042 | Anna Schmidt (Pharmacist) |
| `RX-P10099-INS-20240320` | PRESCRIPTION | P10099 | Lucas Martin (Pharmacist) |
| `CONSENT-P10042-STUDY-20240315` | CONSENT_FORM | P10042 | Sofia Russo (Consent Mgr) |
| `CONSENT-P10099-STUDY-20240316` | CONSENT_FORM | P10099 | Alex Nguyen (Consent Mgr) |

---

## Role → On-Chain Permission Mapping

When an admin assigns a role, the backend simultaneously updates the DB and calls `contract.grantRole()` on Reltime Mainnet.

| Role | Solidity Constant | Permitted Actions |
|------|-------------------|-------------------|
| `nurse` | `INGESTION_ROLE` | Store LAB_RESULT, DIAGNOSIS, IMAGING |
| `doctor` | `VALIDATOR_ROLE` | Validate all record types |
| `pharmacist` | `PHARMACIST_ROLE` | Store PRESCRIPTION |
| `consent_manager` | `CONSENT_MANAGER_ROLE` | Store CONSENT_FORM |
| `auditor` | `AUDITOR_ROLE` | Read audit summary |
| `admin` | — | All of the above + user management |

---

## Endpoint Reference

### Public

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service + blockchain status |
| POST | `/api/v1/auth/register` | Create account (role starts as `pending`) |
| POST | `/api/v1/auth/login` | Get JWT token |

### Auth (any valid token)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/auth/me` | Your profile and wallet address |

### Records (nurse / pharmacist / consent_officer)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/hash` | Store a hash on-chain |
| GET | `/api/v1/hash/{datasetId}` | Retrieve a stored record |
| PUT | `/api/v1/hash/{datasetId}` | Amend a record (preserves history) |
| GET | `/api/v1/hash/history/{datasetId}` | Full version history |

### Validation (doctor)

| Method | Path | On-Chain Tx | Description |
|--------|------|:-----------:|-------------|
| POST | `/api/v1/hash/validate` | Yes | Validate + write audit event |
| GET | `/api/v1/hash/check/{datasetId}/{hash}` | No | Quick read-only integrity check |

### Audit (auditor)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/hash/audit/summary` | Record counts by type |

### Admin

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/admin/users` | List all users |
| GET | `/api/v1/admin/users/{id}` | Get single user |
| PUT | `/api/v1/admin/users/{id}/role` | Assign a role |
| DELETE | `/api/v1/admin/users/{id}` | Delete a user |

---

## Example Workflow: Store → Validate → Audit

```
1. Authorize as Nurse (Sara Johnson)
2. POST /api/v1/hash
      datasetId: "LAB-P10042-NEWCBC-20240401"
      hash:      "0x3c59dc048e8850243be8079a5c74d079934b91d7321b8e09f8ce1fde91baa2ae"
      recordType: "LAB_RESULT"
      metadataCID: "QmLabCBCP10042Apr2024"
   → confirmed on-chain, get transactionHash

3. Authorize as Doctor (Dr. Emily Chen)
4. POST /api/v1/hash/validate
      datasetId: "LAB-P10042-NEWCBC-20240401"
      hash:      "0x3c59dc048e8850243be8079a5c74d079934b91d7321b8e09f8ce1fde91baa2ae"
   → isValid: true, IntegrityChecked event written on-chain

5. Authorize as Auditor (Claire Dubois)
6. GET /api/v1/hash/audit/summary
   → { labResults: N, prescriptions: N, … total: N }
```

---

## Generating a SHA-256 Hash

```bash
# Node.js
const crypto = require('crypto');
const hash = '0x' + crypto.createHash('sha256').update(fileBuffer).digest('hex');

# Python
import hashlib
hash = '0x' + hashlib.sha256(open('record.pdf','rb').read()).hexdigest()

# Linux / Mac terminal
sha256sum record.pdf
```

---

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `401 Invalid email or password` | User not in database | Run `npm run seed` |
| `401 No token` | Forgot to authorize | Click Authorize 🔓 and paste token |
| `403 Forbidden` | Wrong role for this action | Switch to the correct test account |
| `500 transaction execution reverted` | Wallet lacks on-chain role | Use a pre-seeded test account |
| `Failed to fetch` in Swagger | Wrong server selected or mixed HTTP/HTTPS | Check the Servers dropdown at the top of Swagger UI |

---

## Local Setup

```bash
npm install          # install dependencies
npm run seed         # create test users in local DB
PORT=3001 npm start  # start server (3000 may be taken by another app)
open http://localhost:3001/docs
```
