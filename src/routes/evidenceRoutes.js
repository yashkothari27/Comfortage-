const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const blockchainService = require("../services/blockchainService");
const { authorizeRole } = require("../middleware/auth");
const logger = require("../logger");

const router = express.Router();
const POLICY_DIR = path.join(__dirname, "../policies");

// Ed25519 key: EVIDENCE_SIGNING_KEY (PKCS8 PEM) if set, else derived from JWT_SECRET so it survives serverless cold starts.
// ponytail: derived key is fine for the pilot; set a dedicated EVIDENCE_SIGNING_KEY (or HSM/KMS) for production.
function loadKey() {
  if (process.env.EVIDENCE_SIGNING_KEY) return crypto.createPrivateKey(process.env.EVIDENCE_SIGNING_KEY.replace(/\\n/g, "\n"));
  const seed = crypto.createHash("sha256").update("comfortage-evidence:" + (process.env.JWT_SECRET || "")).digest();
  const der = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]);
  return crypto.createPrivateKey({ key: der, format: "der", type: "pkcs8" });
}
const privateKey = loadKey();
const publicKey = crypto.createPublicKey(privateKey);
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });

const digestOf = (pack) => crypto.createHash("sha256").update(JSON.stringify(pack)).digest("hex");

// GET /api/v1/evidence/policies/:id — latest (or ?version=) versioned policy rules
router.get("/policies/:id", (req, res) => {
  const id = req.params.id.replace(/[^a-z0-9-]/gi, "");
  const files = fs.readdirSync(POLICY_DIR).filter(f => f.startsWith(id + ".v") && f.endsWith(".json")).sort();
  const pick = req.query.version ? files.find(f => JSON.parse(fs.readFileSync(path.join(POLICY_DIR, f))).version === req.query.version) : files.at(-1);
  if (!pick) return res.status(404).json({ success: false, error: "Policy not found" });
  res.json({ success: true, data: JSON.parse(fs.readFileSync(path.join(POLICY_DIR, pick))) });
});

// GET /api/v1/evidence/public-key — for external auditors to verify signatures offline
router.get("/public-key", (_req, res) => res.json({ success: true, data: { alg: "Ed25519", publicKeyPem } }));

// POST /api/v1/evidence/pack — sign pack + anchor its digest on-chain
router.post("/pack", authorizeRole("auditor", "admin"), async (req, res) => {
  const pack = req.body?.pack;
  if (!pack || typeof pack !== "object") return res.status(400).json({ success: false, error: "pack object required" });
  const sha256 = digestOf(pack);
  const signature = crypto.sign(null, Buffer.from(sha256, "hex"), privateKey).toString("base64");
  const anchorId = `EVIDENCE-${Date.now()}-${sha256.slice(0, 8)}`;
  let anchor;
  try {
    anchor = { datasetId: anchorId, ...(await blockchainService.storeHash(anchorId, sha256, "", 0)) };
  } catch (e) {
    logger.error(`Evidence anchor failed: ${e.message}`);
    anchor = { datasetId: anchorId, status: "failed", error: e.message };
  }
  res.json({ success: true, data: { sha256, signature: { alg: "Ed25519", value: signature, publicKeyPem }, anchor, signed_at: new Date().toISOString(), signed_by: req.user.email } });
});

// POST /api/v1/evidence/verify — { pack, signature, anchorId } → signature + on-chain check
router.post("/verify", async (req, res) => {
  const { pack, signature, anchorId } = req.body || {};
  if (!pack || !signature) return res.status(400).json({ success: false, error: "pack and signature required" });
  const sha256 = digestOf(pack);
  let signatureValid = false;
  try { signatureValid = crypto.verify(null, Buffer.from(sha256, "hex"), publicKey, Buffer.from(signature, "base64")); } catch {}
  let onChain = null;
  if (anchorId) {
    try { onChain = (await blockchainService.checkIntegrity(anchorId, sha256)); } catch (e) { onChain = { error: e.message }; }
  }
  res.json({ success: true, data: { sha256, signatureValid, onChain } });
});

module.exports = router;
