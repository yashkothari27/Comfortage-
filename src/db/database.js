const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const config = require("../config");

// Vercel and other read-only serverless environments only allow writes to /tmp
const resolvedPath = path.resolve(config.dbPath);
const dbPath = process.env.VERCEL
  ? path.join("/tmp", path.basename(resolvedPath))
  : resolvedPath;
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

// Enable WAL for better concurrent read performance
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    email                TEXT    UNIQUE NOT NULL,
    password_hash        TEXT    NOT NULL,
    full_name            TEXT    NOT NULL,
    role                 TEXT    NOT NULL DEFAULT 'pending',
    wallet_address       TEXT    UNIQUE,
    encrypted_private_key TEXT,
    wallet_iv            TEXT,
    wallet_auth_tag      TEXT,
    created_at           TEXT    DEFAULT (datetime('now')),
    updated_at           TEXT    DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_users_email         ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_wallet_address ON users(wallet_address);
  CREATE INDEX IF NOT EXISTS idx_users_role           ON users(role);
`);

module.exports = db;
