const jwt = require("jsonwebtoken");
const config = require("../config");
const logger = require("../logger");

// Roles recognised by the system
const ROLES = {
  NURSE:           "nurse",
  DOCTOR:          "doctor",
  PHARMACIST:      "pharmacist",
  CONSENT_MANAGER: "consent_manager",
  AUDITOR:         "auditor",
  ADMIN:           "admin",
  PENDING:         "pending",
};

// Which record types each role may ingest (API-layer pre-check)
const ROLE_ALLOWED_TYPES = {
  [ROLES.NURSE]:           ["LAB_RESULT", "DIAGNOSIS", "IMAGING"],
  [ROLES.PHARMACIST]:      ["PRESCRIPTION"],
  [ROLES.CONSENT_MANAGER]: ["CONSENT_FORM"],
  [ROLES.ADMIN]:           ["LAB_RESULT", "DIAGNOSIS", "PRESCRIPTION", "CONSENT_FORM", "IMAGING"],
};

/**
 * Verify Bearer JWT and attach decoded payload to req.user.
 * Token payload: { userId, email, role }
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    logger.warn(`Unauthenticated request from ${req.ip} to ${req.path}`);
    return res.status(401).json({
      error: "Authentication required",
      message: "Provide a Bearer token in the Authorization header.",
    });
  }

  jwt.verify(token, config.jwt.secret, (err, payload) => {
    if (err) {
      logger.warn(`Invalid token from ${req.ip}: ${err.message}`);
      return res.status(403).json({ error: "Invalid or expired token" });
    }
    req.user = payload; // { userId, email, role }
    next();
  });
}

/**
 * Role-based authorization.
 * Usage: authorizeRole("doctor", "admin")
 */
function authorizeRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(`Forbidden: role '${req.user.role}' on ${req.path}`);
      return res.status(403).json({
        error: "Forbidden",
        message: `Role '${req.user.role}' is not permitted for this action.`,
        requiredRoles: allowedRoles,
      });
    }
    next();
  };
}

/**
 * Validate that the caller's role may ingest the requested recordType.
 * Fast-fail before the on-chain transaction.
 */
function authorizeRecordType(req, res, next) {
  const { recordType } = req.body;
  if (!recordType) return next();

  const allowed = ROLE_ALLOWED_TYPES[req.user?.role] || [];
  if (!allowed.includes(recordType)) {
    logger.warn(`Role '${req.user?.role}' attempted to submit '${recordType}'`);
    return res.status(403).json({
      error: "Forbidden",
      message: `Your role ('${req.user?.role}') may not submit '${recordType}' records.`,
      allowedTypes: allowed,
    });
  }
  next();
}

/**
 * Issue a signed JWT for a registered user.
 * @param {{ id, email, role }} user
 */
function issueToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn || "24h" }
  );
}

module.exports = { authenticateToken, authorizeRole, authorizeRecordType, issueToken, ROLES };
