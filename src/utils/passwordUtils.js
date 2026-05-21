const crypto = require("crypto");

const SALT_LENGTH = 16;
const ITERATIONS = 100000;
const KEY_LENGTH = 64;
const DIGEST = "sha256";

/**
 * Hash a password using PBKDF2
 * Returns base64 encoded string of salt:hash
 */
async function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_LENGTH).toString("base64");
  const hash = crypto
    .pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST)
    .toString("base64");
  return `${salt}:${hash}`;
}

/**
 * Compare a password with its hash
 * Both password and hash should be strings
 */
async function comparePassword(password, passwordHash) {
  const [salt, hash] = passwordHash.split(":");
  if (!salt || !hash) return false;

  const computedHash = crypto
    .pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST)
    .toString("base64");
  
  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(computedHash));
}

module.exports = {
  hashPassword,
  comparePassword,
};
