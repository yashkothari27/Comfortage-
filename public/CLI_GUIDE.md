# COMFORTage T3.3 — Command-Line Upload Guide
### For PowerShell / Bash (WSL / Linux / macOS)

**Base URL:** `https://comfortage.vercel.app`

---

## 1. Prerequisites

| Tool | Install |
|------|---------|
| `curl` | Pre-installed on WSL/Linux/macOS. Windows: install via `winget install curl.curl` |
| `jq` | `sudo apt install jq` (WSL/Linux) · `brew install jq` (macOS) |

---

## 2. Login and Get Your Token

Every request requires a Bearer token. Log in once per session and save the token.

**Bash / WSL:**
```bash
TOKEN=$(curl -s -X POST https://comfortage.vercel.app/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"sara.johnson@comfortage.health","password":"Nurse@Sara2024!"}' \
  | jq -r '.token')

echo "Logged in. Token saved."
```

**PowerShell:**
```powershell
$response = Invoke-RestMethod -Uri "https://comfortage.vercel.app/api/v1/auth/login" `
  -Method POST -ContentType "application/json" `
  -Body '{"email":"sara.johnson@comfortage.health","password":"Nurse@Sara2024!"}'
$TOKEN = $response.token
Write-Host "Logged in. Token saved."
```

### Test Accounts

| Role | Email | Password |
|------|-------|----------|
| nurse | sara.johnson@comfortage.health | Nurse@Sara2024! |
| nurse | miguel.torres@comfortage.health | Nurse@Miguel2024! |
| doctor | dr.emily.chen@comfortage.health | Doctor@Emily2024! |
| doctor | dr.james.patel@comfortage.health | Doctor@James2024! |
| pharmacist | anna.schmidt@comfortage.health | Pharma@Anna2024! |
| consent_officer | sofia.russo@comfortage.health | Consent@Sofia2024! |
| auditor | claire.dubois@comfortage.health | Audit@Claire2024! |
| admin | admin@comfortage.health | Admin@Comfortage2024! |

---

## 3. Upload a File (No Column Policy)

Uploads the file to IPFS and anchors its SHA-256 hash on the Reltime blockchain.

**Record type options:** `LAB_RESULT` · `DIAGNOSIS` · `IMAGING` · `PRESCRIPTION` · `CONSENT_FORM`

```bash
curl -X POST https://comfortage.vercel.app/api/v1/hash/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/your/file.csv;type=text/csv" \
  -F "datasetId=MFU-7-VITAL-SIGNS-001" \
  -F "recordType=LAB_RESULT"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "datasetId": "MFU-7-VITAL-SIGNS-001",
    "fileCid": "QmXxx...",
    "ipfsUrl": "https://ipfs.io/ipfs/QmXxx...",
    "transactionHash": "0xabc...",
    "blockNumber": 38743051,
    "status": "confirmed"
  }
}
```

---

## 4. Upload a File WITH Column-Level Access Policy

Use `columnPolicy` to restrict which roles can see specific columns.

**Policy format:** JSON object mapping column name → array of allowed roles.  
Use `"*"` to allow all roles. Unlisted columns are visible to everyone.

**Roles:** `nurse` · `doctor` · `pharmacist` · `consent_officer` · `auditor` · `admin`

### Example: MFU #7 dataset — restrict sensitive columns to doctors only

```bash
POLICY='{
  "name":        ["doctor","admin"],
  "date_of_birth": ["doctor","admin"],
  "diagnosis":   ["doctor","admin"],
  "stage_progression": ["doctor","admin"],
  "blood_pressure": ["*"],
  "heart_rate":  ["*"],
  "weight":      ["*"]
}'

curl -X POST https://comfortage.vercel.app/api/v1/hash/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@mfu7_vital_signs.csv;type=text/csv" \
  -F "datasetId=MFU-7-VITALS-001" \
  -F "recordType=LAB_RESULT" \
  -F "columnPolicy=$POLICY"
```

**PowerShell:**
```powershell
$policy = '{"name":["doctor","admin"],"date_of_birth":["doctor","admin"],"diagnosis":["doctor","admin"],"blood_pressure":["*"],"heart_rate":["*"]}'

$form = @{
  datasetId    = "MFU-7-VITALS-001"
  recordType   = "LAB_RESULT"
  columnPolicy = $policy
}
# Use curl.exe for multipart with file in PowerShell
curl.exe -X POST https://comfortage.vercel.app/api/v1/hash/upload `
  -H "Authorization: Bearer $TOKEN" `
  -F "file=@mfu7_vital_signs.csv;type=text/csv" `
  -F "datasetId=MFU-7-VITALS-001" `
  -F "recordType=LAB_RESULT" `
  -F "columnPolicy=$policy"
```

---

## 5. Retrieve a File (with Column Filtering Applied)

```bash
curl -s https://comfortage.vercel.app/api/v1/hash/DATASET-ID/data \
  -H "Authorization: Bearer $TOKEN" | jq .
```

The API automatically filters columns based on the caller's role. A nurse calling this endpoint will not see columns restricted to doctors.

**Example response (nurse view):**
```json
{
  "success": true,
  "data": {
    "datasetId": "MFU-7-VITALS-001",
    "callerRole": "nurse",
    "visibleColumns": ["blood_pressure","heart_rate","weight"],
    "restrictedColumns": ["name","date_of_birth","diagnosis"],
    "rows": [
      { "blood_pressure": "120/80", "heart_rate": "72", "weight": "68" }
    ]
  }
}
```

---

## 6. Check a Dataset Exists / Get Hash Record

```bash
curl -s https://comfortage.vercel.app/api/v1/hash/MFU-7-VITALS-001 \
  -H "Authorization: Bearer $TOKEN" | jq .
```

---

## 7. Batch Upload Script — MFU / AMI / INTRAS Datasets

Save this as `batch_upload.sh`, edit the file paths and dataset IDs, then run with `bash batch_upload.sh`.

```bash
#!/usr/bin/env bash
# COMFORTage T3.3 — Batch Upload Script
# Edit BASE_URL, credentials, file paths, and dataset IDs before running.

BASE_URL="https://comfortage.vercel.app"
EMAIL="sara.johnson@comfortage.health"
PASSWORD="Nurse@Sara2024!"

# ── Login ──────────────────────────────────────────────────────────
echo "Logging in..."
TOKEN=$(curl -s -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  | jq -r '.token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "ERROR: Login failed. Check credentials."
  exit 1
fi
echo "Login OK."

# ── Helper function ─────────────────────────────────────────────────
upload() {
  local FILE="$1"
  local DATASET_ID="$2"
  local RECORD_TYPE="$3"
  local POLICY="$4"   # optional JSON string

  echo ""
  echo "Uploading: $FILE → $DATASET_ID ($RECORD_TYPE)"

  if [ -n "$POLICY" ]; then
    RESULT=$(curl -s -X POST "$BASE_URL/api/v1/hash/upload" \
      -H "Authorization: Bearer $TOKEN" \
      -F "file=@$FILE" \
      -F "datasetId=$DATASET_ID" \
      -F "recordType=$RECORD_TYPE" \
      -F "columnPolicy=$POLICY")
  else
    RESULT=$(curl -s -X POST "$BASE_URL/api/v1/hash/upload" \
      -H "Authorization: Bearer $TOKEN" \
      -F "file=@$FILE" \
      -F "datasetId=$DATASET_ID" \
      -F "recordType=$RECORD_TYPE")
  fi

  STATUS=$(echo "$RESULT" | jq -r '.data.status // .error')
  TX=$(echo "$RESULT" | jq -r '.data.transactionHash // "n/a"')
  CID=$(echo "$RESULT" | jq -r '.data.fileCid // "n/a"')
  echo "  Status: $STATUS"
  echo "  TX:     $TX"
  echo "  CID:    $CID"
}

# ── MFU #7 — Vital Signs, Lab Results, Care Plans ──────────────────
MFU_POLICY='{
  "name":              ["doctor","admin"],
  "date_of_birth":     ["doctor","admin"],
  "past_conditions":   ["doctor","admin"],
  "chronic_diseases":  ["doctor","admin"],
  "diagnosis":         ["doctor","admin"],
  "stage_progression": ["doctor","admin"],
  "blood_pressure":    ["*"],
  "heart_rate":        ["*"],
  "temperature":       ["*"],
  "weight":            ["*"],
  "medications":       ["doctor","pharmacist","admin"],
  "care_plan":         ["doctor","nurse","admin"]
}'

upload "data/mfu7_vital_signs.csv"   "MFU-7-VITALS-001"   "LAB_RESULT"  "$MFU_POLICY"
upload "data/mfu7_lab_results.csv"   "MFU-7-LAB-001"      "LAB_RESULT"  "$MFU_POLICY"
upload "data/mfu7_care_plans.csv"    "MFU-7-CARE-001"     "DIAGNOSIS"   "$MFU_POLICY"
upload "data/mfu7_therapies.csv"     "MFU-7-THERAPY-001"  "DIAGNOSIS"   ""

# ── AMI #10 — Medications, Vital Signs, Exercise ───────────────────
AMI_POLICY='{
  "name":              ["doctor","admin"],
  "date_of_birth":     ["doctor","admin"],
  "current_medications": ["doctor","pharmacist","admin"],
  "past_medications":  ["doctor","pharmacist","admin"],
  "dosages":           ["doctor","pharmacist","admin"],
  "blood_pressure":    ["*"],
  "heart_rate":        ["*"],
  "weight":            ["*"],
  "exercise":          ["*"]
}'

upload "data/ami10_medications.csv"  "AMI-10-MEDS-001"    "PRESCRIPTION" "$AMI_POLICY"
upload "data/ami10_vital_signs.csv"  "AMI-10-VITALS-001"  "LAB_RESULT"   "$AMI_POLICY"

# ── INTRAS #11 — Full Dementia Dataset ─────────────────────────────
INTRAS_POLICY='{
  "name":              ["doctor","admin"],
  "date_of_birth":     ["doctor","admin"],
  "diagnosis":         ["doctor","admin"],
  "stage_progression": ["doctor","admin"],
  "past_conditions":   ["doctor","admin"],
  "chronic_diseases":  ["doctor","admin"],
  "current_medications": ["doctor","pharmacist","admin"],
  "dosages":           ["doctor","pharmacist","admin"],
  "family_history":    ["doctor","admin"],
  "living_conditions": ["doctor","nurse","admin"],
  "social_history":    ["doctor","nurse","admin"],
  "blood_pressure":    ["*"],
  "heart_rate":        ["*"],
  "weight":            ["*"],
  "consent_data_sharing": ["consent_officer","admin"],
  "research_participation": ["consent_officer","admin"]
}'

upload "data/intras11_full_dataset.csv" "INTRAS-11-FULL-001" "DIAGNOSIS" "$INTRAS_POLICY"

echo ""
echo "Batch upload complete."
```

---

## 8. View Upload History for a Dataset

```bash
curl -s https://comfortage.vercel.app/api/v1/hash/history/MFU-7-VITALS-001 \
  -H "Authorization: Bearer $TOKEN" | jq .
```

---

## 9. Verify File Integrity (read-only, no transaction)

```bash
# Provide the datasetId and the SHA-256 hash of your local file
HASH=$(sha256sum my_file.csv | awk '{print "0x"$1}')

curl -s "https://comfortage.vercel.app/api/v1/hash/check/MFU-7-VITALS-001/$HASH" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

---

## 10. Audit Summary (auditor / admin only)

```bash
# Login as auditor first
TOKEN=$(curl -s -X POST https://comfortage.vercel.app/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"claire.dubois@comfortage.health","password":"Audit@Claire2024!"}' \
  | jq -r '.token')

curl -s https://comfortage.vercel.app/api/v1/hash/audit/summary \
  -H "Authorization: Bearer $TOKEN" | jq .
```

---

## Column Policy Quick Reference

```
"*"                     → all roles can see this column
["doctor","admin"]      → only doctors and admins
["doctor","pharmacist"] → doctors and pharmacists only
["*"]                   → same as no restriction
```

Columns **not listed** in the policy are visible to **everyone**.  
The `admin` role always sees all columns regardless of policy.
