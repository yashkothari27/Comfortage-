const express = require('express');
const { body, param, validationResult } = require('express-validator');
const norionService = require('../services/norionService');
const { ATTESTATION_TYPE } = norionService;
const logger = require('../logger');

const router = express.Router();

const VALID_TYPES = Object.keys(ATTESTATION_TYPE);

// POST /api/v1/norion/attest
// Anchor a KYC attestation: SHA-256 → IPFS → Reltime contract
router.post('/attest',
  body('attestationId').isString().notEmpty().trim(),
  body('attestationType').isIn(VALID_TYPES),
  body('payload').isObject(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { attestationId, attestationType, payload, extraMeta } = req.body;

    try {
      const result = await norionService.anchor({
        attestationId,
        attestationType: ATTESTATION_TYPE[attestationType],
        payload,
        extraMeta: extraMeta || {},
      });
      logger.info(`Norion attestation anchored: ${attestationId} tx=${result.txHash}`);
      res.json({ success: true, ...result });
    } catch (err) {
      logger.error('Norion anchor failed:', err.message);
      if (err.message?.includes('AlreadyExists')) {
        return res.status(409).json({ error: 'Attestation ID already exists on-chain', attestationId });
      }
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/v1/norion/attest/:attestationId
router.get('/attest/:attestationId',
  param('attestationId').isString().notEmpty().trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const data = await norionService.getAttestation(req.params.attestationId);
      const typeNames = Object.keys(ATTESTATION_TYPE);
      res.json({ ...data, attestationTypeName: typeNames[data.attestationType] || 'UNKNOWN' });
    } catch (err) {
      if (err.message?.includes('NotFound')) {
        return res.status(404).json({ error: 'Attestation not found on-chain' });
      }
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/v1/norion/audit/summary
router.get('/audit/summary', async (_req, res) => {
  try {
    res.json(await norionService.getAuditSummary());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/norion/health
router.get('/health', async (_req, res) => {
  try {
    res.json(await norionService.getHealth());
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

module.exports = router;
