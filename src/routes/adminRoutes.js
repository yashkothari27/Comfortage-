const express = require("express");
const { param, body, validationResult } = require("express-validator");
const db = require("../db/database");
const blockchainService = require("../services/blockchainService");
const { authorizeRole } = require("../middleware/auth");
const logger = require("../logger");

const router = express.Router();

// All admin routes require admin role
router.use(authorizeRole("admin"));

const VALID_ROLES = ["nurse", "doctor", "pharmacist", "consent_manager", "auditor", "admin", "pending"];

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

// ═══════════════════════════════════════════════════════════════════
// GET /admin/users — list all users
// ═══════════════════════════════════════════════════════════════════
router.get("/users", (req, res) => {
  const users = db.prepare(`
    SELECT id, email, full_name, role, wallet_address, created_at, updated_at
    FROM users ORDER BY created_at DESC
  `).all();

  res.json({
    success: true,
    count: users.length,
    users: users.map(u => ({
      id:            u.id,
      email:         u.email,
      fullName:      u.full_name,
      role:          u.role,
      walletAddress: u.wallet_address,
      createdAt:     u.created_at,
      updatedAt:     u.updated_at,
    })),
  });
});

// ═══════════════════════════════════════════════════════════════════
// GET /admin/users/:id — single user
// ═══════════════════════════════════════════════════════════════════
router.get(
  "/users/:id",
  [param("id").isInt(), validate],
  (req, res) => {
    const user = db.prepare("SELECT id, email, full_name, role, wallet_address, created_at FROM users WHERE id = ?").get(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({
      success: true,
      user: {
        id:            user.id,
        email:         user.email,
        fullName:      user.full_name,
        role:          user.role,
        walletAddress: user.wallet_address,
        createdAt:     user.created_at,
      },
    });
  }
);

// ═══════════════════════════════════════════════════════════════════
// PUT /admin/users/:id/role — assign a role to a user
//
// This does two things atomically from the user's perspective:
//   1. Updates the role in the database
//   2. Calls contract.grantRole(roleHash, walletAddress) on-chain
//      using the deployer (admin) wallet
//
// Body: { role: "nurse" | "doctor" | "pharmacist" | "consent_manager" | "auditor" }
// ═══════════════════════════════════════════════════════════════════
router.put(
  "/users/:id/role",
  [
    param("id").isInt(),
    body("role").isIn(VALID_ROLES).withMessage(`role must be one of: ${VALID_ROLES.join(", ")}`),
    validate,
  ],
  async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { role } = req.body;

      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      if (!user.wallet_address) return res.status(400).json({ error: "User has no wallet address" });

      logger.info(`Admin assigning role '${role}' to user ${user.email} (wallet: ${user.wallet_address})`);

      // Grant on-chain role (only for non-admin/non-pending roles that have on-chain equivalents)
      let onChainTx = null;
      const ON_CHAIN_ROLES = ["nurse", "doctor", "pharmacist", "consent_manager", "auditor"];
      if (ON_CHAIN_ROLES.includes(role)) {
        onChainTx = await blockchainService.grantUserRole(role, user.wallet_address);
        logger.info(`On-chain role granted: tx ${onChainTx.transactionHash}`);
      }

      // Update DB
      db.prepare("UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?").run(role, userId);

      const updated = db.prepare("SELECT id, email, full_name, role, wallet_address FROM users WHERE id = ?").get(userId);

      res.json({
        success: true,
        message: `Role '${role}' assigned to ${user.email}`,
        user: {
          id:            updated.id,
          email:         updated.email,
          fullName:      updated.full_name,
          role:          updated.role,
          walletAddress: updated.wallet_address,
        },
        onChain: onChainTx,
      });
    } catch (error) {
      logger.error(`PUT /admin/users/:id/role failed: ${error.message}`);
      res.status(500).json({ error: "Role assignment failed", detail: error.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════
// DELETE /admin/users/:id — remove a user
// ═══════════════════════════════════════════════════════════════════
router.delete(
  "/users/:id",
  [param("id").isInt(), validate],
  (req, res) => {
    const user = db.prepare("SELECT id, email FROM users WHERE id = ?").get(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
    logger.info(`Admin deleted user: ${user.email}`);

    res.json({ success: true, message: `User ${user.email} deleted.` });
  }
);

module.exports = router;
