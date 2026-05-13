# COMFORTage API — Swagger Testing Guide

**Swagger UI:** `http://localhost:3001/docs` (local) · `https://comfortage-git-main-yashvijay2711-2103s-projects.vercel.app/docs` (Vercel)

---

## Quick Start (3 steps)

### Step 1 — Open Swagger and pick a server
Go to `/docs`. At the top of the page there is a **Servers** dropdown.
- If you are running locally → select `http://localhost:3001`
- If you are on Vercel → the current Vercel URL is selected automatically

### Step 2 — Login and copy your token
1. Expand **Auth → POST /api/v1/auth/login**
2. Click **Try it out**
3. Click the **Examples** dropdown and pick any test user (e.g. "🩺 Login as Nurse")
4. Click **Execute**
5. From the response body, copy the value of `"token"` (the long string starting with `eyJ…`)

### Step 3 — Authorize
1. Click the **Authorize 🔓** button at the top-right of the page
2. In the **bearerAuth** field, paste your token (without any prefix — just the token itself)
3. Click **Authorize** → **Close**
4. All protected endpoints now work for your session

---

## Test Users

| Role | Email | Password | What they can do |
|------|-------|----------|-----------------|
| **Nurse** | `sara.johnson@comfortage.health` | `Nurse@Sara2024!` | Store & amend hashes (LAB, IMAGING, DIAGNOSIS) |
| **Doctor** | `dr.emily.chen@comfortage.health` | `Doctor@Emily2024!` | Validate hashes on-chain |
| **Pharmacist** | `anna.schmidt@comfortage.health` | `Pharma@Anna2024!` | Store & amend PRESCRIPTION hashes |
| **Consent Officer** | `sofia.russo@comfortage.health` | `Consent@Sofia2024!` | Store CONSENT_FORM hashes |
| **Auditor** | `claire.dubois@comfortage.health` | `Audit@Claire2024!` | Read audit summary (read-only) |
| **Admin** | `admin@comfortage.health` | `Admin@Comfortage2024!` | Manage users, assign roles |

> **Note:** Each role maps to an on-chain permission. If you try an action your role doesn't have, the blockchain will revert the transaction with a 403 or 500 error.

---

## All Endpoints — What They Do and How to Test

### Public (no token needed)

#### `GET /health`
Checks if the server and blockchain are reachable.
- Click **Try it out → Execute**
- Expected: `{ "status": "healthy" }`

#### `POST /api/v1/auth/register`
Creates a new account. Role starts as `pending` until an admin assigns one.
- Use the **"Register a nurse"** example or fill in your own email/password/fullName
- Expected: `201` with a JWT token

#### `POST /api/v1/auth/login`
Returns a JWT token. **This is always your first step.**
- Use the **Examples dropdown** to pick a pre-built test user
- Copy the `token` from the response
- Paste it into **Authorize 🔓** at the top of the page

---

### Auth (token required)

#### `GET /api/v1/auth/me`
Returns the profile of whichever user is currently authorized.
- Authorize first, then Execute
- Expected: your user's email, role, and wallet address

---

### Hash / Blockchain (token required)

#### `POST /api/v1/hash` — Store a record hash
Writes a SHA-256 hash to the blockchain. **Requires nurse, pharmacist, or consent_officer token.**
- Use the **Examples dropdown** (e.g. "🩸 Store CBC blood panel")
- Expected: `{ "success": true, "data": { "transactionHash": "0x…", "blockNumber": … } }`
- **Common error:** 500 with "transaction execution reverted" → your wallet doesn't have the right on-chain role. Switch to the correct user.

#### `GET /api/v1/hash/{datasetId}` — Retrieve a record
Reads a stored record by its datasetId.
- Fill in a `datasetId` you previously stored (e.g. `LAB-TEST-001`)
- Expected: hash, timestamp, submitter address, recordTypeName

#### `PUT /api/v1/hash/{datasetId}` — Amend a record
Stores a new version of a record (original is preserved on-chain).
- Fill in the `datasetId` path parameter
- Provide a new `hash` value in the body
- Expected: new transaction hash, version incremented

#### `GET /api/v1/hash/history/{datasetId}` — Version history
Lists every version ever stored for a datasetId.
- Expected: `{ "data": { "totalVersions": 2, "versions": […] } }`

#### `POST /api/v1/hash/validate` — Validate integrity (on-chain event)
Checks if a hash matches what's on-chain AND writes an audit event to the blockchain. **Requires doctor token.**
- Use **"✅ Validate a real record"** example for `isValid: true`
- Use **"❌ Simulate tampered data"** example for `isValid: false`
- Expected: `{ "data": { "isValid": true/false, "transactionHash": "0x…" } }`

#### `GET /api/v1/hash/check/{datasetId}/{hash}` — Quick integrity check
Same as validate but **read-only** — no blockchain transaction, no gas, instant.
- Fill both path parameters
- Expected: `{ "data": { "isValid": true/false } }` with no `transactionHash`

#### `GET /api/v1/hash/audit/summary` — Compliance audit summary
Returns a count of all records by type. **Requires auditor token.**
- Expected: `{ "data": { "labResults": 5, "prescriptions": 4, … "total": 13 } }`

---

### Admin (admin token required)

#### `GET /api/v1/admin/users` — List all users
Returns every registered user with their role and wallet address.

#### `GET /api/v1/admin/users/{id}` — Get single user
Returns one user by their numeric database ID.

#### `PUT /api/v1/admin/users/{id}/role` — Assign a role
Changes a user's role. Use the **Examples dropdown** to pick nurse/doctor/pharmacist etc.
- **Important:** This only updates the database role. On-chain role grants are handled separately via the smart contract's `grantRole` function.

#### `DELETE /api/v1/admin/users/{id}` — Delete a user
Permanently removes a user from the database.

---

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `401 Invalid email or password` | User not in database | Run `npm run seed` to create test users |
| `401 No token provided` | Forgot to authorize | Click **Authorize 🔓** and paste your token |
| `403 Forbidden` | Your role can't do this action | Switch to the correct user (see role table above) |
| `500 transaction execution reverted` | Wallet lacks on-chain role | Use a pre-seeded test user — their wallets have roles granted on-chain |
| `Failed to fetch` in browser | Mixed HTTP/HTTPS or wrong server | Check the **Servers** dropdown matches where you're testing |
| `404 Endpoint not found` | Wrong URL or method | Double-check you're using the right HTTP method (PUT vs POST) |

---

## Local Development Setup

```bash
# 1. Install dependencies
npm install

# 2. Seed test users into the local database
npm run seed

# 3. Start the server on port 3001 (port 3000 may be taken by another app)
PORT=3001 npm start

# 4. Open Swagger
open http://localhost:3001/docs
```

---

## Workflow Example: Store → Validate → Audit

```
1. Login as Nurse (Sara Johnson)           → copy token → Authorize
2. POST /api/v1/hash                       → store LAB-P10042 → note datasetId
3. Login as Doctor (Dr. Emily Chen)        → copy token → Authorize
4. POST /api/v1/hash/validate              → validate LAB-P10042 → isValid: true
5. Login as Auditor (Claire Dubois)        → copy token → Authorize
6. GET /api/v1/hash/audit/summary          → see total record counts
```
