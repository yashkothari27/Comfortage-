const { ethers } = require("ethers");
const crypto = require("crypto");
const config = require("../config");

// Derive a 32-byte AES key from the hex WALLET_ENCRYPTION_KEY env var
function _getEncryptionKey() {
  if (!config.walletEncryptionKey) {
    throw new Error("WALLET_ENCRYPTION_KEY is not set in environment");
  }
  return Buffer.from(config.walletEncryptionKey, "hex");
}

/**
 * Generate a fresh Ethereum-compatible wallet.
 * @returns {{ address: string, privateKey: string }}
 */
function generateWallet() {
  const wallet = ethers.Wallet.createRandom();
  return { address: wallet.address, privateKey: wallet.privateKey };
}

/**
 * AES-256-GCM encrypt a private key for storage.
 * @returns {{ encrypted: string, iv: string, authTag: string }}
 */
function encryptPrivateKey(privateKey) {
  const key = _getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([
    cipher.update(privateKey, "utf8"),
    cipher.final(),
  ]);

  return {
    encrypted: encrypted.toString("hex"),
    iv:        iv.toString("hex"),
    authTag:   cipher.getAuthTag().toString("hex"),
  };
}

/**
 * AES-256-GCM decrypt a stored private key.
 * @returns {string} plaintext private key
 */
function decryptPrivateKey(encrypted, iv, authTag) {
  const key = _getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "hex")
  );
  decipher.setAuthTag(Buffer.from(authTag, "hex"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "hex")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * Get a connected ethers Wallet for a user row.
 * @param {object} user — DB row with encrypted_private_key, wallet_iv, wallet_auth_tag
 * @param {ethers.Provider} provider
 * @returns {ethers.Wallet}
 */
function getWalletForUser(user, provider) {
  const privateKey = decryptPrivateKey(
    user.encrypted_private_key,
    user.wallet_iv,
    user.wallet_auth_tag
  );
  return new ethers.Wallet(privateKey, provider);
}

module.exports = { generateWallet, encryptPrivateKey, decryptPrivateKey, getWalletForUser };
