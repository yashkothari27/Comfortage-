const express = require("express");
const { body, param, validationResult } = require("express-validator");
const blockchainService = require("../services/blockchainService");
const logger = require("../logger");

const router = express.Router();

// ── Validation helpers ──
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

const hashRegex = /^(0x)?[a-fA-F0-9]{64}$/;

// ═══════════════════════════════════════════════════════════════════
// POST /api/v1/hash — Store a new dataset hash on-chain
// ═══════════════════════════════════════════════════════════════════
router.post(
  "/",
  [
    body("datasetId")
      .isString()
      .notEmpty()
      .withMessage("datasetId is required"),
    body("hash")
      .matches(hashRegex)
      .withMessage("hash must be a 64-char hex string (SHA-256)"),
    body("metadataCID")
      .optional()
      .isString(),
    validateRequest,
  ],
  async (req, res) => {
    try {
      const { datasetId, hash, metadataCID } = req.body;

      logger.info(`POST /hash — dataset: ${datasetId}, from: ${req.user?.serviceId}`);

      const result = await blockchainService.storeHash(
        datasetId,
        hash,
        metadataCID || ""
      );

      res.status(201).json({
        success: true,
        message: "Hash stored on Reltime blockchain",
        data: {
          datasetId,
          ...result,
        },
      });
    } catch (error) {
      logger.error(`POST /hash failed: ${error.message}`);

      if (error.message.includes("DatasetAlreadyExists")) {
        return res.status(409).json({
          success: false,
          error: "Dataset already exists. Use PUT to update.",
        });
      }

      res.status(500).json({
        success: false,
        error: "Failed to store hash on blockchain",
        detail: error.message,
      });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════
// GET /api/v1/hash/:datasetId — Retrieve the stored hash
// ═══════════════════════════════════════════════════════════════════
router.get(
  "/:datasetId",
  [
    param("datasetId").isString().notEmpty(),
    validateRequest,
  ],
  async (req, res) => {
    try {
      const { datasetId } = req.params;
      logger.info(`GET /hash/${datasetId}`);

      const exists = await blockchainService.datasetExists(datasetId);
      if (!exists) {
        return res.status(404).json({
          success: false,
          error: `Dataset '${datasetId}' not found on blockchain`,
        });
      }

      const record = await blockchainService.getHash(datasetId);

      res.json({
        success: true,
        data: record,
      });
    } catch (error) {
      logger.error(`GET /hash failed: ${error.message}`);
      res.status(500).json({
        success: false,
        error: "Failed to retrieve hash",
        detail: error.message,
      });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════
// PUT /api/v1/hash/:datasetId — Update the hash for a dataset
// ═══════════════════════════════════════════════════════════════════
router.put(
  "/:datasetId",
  [
    param("datasetId").isString().notEmpty(),
    body("hash")
      .matches(hashRegex)
      .withMessage("hash must be a 64-char hex string (SHA-256)"),
    body("metadataCID").optional().isString(),
    validateRequest,
  ],
  async (req, res) => {
    try {
      const { datasetId } = req.params;
      const { hash, metadataCID } = req.body;

      logger.info(`PUT /hash/${datasetId}`);

      const result = await blockchainService.updateHash(
        datasetId,
        hash,
        metadataCID || ""
      );

      res.json({
        success: true,
        message: "Hash updated on Reltime blockchain",
        data: { datasetId, ...result },
      });
    } catch (error) {
      logger.error(`PUT /hash failed: ${error.message}`);

      if (error.message.includes("DatasetNotFound")) {
        return res.status(404).json({
          success: false,
          error: "Dataset not found. Use POST to create.",
        });
      }

      res.status(500).json({
        success: false,
        error: "Failed to update hash",
        detail: error.message,
      });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════
// POST /api/v1/hash/validate — Validate integrity (with on-chain audit event)
// ═══════════════════════════════════════════════════════════════════
router.post(
  "/validate",
  [
    body("datasetId").isString().notEmpty(),
    body("hash").matches(hashRegex),
    validateRequest,
  ],
  async (req, res) => {
    try {
      const { datasetId, hash } = req.body;
      logger.info(`POST /hash/validate — dataset: ${datasetId}`);

      const result = await blockchainService.validateHash(datasetId, hash);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error(`POST /hash/validate failed: ${error.message}`);
      res.status(500).json({
        success: false,
        error: "Validation failed",
        detail: error.message,
      });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════
// GET /api/v1/hash/check/:datasetId/:hash — Quick read-only check (no tx)
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

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error(`GET /hash/check failed: ${error.message}`);
      res.status(500).json({
        success: false,
        error: "Integrity check failed",
        detail: error.message,
      });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════
// GET /api/v1/hash/history/:datasetId — Get all hash versions
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

module.exports = router;
