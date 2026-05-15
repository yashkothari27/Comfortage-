const express = require("express");
const { body, param, validationResult } = require("express-validator");
const blockchainService = require("../services/blockchainService");
const { authorizeRole, authorizeRecordType } = require("../middleware/auth");
const { decryptPrivateKey } = require("../services/walletService");
const db = require("../db/database");
const logger = require("../logger");

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

module.exports = router;
