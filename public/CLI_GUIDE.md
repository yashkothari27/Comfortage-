# COMFORTage T3.3 Command Line Guide

This guide shows how to call the COMFORTage T3.3 data integrity system from WSL Bash, Linux/macOS Bash, and Windows PowerShell without touching the server code or database directly.

Use the web UI when possible: `http://localhost:3000/app`

Use the API/CLI when you need repeatable uploads, batch ingestion, or automated verification.

## What This System Covers

The current implementation supports:

- IPFS file upload and permanent CID generation.
- On-chain SHA-256 hash anchoring on Reltime.
- Role-based upload permissions.
- Per-file access through authenticated roles.
- Per-column access control for CSV files through `columnPolicy`.
- Dataset lookup, data retrieval, update, version history, and read-only integrity checks.
- Doctor-only validation events.
- Auditor/admin audit summary.
- GUI use for non-technical users through `/app`.

Important privacy note: the system can reduce storage-custody burden by using IPFS, hashing, access control, and auditability. It does not remove GDPR/controller obligations by itself. The data controller still decides who receives access and must ensure lawful basis, minimization, retention, consent, and operational security.

## 1. Configure Your Base URL

For local development:

```bash
BASE_URL="http://localhost:3000"
```

For a deployed server:

```bash
BASE_URL="https://comfortage.vercel.app"
```

PowerShell:

```powershell
$BASE_URL = "http://localhost:3000"
```

## 2. Required Tools

WSL Bash:

```bash
sudo apt update
sudo apt install -y curl jq coreutils
```

PowerShell:

```powershell
curl.exe --version
```

For JSON formatting in PowerShell, `ConvertTo-Json` and `ConvertFrom-Json` are built in.

## 3. Login

All protected endpoints require a Bearer token.

WSL Bash:

```bash
TOKEN=$(curl -s -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"sara.johnson@comfortage.health","password":"Nurse@Sara2024!"}' \
  | jq -r '.token')

echo "$TOKEN" | cut -c1-24
```

PowerShell:

```powershell
$login = Invoke-RestMethod -Uri "$BASE_URL/api/v1/auth/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email":"sara.johnson@comfortage.health","password":"Nurse@Sara2024!"}'

$TOKEN = $login.token
$TOKEN.Substring(0, 24)
```

Test accounts:

| Role | Email | Password |
| --- | --- | --- |
| nurse | sara.johnson@comfortage.health | Nurse@Sara2024! |
| nurse | miguel.torres@comfortage.health | Nurse@Miguel2024! |
| doctor | dr.emily.chen@comfortage.health | Doctor@Emily2024! |
| doctor | dr.james.patel@comfortage.health | Doctor@James2024! |
| pharmacist | anna.schmidt@comfortage.health | Pharma@Anna2024! |
| consent_officer | sofia.russo@comfortage.health | Consent@Sofia2024! |
| auditor | claire.dubois@comfortage.health | Audit@Claire2024! |
| admin | admin@comfortage.health | Admin@Comfortage2024! |

## 4. Record Types and Upload Permissions

| Role | Allowed record types |
| --- | --- |
| nurse | `LAB_RESULT`, `DIAGNOSIS`, `IMAGING` |
| pharmacist | `PRESCRIPTION` |
| consent_officer | `CONSENT_FORM` |
| doctor | validation and data access; no upload |
| auditor | audit and read access; no upload |
| admin | user/audit administration |

## 5. Upload a File Without Column Restrictions

WSL Bash:

```bash
curl -s -X POST "$BASE_URL/api/v1/hash/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/file.csv;type=text/csv" \
  -F "datasetId=MFU-7-VITALS-001" \
  -F "recordType=LAB_RESULT" | jq .
```

PowerShell:

```powershell
curl.exe -s -X POST "$BASE_URL/api/v1/hash/upload" `
  -H "Authorization: Bearer $TOKEN" `
  -F "file=@C:\path\to\file.csv;type=text/csv" `
  -F "datasetId=MFU-7-VITALS-001" `
  -F "recordType=LAB_RESULT"
```

The response includes:

- `hash`: SHA-256 hash of the file.
- `fileCid`: raw file CID on IPFS.
- `ipfsUrl`: gateway URL.
- `transactionHash`: blockchain transaction.
- `blockNumber`: block where the proof was recorded.

## 6. Upload a CSV With Column-Level Access Control

Use `columnPolicy` to restrict individual CSV columns.

Rules:

- Unlisted columns are visible to everyone.
- `["*"]` means everyone can see that column.
- `admin` always sees all columns.
- Column names must match the CSV header exactly.

Example:

```bash
POLICY='{
  "participant_name": ["doctor","admin"],
  "date_of_birth": ["doctor","admin"],
  "diagnosis": ["doctor","admin"],
  "medication": ["doctor","pharmacist","admin"],
  "consent_notes": ["consent_officer","admin"],
  "heart_rate": ["*"],
  "blood_pressure": ["*"],
  "steps": ["*"]
}'

curl -s -X POST "$BASE_URL/api/v1/hash/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@synthetic_dataset.csv;type=text/csv" \
  -F "datasetId=SYNTHETIC-ACCESS-001" \
  -F "recordType=LAB_RESULT" \
  -F "columnPolicy=$POLICY" | jq .
```

PowerShell:

```powershell
$policy = @{
  participant_name = @("doctor", "admin")
  date_of_birth    = @("doctor", "admin")
  diagnosis        = @("doctor", "admin")
  medication       = @("doctor", "pharmacist", "admin")
  consent_notes    = @("consent_officer", "admin")
  heart_rate       = @("*")
  blood_pressure   = @("*")
  steps            = @("*")
} | ConvertTo-Json -Compress

curl.exe -s -X POST "$BASE_URL/api/v1/hash/upload" `
  -H "Authorization: Bearer $TOKEN" `
  -F "file=@C:\path\to\synthetic_dataset.csv;type=text/csv" `
  -F "datasetId=SYNTHETIC-ACCESS-001" `
  -F "recordType=LAB_RESULT" `
  -F "columnPolicy=$policy"
```

## 7. Retrieve Data With Role Filtering Applied

The API filters CSV columns automatically based on the logged-in user's role.

```bash
curl -s "$BASE_URL/api/v1/hash/SYNTHETIC-ACCESS-001/data" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Expected CSV response shape:

```json
{
  "success": true,
  "data": {
    "datasetId": "SYNTHETIC-ACCESS-001",
    "callerRole": "nurse",
    "visibleColumns": ["heart_rate", "blood_pressure", "steps"],
    "restrictedColumns": ["participant_name", "date_of_birth", "diagnosis"],
    "totalColumns": 6,
    "rows": []
  }
}
```

## 8. Lookup Dataset Metadata

```bash
curl -s "$BASE_URL/api/v1/hash/SYNTHETIC-ACCESS-001" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

## 9. View Version History

```bash
curl -s "$BASE_URL/api/v1/hash/history/SYNTHETIC-ACCESS-001" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

## 10. Update an Existing Dataset Hash

Use this when a dataset changes and you need a new on-chain version. If the file itself is changing, prefer uploading through the UI or upload endpoint so the IPFS CID is refreshed too.

```bash
NEW_HASH="0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
NEW_CID="QmExampleNewMetadataCid"

curl -s -X PUT "$BASE_URL/api/v1/hash/SYNTHETIC-ACCESS-001" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"hash\":\"$NEW_HASH\",\"metadataCID\":\"$NEW_CID\"}" | jq .
```

## 11. Check Local File Integrity

This is read-only. It does not create an on-chain transaction.

WSL Bash:

```bash
HASH="0x$(sha256sum synthetic_dataset.csv | awk '{print $1}')"

curl -s "$BASE_URL/api/v1/hash/check/SYNTHETIC-ACCESS-001/$HASH" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

PowerShell:

```powershell
$hash = "0x" + (Get-FileHash "C:\path\to\synthetic_dataset.csv" -Algorithm SHA256).Hash.ToLower()

Invoke-RestMethod -Uri "$BASE_URL/api/v1/hash/check/SYNTHETIC-ACCESS-001/$hash" `
  -Headers @{ Authorization = "Bearer $TOKEN" }
```

## 12. Doctor Validation Event

Login as a doctor first.

```bash
TOKEN=$(curl -s -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"dr.emily.chen@comfortage.health","password":"Doctor@Emily2024!"}' \
  | jq -r '.token')

curl -s -X POST "$BASE_URL/api/v1/hash/validate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"datasetId":"SYNTHETIC-ACCESS-001","hash":"0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"}' | jq .
```

## 13. Audit Summary

Login as an auditor or admin.

```bash
TOKEN=$(curl -s -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"claire.dubois@comfortage.health","password":"Audit@Claire2024!"}' \
  | jq -r '.token')

curl -s "$BASE_URL/api/v1/hash/audit/summary" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

## 14. Batch Upload From WSL Bash

Create `batch_upload.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
EMAIL="${EMAIL:-sara.johnson@comfortage.health}"
PASSWORD="${PASSWORD:-Nurse@Sara2024!}"

TOKEN=$(curl -s -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  | jq -r '.token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "Login failed"
  exit 1
fi

upload_csv() {
  local file="$1"
  local dataset_id="$2"
  local record_type="$3"
  local policy="$4"

  echo "Uploading $dataset_id from $file"

  curl -s -X POST "$BASE_URL/api/v1/hash/upload" \
    -H "Authorization: Bearer $TOKEN" \
    -F "file=@$file;type=text/csv" \
    -F "datasetId=$dataset_id" \
    -F "recordType=$record_type" \
    -F "columnPolicy=$policy" | jq .
}

COMMON_POLICY='{
  "participant_name":["doctor","admin"],
  "date_of_birth":["doctor","admin"],
  "diagnosis":["doctor","admin"],
  "medication":["doctor","pharmacist","admin"],
  "consent_notes":["consent_officer","admin"],
  "heart_rate":["*"],
  "blood_pressure":["*"],
  "steps":["*"]
}'

upload_csv "./data/synthetic_dataset.csv" "SYNTHETIC-ACCESS-001" "LAB_RESULT" "$COMMON_POLICY"
upload_csv "./data/mfu7_vital_signs.csv" "MFU-7-VITALS-001" "LAB_RESULT" "$COMMON_POLICY"
```

Run it:

```bash
chmod +x batch_upload.sh
./batch_upload.sh
```

## 15. Batch Upload From PowerShell

Create `batch_upload.ps1`:

```powershell
$BASE_URL = "http://localhost:3000"
$EMAIL = "sara.johnson@comfortage.health"
$PASSWORD = "Nurse@Sara2024!"

$login = Invoke-RestMethod -Uri "$BASE_URL/api/v1/auth/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body (@{ email = $EMAIL; password = $PASSWORD } | ConvertTo-Json)

$TOKEN = $login.token

$policy = @{
  participant_name = @("doctor", "admin")
  date_of_birth    = @("doctor", "admin")
  diagnosis        = @("doctor", "admin")
  medication       = @("doctor", "pharmacist", "admin")
  consent_notes    = @("consent_officer", "admin")
  heart_rate       = @("*")
  blood_pressure   = @("*")
  steps            = @("*")
} | ConvertTo-Json -Compress

function Upload-CsvDataset($File, $DatasetId, $RecordType) {
  Write-Host "Uploading $DatasetId from $File"
  curl.exe -s -X POST "$BASE_URL/api/v1/hash/upload" `
    -H "Authorization: Bearer $TOKEN" `
    -F "file=@$File;type=text/csv" `
    -F "datasetId=$DatasetId" `
    -F "recordType=$RecordType" `
    -F "columnPolicy=$policy"
}

Upload-CsvDataset "C:\path\to\synthetic_dataset.csv" "SYNTHETIC-ACCESS-001" "LAB_RESULT"
Upload-CsvDataset "C:\path\to\mfu7_vital_signs.csv" "MFU-7-VITALS-001" "LAB_RESULT"
```

Run it:

```powershell
powershell -ExecutionPolicy Bypass -File .\batch_upload.ps1
```

## 16. Recommended Workflow for Partner Data

1. Start with one small CSV.
2. Upload it with a simple `columnPolicy`.
3. Login as nurse, doctor, pharmacist, consent officer, auditor, and admin.
4. Call `/data` for the same dataset with each token.
5. Confirm each role sees only the intended columns.
6. Batch upload the remaining datasets.
7. Check history for a few datasets.
8. Run an integrity check against the local files.
9. Take screenshots from `/app` once data is visible in the GUI.

## 17. Future-Proofing for Agentic AI Access

If AI agents are later allowed to access COMFORTage data, use the same role-filtered `/data` endpoint rather than direct IPFS gateway access. Recommended future additions:

- Dedicated `agent` or `research_agent` roles.
- Read-only scoped API tokens.
- Dataset-level allowlists for agents.
- Column-level policy presets for AI workflows.
- Audit logging for every agent data retrieval.
- Rate limits and purpose-bound access labels.

This prevents agents from seeing columns or files outside their assigned role and keeps the access pattern auditable.
