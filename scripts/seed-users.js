const bcrypt = require("bcrypt");
const db = require("../src/db/database");
const { generateWallet, encryptPrivateKey } = require("../src/services/walletService");

const SALT_ROUNDS = 12;

const testUsers = [
  { email: "sara.johnson@comfortage.health",    password: "Nurse@Sara2024!",        fullName: "Sara Johnson",    role: "nurse" },
  { email: "dr.emily.chen@comfortage.health",   password: "Doctor@Emily2024!",      fullName: "Dr. Emily Chen",  role: "doctor" },
  { email: "anna.schmidt@comfortage.health",    password: "Pharma@Anna2024!",       fullName: "Anna Schmidt",    role: "pharmacist" },
  { email: "sofia.russo@comfortage.health",     password: "Consent@Sofia2024!",     fullName: "Sofia Russo",     role: "consent_officer" },
  { email: "claire.dubois@comfortage.health",   password: "Audit@Claire2024!",      fullName: "Claire Dubois",   role: "auditor" },
  { email: "admin@comfortage.health",           password: "Admin@Comfortage2024!",  fullName: "System Admin",    role: "admin" },
];

(async () => {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO users
      (email, password_hash, full_name, role, wallet_address, encrypted_private_key, wallet_iv, wallet_auth_tag)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const u of testUsers) {
    const hash = await bcrypt.hash(u.password, SALT_ROUNDS);
    const { address, privateKey } = generateWallet();
    const { encrypted, iv, authTag } = encryptPrivateKey(privateKey);
    insert.run(u.email, hash, u.fullName, u.role, address, encrypted, iv, authTag);
    console.log(`✓ ${u.role.padEnd(16)} ${u.email}`);
  }

  console.log("\nDone. All test users seeded.");
  process.exit(0);
})();
