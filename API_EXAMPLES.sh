#!/bin/bash
# DataIntegrity API - cURL Examples
# Copy and run these commands to test the API

set -e

# ═══════════════════════════════════════════════════════════════════════════
# SETUP - Get your JWT token
# ═══════════════════════════════════════════════════════════════════════════

echo "📋 SETUP: Generate JWT Token"
echo "Run this command to generate your token:"
echo ""
echo "  node -e \"require('./src/middleware/auth').generateToken('my-service')\""
echo ""
echo "Copy the token output and use it below as \$TOKEN"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# Edit these variables
# ═══════════════════════════════════════════════════════════════════════════

BASE_URL="http://localhost:3000"
TOKEN="YOUR_JWT_TOKEN_HERE"  # Replace with your token
DATASET_ID="DS-PILOT-$(date +%s)"
HASH1="0x3c59dc048e8850243be8079a5c74d079934b91d7321b8e09f8ce1fde91baa2ae"
HASH2="0x5e9dc048e8850243be8079a5c74d079934b91d7321b8e09f8ce1fde91baa999"
METADATA_CID="QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Variables set:"
echo "  BASE_URL: $BASE_URL"
echo "  TOKEN: ${TOKEN:0:20}..."
echo "  DATASET_ID: $DATASET_ID"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# 1. HEALTH CHECK (No Auth Required)
# ═══════════════════════════════════════════════════════════════════════════

echo "✅ TEST 1: Health Check (No Auth)"
echo ""
echo "Command:"
echo "curl $BASE_URL/health"
echo ""
echo "Response:"
curl -s "$BASE_URL/health" | python3 -m json.tool
echo ""
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# 2. STORE NEW HASH
# ═══════════════════════════════════════════════════════════════════════════

echo "✅ TEST 2: Store New Dataset Hash"
echo ""
echo "Command:"
echo "curl -X POST $BASE_URL/api/v1/hash \\"
echo "  -H 'Authorization: Bearer \$TOKEN' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"datasetId\": \"$DATASET_ID\", \"hash\": \"$HASH1\", \"metadataCID\": \"$METADATA_CID\"}'"
echo ""
echo "Response:"
STORE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/hash" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"datasetId\": \"$DATASET_ID\",
    \"hash\": \"$HASH1\",
    \"metadataCID\": \"$METADATA_CID\"
  }")
echo "$STORE_RESPONSE" | python3 -m json.tool
echo ""
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# 3. GET HASH
# ═══════════════════════════════════════════════════════════════════════════

echo "✅ TEST 3: Retrieve Stored Hash"
echo ""
echo "Command:"
echo "curl -X GET $BASE_URL/api/v1/hash/$DATASET_ID \\"
echo "  -H 'Authorization: Bearer \$TOKEN'"
echo ""
echo "Response:"
curl -s -X GET "$BASE_URL/api/v1/hash/$DATASET_ID" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
echo ""
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# 4. UPDATE HASH
# ═══════════════════════════════════════════════════════════════════════════

echo "✅ TEST 4: Update Hash (New Version)"
echo ""
echo "Command:"
echo "curl -X PUT $BASE_URL/api/v1/hash/$DATASET_ID \\"
echo "  -H 'Authorization: Bearer \$TOKEN' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"hash\": \"$HASH2\"}'"
echo ""
echo "Response:"
curl -s -X PUT "$BASE_URL/api/v1/hash/$DATASET_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"hash\": \"$HASH2\"}" | python3 -m json.tool
echo ""
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# 5. QUICK INTEGRITY CHECK (Read-Only)
# ═══════════════════════════════════════════════════════════════════════════

echo "✅ TEST 5: Quick Integrity Check (Read-Only, No Audit)"
echo ""
echo "Command:"
echo "curl -X GET \"$BASE_URL/api/v1/hash/check/$DATASET_ID/$HASH2\" \\"
echo "  -H 'Authorization: Bearer \$TOKEN'"
echo ""
echo "Response:"
curl -s -X GET "$BASE_URL/api/v1/hash/check/$DATASET_ID/$HASH2" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
echo ""
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# 6. VALIDATE INTEGRITY (With Audit Event)
# ═══════════════════════════════════════════════════════════════════════════

echo "✅ TEST 6: Validate Integrity (Records On-Chain Audit)"
echo ""
echo "Command:"
echo "curl -X POST $BASE_URL/api/v1/hash/validate \\"
echo "  -H 'Authorization: Bearer \$TOKEN' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"datasetId\": \"$DATASET_ID\", \"hash\": \"$HASH2\"}'"
echo ""
echo "Response:"
curl -s -X POST "$BASE_URL/api/v1/hash/validate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"datasetId\": \"$DATASET_ID\",
    \"hash\": \"$HASH2\"
  }" | python3 -m json.tool
echo ""
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# 7. GET HASH HISTORY
# ═══════════════════════════════════════════════════════════════════════════

echo "✅ TEST 7: Get Hash Version History"
echo ""
echo "Command:"
echo "curl -X GET $BASE_URL/api/v1/hash/history/$DATASET_ID \\"
echo "  -H 'Authorization: Bearer \$TOKEN'"
echo ""
echo "Response:"
curl -s -X GET "$BASE_URL/api/v1/hash/history/$DATASET_ID" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
echo ""
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# ERROR TESTS
# ═══════════════════════════════════════════════════════════════════════════

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "ERROR HANDLING TESTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "❌ TEST 8: Duplicate Dataset (409 Conflict)"
echo ""
echo "Command:"
echo "curl -X POST $BASE_URL/api/v1/hash \\"
echo "  -H 'Authorization: Bearer \$TOKEN' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"datasetId\": \"$DATASET_ID\", \"hash\": \"$HASH1\"}'"
echo ""
echo "Response (should be 409):"
curl -s -X POST "$BASE_URL/api/v1/hash" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"datasetId\": \"$DATASET_ID\", \"hash\": \"$HASH1\"}" | python3 -m json.tool
echo ""
echo ""

echo "❌ TEST 9: Invalid Hash Format (400 Bad Request)"
echo ""
echo "Command:"
echo "curl -X POST $BASE_URL/api/v1/hash \\"
echo "  -H 'Authorization: Bearer \$TOKEN' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"datasetId\": \"DS-INVALID\", \"hash\": \"not-a-hash\"}'"
echo ""
echo "Response (should be 400):"
curl -s -X POST "$BASE_URL/api/v1/hash" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"datasetId\": \"DS-INVALID\", \"hash\": \"not-a-hash\"}" | python3 -m json.tool
echo ""
echo ""

echo "❌ TEST 10: Dataset Not Found (404)"
echo ""
echo "Command:"
echo "curl -X GET $BASE_URL/api/v1/hash/DS-NONEXISTENT \\"
echo "  -H 'Authorization: Bearer \$TOKEN'"
echo ""
echo "Response (should be 404):"
curl -s -X GET "$BASE_URL/api/v1/hash/DS-NONEXISTENT" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
echo ""
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════════════

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ API TESTS COMPLETE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Summary:"
echo "  ✓ Health check (no auth)"
echo "  ✓ Store new hash"
echo "  ✓ Retrieve hash"
echo "  ✓ Update hash"
echo "  ✓ Integrity check (read-only)"
echo "  ✓ Hash validation (with audit)"
echo "  ✓ Hash history"
echo "  ✓ Error handling (duplicate, invalid, not found)"
echo ""
echo "Next steps:"
echo "  • View Swagger UI: $BASE_URL/docs"
echo "  • Check logs: tail -f logs/combined.log"
echo "  • View OpenAPI spec: $BASE_URL/openapi.json"
echo ""
