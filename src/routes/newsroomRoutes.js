const express = require('express');
const { body, param, validationResult } = require('express-validator');
const newsroomService = require('../services/newsroomService');
const { EVIDENCE_TYPE, CLASS_LEVEL } = newsroomService;
const logger = require('../logger');

const router = express.Router();

const VALID_TYPES  = Object.keys(EVIDENCE_TYPE);
const VALID_CLASSES = Object.keys(CLASS_LEVEL);

// POST /api/v1/newsroom/evidence
// Anchor a defence compliance evidence record: SHA-256 → IPFS → Reltime contract
router.post('/evidence',
  body('recordId').isString().notEmpty().trim(),
  body('evidenceType').isIn(VALID_TYPES),
  body('classification').optional().isIn(VALID_CLASSES),
  body('referenceId').optional().isString().trim(),
  body('payload').isObject(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { recordId, evidenceType, classification = 'UNCLASSIFIED', referenceId = '', payload, extraMeta } = req.body;

    try {
      const result = await newsroomService.anchor({
        recordId,
        evidenceType:   EVIDENCE_TYPE[evidenceType],
        classification: CLASS_LEVEL[classification],
        referenceId,
        payload,
        extraMeta: extraMeta || {},
      });
      logger.info(`NEWSROOM evidence anchored: ${recordId} tx=${result.txHash}`);
      res.json({ success: true, ...result });
    } catch (err) {
      logger.error('NEWSROOM anchor failed:', err.message);
      if (err.message?.includes('AlreadyExists')) {
        return res.status(409).json({ error: 'Record ID already exists on-chain', recordId });
      }
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/v1/newsroom/evidence/:recordId
router.get('/evidence/:recordId',
  param('recordId').isString().notEmpty().trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const data = await newsroomService.getEvidence(req.params.recordId);
      const typeNames  = Object.keys(EVIDENCE_TYPE);
      const classNames = Object.keys(CLASS_LEVEL);
      res.json({
        ...data,
        evidenceTypeName:   typeNames[data.evidenceType]   || 'UNKNOWN',
        classificationName: classNames[data.classification] || 'UNKNOWN',
      });
    } catch (err) {
      if (err.message?.includes('NotFound')) {
        return res.status(404).json({ error: 'Record not found on-chain' });
      }
      res.status(500).json({ error: err.message });
    }
  }
);

// POST /api/v1/newsroom/escalate/:recordId  — ISSO: escalate incident to NCIRC
router.post('/escalate/:recordId',
  param('recordId').isString().notEmpty().trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const result = await newsroomService.escalateIncident(req.params.recordId);
      logger.info(`NEWSROOM incident escalated: ${req.params.recordId} tx=${result.txHash}`);
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/v1/newsroom/audit/summary
router.get('/audit/summary', async (_req, res) => {
  try {
    res.json(await newsroomService.getAuditSummary());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/newsroom/health
router.get('/health', async (_req, res) => {
  try {
    res.json(await newsroomService.getHealth());
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

module.exports = router;
