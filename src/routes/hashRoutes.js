const express = require("express");
const multer  = require("multer");
const { body, param, validationResult } = require("express-validator");
const blockchainService = require("../services/blockchainService");
const { authorizeRole, authorizeRecordType } = require("../middleware/auth");
const { decryptPrivateKey } = require("../services/walletService");
const { uploadToIPFS, uploadJSONToIPFS, computeSHA256 } = require("../services/ipfsService");
const db = require("../db/database");
const logger = require("../logger");

// 4 MB in-memory limit (Vercel serverless max payload is 4.5 MB)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });

/** Load the calling user's decrypted private key from DB. */
function getUserPrivateKey(userId) {
  const user = db.prepare("SELECT encrypted_private_key, wallet_iv, wallet_auth_tag FROM users WHERE id = ?").get(userId);
  if (!user || !user.encrypted_private_key) throw new Error("User wallet not found");
  return decryptPrivateKey(user.encrypted_private_key, user.wallet_iv, user.wallet_auth_tag);
}

const router = express.Router();

const VALID_RECORD_TYPES = ["LAB_RESULT", "DIAGNOSIS", "PRESCRIPTION", "CONSENT_FORM", "IMAGING"];

const RECORD_TYPE_INDEX = {
  LAB_RESULT:    0,
  DIAGNOSIS:     1,
  PRESCRIPTION:  2,
  CONSENT_FORM:  3,
  IMAGING:       4,
};

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

const hashRegex = /^(0x)?[a-fA-F0-9]{64}$/;

// ═══════════════════════════════════════════════════════════════════
// POST /api/v1/hash — Store a new medical record hash on-chain
// Roles: nurse (LAB_RESULT, DIAGNOSIS, IMAGING)
//        pharmacist (PRESCRIPTION)
//        consent_manager (CONSENT_FORM)
//        admin (any)
// ═══════════════════════════════════════════════════════════════════
router.post(
  "/",
  [
    body("datasetId").isString().notEmpty().withMessage("datasetId is required"),
    body("hash").matches(hashRegex).withMessage("hash must be a 64-char hex string (SHA-256)"),
    body("recordType")
      .isIn(VALID_RECORD_TYPES)
      .withMessage(`recordType must be one of: ${VALID_RECORD_TYPES.join(", ")}`),
    body("metadataCID").optional().isString(),
    validateRequest,
  ],
  authorizeRole("nurse", "pharmacist", "consent_officer", "consent_manager"),
  authorizeRecordType,
  async (req, res) => {
    try {
      const { datasetId, hash, metadataCID, recordType } = req.body;
      const recordTypeIndex = RECORD_TYPE_INDEX[recordType];

      logger.info(`POST /hash — dataset: ${datasetId}, type: ${recordType}, from: ${req.user?.email} (${req.user?.role})`);

      const privateKey = getUserPrivateKey(req.user.userId);
      const result = await blockchainService.storeHashAs(
        privateKey,
        datasetId,
        hash,
        metadataCID || "",
        recordTypeIndex
      );

      res.status(201).json({
        success: true,
        message: "Hash stored on Reltime blockchain",
        data: { datasetId, recordType, ...result },
      });
    } catch (error) {
      logger.error(`POST /hash failed: ${error.message}`);

      if (error.message.includes("DatasetAlreadyExists")) {
        return res.status(409).json({
          success: false,
          error: "Dataset already exists. Use PUT to update.",
        });
      }
      if (error.message.includes("UnauthorizedRecordType")) {
        return res.status(403).json({
          success: false,
          error: "Your on-chain role is not permitted to ingest this record type.",
        });
      }

      res.status(500).json({ success: false, error: "Failed to store hash on blockchain", detail: error.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════
// GET /api/v1/hash/:datasetId — Retrieve the stored hash
// Roles: all authenticated
// ═══════════════════════════════════════════════════════════════════
router.get(
  "/:datasetId",
  [param("datasetId").isString().notEmpty(), validateRequest],
  async (req, res) => {
    try {
      const { datasetId } = req.params;
      logger.info(`GET /hash/${datasetId} — from: ${req.user?.email}`);

      const exists = await blockchainService.datasetExists(datasetId);
      if (!exists) {
        return res.status(404).json({ success: false, error: `Dataset '${datasetId}' not found on blockchain` });
      }

      const record = await blockchainService.getHash(datasetId);
      res.json({ success: true, data: record });
    } catch (error) {
      logger.error(`GET /hash failed: ${error.message}`);
      res.status(500).json({ success: false, error: "Failed to retrieve hash", detail: error.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════
// PUT /api/v1/hash/:datasetId — Update an existing record hash
// Roles: same as POST (role restriction enforced on-chain by record type)
// ═══════════════════════════════════════════════════════════════════
router.put(
  "/:datasetId",
  [
    param("datasetId").isString().notEmpty(),
    body("hash").matches(hashRegex).withMessage("hash must be a 64-char hex string (SHA-256)"),
    body("metadataCID").optional().isString(),
    validateRequest,
  ],
  authorizeRole("nurse", "pharmacist", "consent_officer", "consent_manager"),
  async (req, res) => {
    try {
      const { datasetId } = req.params;
      const { hash, metadataCID } = req.body;

      logger.info(`PUT /hash/${datasetId} — from: ${req.user?.email} (${req.user?.role})`);

      const privateKey = getUserPrivateKey(req.user.userId);
      const result = await blockchainService.updateHashAs(privateKey, datasetId, hash, metadataCID || "");

      res.json({ success: true, message: "Hash updated on Reltime blockchain", data: { datasetId, ...result } });
    } catch (error) {
      logger.error(`PUT /hash failed: ${error.message}`);

      if (error.message.includes("DatasetNotFound")) {
        return res.status(404).json({ success: false, error: "Dataset not found. Use POST to create." });
      }
      if (error.message.includes("UnauthorizedRecordType")) {
        return res.status(403).json({ success: false, error: "Your role is not permitted to update this record type." });
      }

      res.status(500).json({ success: false, error: "Failed to update hash", detail: error.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════
// POST /api/v1/hash/validate — Validate integrity (on-chain audit event)
// Roles: doctor, admin
// ═══════════════════════════════════════════════════════════════════
router.post(
  "/validate",
  [
    body("datasetId").isString().notEmpty(),
    body("hash").matches(hashRegex),
    validateRequest,
  ],
  authorizeRole("doctor"),
  async (req, res) => {
    try {
      const { datasetId, hash } = req.body;
      logger.info(`POST /hash/validate — dataset: ${datasetId}, validator: ${req.user?.email}`);

      const privateKey = getUserPrivateKey(req.user.userId);
      const result = await blockchainService.validateHashAs(privateKey, datasetId, hash);
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error(`POST /hash/validate failed: ${error.message}`);
      res.status(500).json({ success: false, error: "Validation failed", detail: error.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════
// GET /api/v1/hash/check/:datasetId/:hash — Quick read-only check (no tx)
// Roles: all authenticated
// ═══════════════════════════════════════════════════════════════════
router.get(
  "/check/:datasetId/:hash",
  [
    param("datasetId").isString().notEmpty(),
    param("hash").matches(hashRegex),
    validateRequest,
  ],
  async (req, res) => {
    try {
      const { datasetId, hash } = req.params;
      logger.info(`GET /hash/check/${datasetId}`);

      const result = await blockchainService.checkIntegrity(datasetId, hash);
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error(`GET /hash/check failed: ${error.message}`);
      res.status(500).json({ success: false, error: "Integrity check failed", detail: error.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════
// GET /api/v1/hash/history/:datasetId — Get all hash versions
// Roles: all authenticated
// ═══════════════════════════════════════════════════════════════════
router.get(
  "/history/:datasetId",
  [param("datasetId").isString().notEmpty(), validateRequest],
  async (req, res) => {
    try {
      const { datasetId } = req.params;
      const result = await blockchainService.getHashHistory(datasetId);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════
// GET /api/v1/hash/audit/summary — Compliance dashboard counts per type
// Roles: auditor, admin
// ═══════════════════════════════════════════════════════════════════
router.get(
  "/audit/summary",
  authorizeRole("auditor", "admin"),
  async (req, res) => {
    try {
      logger.info(`GET /hash/audit/summary — from: ${req.user?.email}`);
      const privateKey = getUserPrivateKey(req.user.userId);
      const summary = await blockchainService.getAuditSummaryAs(privateKey);
      res.json({ success: true, data: summary });
    } catch (error) {
      logger.error(`GET /hash/audit/summary failed: ${error.message}`);
      res.status(500).json({ success: false, error: "Audit summary failed", detail: error.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════
// POST /api/v1/hash/upload — Upload file → IPFS → hash stored on-chain
// Roles: nurse (LAB_RESULT, DIAGNOSIS, IMAGING)
//        pharmacist (PRESCRIPTION)
//        consent_officer (CONSENT_FORM)
// ═══════════════════════════════════════════════════════════════════
router.post(
  "/upload",
  authorizeRole("nurse", "pharmacist", "consent_officer"),
  upload.single("file"),
  authorizeRecordType,
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: "No file uploaded. Send a multipart/form-data request with a 'file' field." });
      }

      const { datasetId, recordType, columnPolicy: columnPolicyRaw } = req.body;
      if (!datasetId) return res.status(400).json({ success: false, error: "datasetId is required" });
      if (!VALID_RECORD_TYPES.includes(recordType)) {
        return res.status(400).json({ success: false, error: `recordType must be one of: ${VALID_RECORD_TYPES.join(", ")}` });
      }

      // Parse columnPolicy if provided — must be a valid JSON object
      let columnPolicy = null;
      if (columnPolicyRaw) {
        try {
          columnPolicy = typeof columnPolicyRaw === "string" ? JSON.parse(columnPolicyRaw) : columnPolicyRaw;
          if (typeof columnPolicy !== "object" || Array.isArray(columnPolicy)) throw new Error();
        } catch {
          return res.status(400).json({ success: false, error: "columnPolicy must be a valid JSON object mapping column names to role arrays" });
        }
      }

      logger.info(`POST /hash/upload — dataset: ${datasetId}, type: ${recordType}, file: ${req.file.originalname} (${req.file.size}B), policy: ${columnPolicy ? "yes" : "none"}, from: ${req.user?.email}`);

      // 1. Compute SHA-256 of the raw file bytes
      const hash = computeSHA256(req.file.buffer);

      // 2. Upload raw file to Pinata IPFS
      const { cid: fileCid, ipfsUrl, pinataUrl } = await uploadToIPFS(req.file.buffer, req.file.originalname, req.file.mimetype);
      logger.info(`IPFS file upload complete: ${fileCid}`);

      // 3. If columnPolicy provided, upload a policy wrapper JSON and use its CID as metadataCID
      let metadataCID = fileCid;
      let policyCid = null;
      if (columnPolicy) {
        const wrapper = {
          fileCid,
          filename: req.file.originalname,
          mimeType: req.file.mimetype || "application/octet-stream",
          columnPolicy,
        };
        policyCid = await uploadJSONToIPFS(wrapper, `policy-${datasetId}.json`);
        metadataCID = policyCid;
        logger.info(`IPFS policy JSON upload complete: ${policyCid}`);
      }

      // 4. Store hash + metadataCID on-chain
      const recordTypeIndex = RECORD_TYPE_INDEX[recordType];
      const privateKey = getUserPrivateKey(req.user.userId);
      const result = await blockchainService.storeHashAs(privateKey, datasetId, hash, metadataCID, recordTypeIndex);

      res.status(201).json({
        success: true,
        message: "File uploaded to IPFS and hash anchored on Reltime blockchain",
        data: {
          datasetId,
          recordType,
          filename: req.file.originalname,
          sizeBytes: req.file.size,
          hash,
          fileCid,
          ipfsUrl,
          pinataUrl,
          ...(columnPolicy && { policyCid, columnPolicy }),
          transactionHash: result.transactionHash,
          blockNumber:     result.blockNumber,
          status:          result.status,
        },
      });
    } catch (error) {
      logger.error(`POST /hash/upload failed: ${error.message}`);

      if (error.message.includes("DatasetAlreadyExists")) {
        return res.status(409).json({ success: false, error: "Dataset already exists. Use PUT /hash/:datasetId to update." });
      }
      if (error.message.includes("PINATA_JWT")) {
        return res.status(503).json({ success: false, error: "IPFS service not configured. Add PINATA_JWT to environment variables." });
      }

      res.status(500).json({ success: false, error: "Upload failed", detail: error.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════
// GET /api/v1/hash/:datasetId/data — Fetch file from IPFS with
//   role-based column filtering (CSV only).
//   If the dataset has a columnPolicy, only columns the caller's role
//   is permitted to see are returned. Non-CSV files are returned as-is.
// Roles: all authenticated
// ═══════════════════════════════════════════════════════════════════
router.get(
  "/:datasetId/data",
  [param("datasetId").isString().notEmpty(), validateRequest],
  async (req, res) => {
    try {
      const { datasetId } = req.params;
      const callerRole = req.user?.role || "";

      logger.info(`GET /hash/${datasetId}/data — from: ${req.user?.email} (${callerRole})`);

      // 1. Get on-chain record
      const exists = await blockchainService.datasetExists(datasetId);
      if (!exists) {
        return res.status(404).json({ success: false, error: `Dataset '${datasetId}' not found on blockchain` });
      }
      const record = await blockchainService.getHash(datasetId);
      const metadataCID = record.metadataCID;
      if (!metadataCID) {
        return res.status(404).json({ success: false, error: "No IPFS CID recorded for this dataset" });
      }

      // 2. Fetch from IPFS gateway — try to detect if it's a policy wrapper
      const gatewayUrl = `https://gateway.pinata.cloud/ipfs/${metadataCID}`;
      const ipfsRes = await fetch(gatewayUrl);
      if (!ipfsRes.ok) {
        return res.status(502).json({ success: false, error: `Failed to fetch from IPFS (${ipfsRes.status})` });
      }

      const contentType = ipfsRes.headers.get("content-type") || "";
      const rawText = await ipfsRes.text();

      // 3. Check if this is a policy wrapper JSON
      let policy = null;
      let fileCid = metadataCID;
      let filename = datasetId;
      let mimeType = contentType;

      if (contentType.includes("application/json") || contentType.includes("text/plain")) {
        try {
          const parsed = JSON.parse(rawText);
          if (parsed.fileCid && parsed.columnPolicy) {
            policy = parsed.columnPolicy;
            fileCid = parsed.fileCid;
            filename = parsed.filename || datasetId;
            mimeType = parsed.mimeType || "application/octet-stream";
          }
        } catch { /* not JSON — treat as raw file */ }
      }

      // 4. If policy wrapper, fetch the actual file
      let fileText = rawText;
      if (policy) {
        const fileRes = await fetch(`https://gateway.pinata.cloud/ipfs/${fileCid}`);
        if (!fileRes.ok) {
          return res.status(502).json({ success: false, error: `Failed to fetch file from IPFS (${fileRes.status})` });
        }
        fileText = await fileRes.text();
      }

      // 5. Apply column filtering for CSV files
      const isCSV = mimeType.includes("csv") || filename.endsWith(".csv");
      if (policy && isCSV) {
        const lines = fileText.split(/\r?\n/).filter(Boolean);
        if (lines.length === 0) {
          return res.json({ success: true, data: { datasetId, rows: [], filteredColumns: [], deniedColumns: [] } });
        }

        const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));

        // Determine which columns this role can see
        // Policy: { "colName": ["role1","role2"] } — "*" means all roles
        // Columns not in policy are accessible to everyone
        const allowed = headers.filter(col => {
          const roles = policy[col];
          if (!roles) return true; // not restricted
          if (roles.includes("*")) return true;
          return roles.includes(callerRole) || callerRole === "admin";
        });
        const denied = headers.filter(col => !allowed.includes(col));

        const allowedIdx = allowed.map(col => headers.indexOf(col));

        const rows = lines.slice(1).map(line => {
          const cells = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
          const row = {};
          allowedIdx.forEach(i => { row[headers[i]] = cells[i] ?? ""; });
          return row;
        });

        logger.info(`GET /hash/${datasetId}/data — served ${rows.length} rows, ${allowed.length}/${headers.length} columns visible to '${callerRole}'`);

        return res.json({
          success: true,
          data: {
            datasetId,
            filename,
            fileCid,
            callerRole,
            visibleColumns: allowed,
            restrictedColumns: denied,
            totalColumns: headers.length,
            rows,
          },
        });
      }

      // 6. Non-CSV or no policy — return raw file
      res.setHeader("Content-Type", mimeType || "application/octet-stream");
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      res.send(fileText);

    } catch (error) {
      logger.error(`GET /hash/:datasetId/data failed: ${error.message}`);
      res.status(500).json({ success: false, error: "Failed to retrieve dataset", detail: error.message });
    }
  }
);

module.exports = router;
