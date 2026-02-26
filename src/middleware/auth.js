const jwt = require("jsonwebtoken");
const config = require("../config");
const logger = require("../logger");

/**
 * JWT Authentication middleware.
 * The DataIntegrityValidator (T3.4) must include a Bearer token.
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // "Bearer <token>"

  if (!token) {
    logger.warn(`Unauthenticated request from ${req.ip} to ${req.path}`);
    return res.status(401).json({
      error: "Authentication required",
      message: "Provide a Bearer token in the Authorization header.",
    });
  }

  jwt.verify(token, config.jwt.secret, (err, user) => {
    if (err) {
      logger.warn(`Invalid token from ${req.ip}: ${err.message}`);
      return res.status(403).json({
        error: "Invalid or expired token",
      });
    }
    req.user = user;
    next();
  });
}

/**
 * Generate a service token for T3.4 DataIntegrityValidator.
 * Run once: node -e "require('./src/middleware/auth').generateToken('t34-validator')"
 */
function generateToken(serviceId) {
  const token = jwt.sign(
    { serviceId, role: "validator" },
    config.jwt.secret,
    { expiresIn: "365d" }
  );
  console.log("\n═══ Service Token ═══");
  console.log(token);
  console.log("═════════════════════\n");
  return token;
}

module.exports = { authenticateToken, generateToken };
