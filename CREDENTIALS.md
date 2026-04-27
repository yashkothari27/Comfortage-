# COMFORTage T3.3 — User Credentials & Role Reference

**Network:** Reltime Mainnet (Chain ID: 32323)  
**Contract:** `0xb032Fca326E02254d50509f35F8D6fd4cccDB3B0`  
**Generated:** 2026-04-27  

> Blockchain wallets are provisioned and managed by the backend.  
> Users authenticate with email + password only — no wallet interaction required.

---

## How Authentication Works

```
1. POST /api/v1/auth/login  { "email": "...", "password": "..." }
   → returns { "token": "eyJ..." }

2. All subsequent requests:
   Authorization: Bearer <token>

3. Role assignment (admin only):
   PUT /api/v1/admin/users/:id/role  { "role": "nurse" }
   → grants on-chain role to user's wallet automatically
```

---

## Admin Account

| Field          | Value                              |
|----------------|------------------------------------|
| **Email**      | admin@comfortage.health            |
| **Password**   | Admin@Comfortage2024!              |
| **Role**       | admin                              |
| **Permissions**| Assign roles, list all users, manage system |

---

## Nurse — INGESTION_ROLE
*Can submit: LAB_RESULT, DIAGNOSIS, IMAGING*

### Nurse 1 — Sara Johnson

| Field        | Value                                    |
|--------------|------------------------------------------|
| **Email**    | sara.johnson@comfortage.health           |
| **Password** | Nurse@Sara2024!                          |
| **Role**     | nurse                                    |
| **On-chain** | INGESTION_ROLE                           |
| **Allowed Record Types** | LAB_RESULT, DIAGNOSIS, IMAGING |

### Nurse 2 — Miguel Torres

| Field        | Value                                    |
|--------------|------------------------------------------|
| **Email**    | miguel.torres@comfortage.health          |
| **Password** | Nurse@Miguel2024!                        |
| **Role**     | nurse                                    |
| **On-chain** | INGESTION_ROLE                           |
| **Allowed Record Types** | LAB_RESULT, DIAGNOSIS, IMAGING |

---

## Doctor — VALIDATOR_ROLE
*Can validate: all record types (emits on-chain audit event)*

### Doctor 1 — Dr. Emily Chen

| Field        | Value                                    |
|--------------|------------------------------------------|
| **Email**    | dr.emily.chen@comfortage.health          |
| **Password** | Doctor@Emily2024!                        |
| **Role**     | doctor                                   |
| **On-chain** | VALIDATOR_ROLE                           |
| **Allowed Actions** | POST /hash/validate (all types)   |

### Doctor 2 — Dr. James Patel

| Field        | Value                                    |
|--------------|------------------------------------------|
| **Email**    | dr.james.patel@comfortage.health         |
| **Password** | Doctor@James2024!                        |
| **Role**     | doctor                                   |
| **On-chain** | VALIDATOR_ROLE                           |
| **Allowed Actions** | POST /hash/validate (all types)   |

---

## Pharmacist — PHARMACIST_ROLE
*Can submit: PRESCRIPTION records only*

### Pharmacist 1 — Anna Schmidt

| Field        | Value                                    |
|--------------|------------------------------------------|
| **Email**    | anna.schmidt@comfortage.health           |
| **Password** | Pharma@Anna2024!                         |
| **Role**     | pharmacist                               |
| **On-chain** | PHARMACIST_ROLE                          |
| **Allowed Record Types** | PRESCRIPTION only            |

### Pharmacist 2 — Lucas Martin

| Field        | Value                                    |
|--------------|------------------------------------------|
| **Email**    | lucas.martin@comfortage.health           |
| **Password** | Pharma@Lucas2024!                        |
| **Role**     | pharmacist                               |
| **On-chain** | PHARMACIST_ROLE                          |
| **Allowed Record Types** | PRESCRIPTION only            |

---

## Consent Manager — CONSENT_MANAGER_ROLE
*Can submit: CONSENT_FORM records only*

### Consent Manager 1 — Sofia Russo

| Field        | Value                                    |
|--------------|------------------------------------------|
| **Email**    | sofia.russo@comfortage.health            |
| **Password** | Consent@Sofia2024!                       |
| **Role**     | consent_manager                          |
| **On-chain** | CONSENT_MANAGER_ROLE                     |
| **Allowed Record Types** | CONSENT_FORM only            |

### Consent Manager 2 — Alex Nguyen

| Field        | Value                                    |
|--------------|------------------------------------------|
| **Email**    | alex.nguyen@comfortage.health            |
| **Password** | Consent@Alex2024!                        |
| **Role**     | consent_manager                          |
| **On-chain** | CONSENT_MANAGER_ROLE                     |
| **Allowed Record Types** | CONSENT_FORM only            |

---

## Auditor — AUDITOR_ROLE
*Read-only compliance access: GET /hash/audit/summary*

### Auditor 1 — Claire Dubois

| Field        | Value                                    |
|--------------|------------------------------------------|
| **Email**    | claire.dubois@comfortage.health          |
| **Password** | Audit@Claire2024!                        |
| **Role**     | auditor                                  |
| **On-chain** | AUDITOR_ROLE                             |
| **Allowed Actions** | GET /hash/audit/summary (read-only) |

### Auditor 2 — Peter Kowalski

| Field        | Value                                    |
|--------------|------------------------------------------|
| **Email**    | peter.kowalski@comfortage.health         |
| **Password** | Audit@Peter2024!                         |
| **Role**     | auditor                                  |
| **On-chain** | AUDITOR_ROLE                             |
| **Allowed Actions** | GET /hash/audit/summary (read-only) |

---

## Role Permission Matrix

| Role             | Store Hash | Update Hash | Validate Hash | Audit Summary | Manage Users |
|------------------|:----------:|:-----------:|:-------------:|:-------------:|:------------:|
| **admin**        | ✅ all     | ✅ all      | ✅            | ✅            | ✅           |
| **nurse**        | ✅ LAB, DX, IMG | ✅ same | ❌           | ❌            | ❌           |
| **doctor**       | ❌         | ❌          | ✅ all types  | ❌            | ❌           |
| **pharmacist**   | ✅ RX only | ✅ RX only  | ❌            | ❌            | ❌           |
| **consent_manager** | ✅ CONSENT only | ✅ CONSENT only | ❌ | ❌         | ❌           |
| **auditor**      | ❌         | ❌          | ❌            | ✅ read-only  | ❌           |

**Record type keys:** LAB = LAB_RESULT · DX = DIAGNOSIS · IMG = IMAGING · RX = PRESCRIPTION · CONSENT = CONSENT_FORM

---

## API Quick Reference

```bash
# Login
curl -X POST https://<host>/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"sara.johnson@comfortage.health","password":"Nurse@Sara2024!"}'

# Store a lab result (nurse)
curl -X POST https://<host>/api/v1/hash \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "datasetId": "LAB-P10042-CBC-20240318",
    "hash": "a3f1c2...<sha256_hex>",
    "recordType": "LAB_RESULT",
    "metadataCID": "QmXoypiz..."
  }'

# Validate a record (doctor)
curl -X POST https://<host>/api/v1/hash/validate \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"datasetId":"LAB-P10042-CBC-20240318","hash":"a3f1c2..."}'

# Audit summary (auditor)
curl https://<host>/api/v1/hash/audit/summary \
  -H "Authorization: Bearer <token>"

# Assign role (admin)
curl -X PUT https://<host>/api/v1/admin/users/3/role \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"role":"doctor"}'
```

---

## Security Notes

- Blockchain private keys are **never exposed** to users
- Private keys are encrypted at rest using **AES-256-GCM**
- Passwords are hashed with **bcrypt** (cost factor 12)
- JWT tokens expire after **24 hours**
- Role enforcement is **dual-layered**: JWT (API) + smart contract (on-chain)
- Cross-role record type submission is blocked at both layers and reverts on-chain
