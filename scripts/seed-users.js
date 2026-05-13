const bcrypt = require("bcrypt");
const db = require("../src/db/database");
const { encryptPrivateKey } = require("../src/services/walletService");
const { ethers } = require("ethers");

const SALT_ROUNDS = 12;

// These wallets are pre-authorized on the Reltime Mainnet contract.
// Nurse/IoT → INGESTION_ROLE, Doctor → VALIDATOR_ROLE, etc.
const testUsers = [
  // ── Admin ──
  { email: "admin@comfortage.health",          password: "Admin@Comfortage2024!", fullName: "System Admin",      role: "admin",            privateKey: null },

  // ── Nurses (INGESTION_ROLE) ──
  { email: "sara.johnson@comfortage.health",   password: "Nurse@Sara2024!",       fullName: "Sara Johnson",      role: "nurse",            privateKey: "0xa4548ab4b1ee56838dcf3f916a22a52d991de6340ce893fdc31d7c5c1ffb2ef9" },
  { email: "miguel.torres@comfortage.health",  password: "Nurse@Miguel2024!",     fullName: "Miguel Torres",     role: "nurse",            privateKey: "0x3cd940c0e5c10159094c513eb8cbfd7de8660430c09b271bce24fae18be10794" },

  // ── Doctors (VALIDATOR_ROLE) ──
  { email: "dr.emily.chen@comfortage.health",  password: "Doctor@Emily2024!",     fullName: "Dr. Emily Chen",    role: "doctor",           privateKey: "0x41af26a4a686dca3b64232249eca1b04e8b259b4ddb39d14b4411d475ab8557a" },
  { email: "dr.james.patel@comfortage.health", password: "Doctor@James2024!",     fullName: "Dr. James Patel",   role: "doctor",           privateKey: "0xe0ac12a1fa5bb84c8fe825867316511186a2865e4a500a2bbd071c4975bb720f" },

  // ── Pharmacists (PHARMACIST_ROLE) ──
  { email: "anna.schmidt@comfortage.health",   password: "Pharma@Anna2024!",      fullName: "Anna Schmidt",      role: "pharmacist",       privateKey: "0xcab62e5cbebf57e858730b85e4b871186bfa0c3d156a9b3053657b82ebfb9463" },
  { email: "lucas.martin@comfortage.health",   password: "Pharma@Lucas2024!",     fullName: "Lucas Martin",      role: "pharmacist",       privateKey: "0x7c047d8dfb1437a4ca3f22a8502e2871c37f69e1baef04208b07771f31f763a7" },

  // ── Consent Managers (CONSENT_MANAGER_ROLE) ──
  { email: "sofia.russo@comfortage.health",    password: "Consent@Sofia2024!",    fullName: "Sofia Russo",       role: "consent_officer",  privateKey: "0xc3d97a42d207084c46bdfd4249dd915aac44715a68e3c946f3bc917ecd56205b" },
  { email: "alex.nguyen@comfortage.health",    password: "Consent@Alex2024!",     fullName: "Alex Nguyen",       role: "consent_officer",  privateKey: "0xa9ec81621e6c3ad79ecfda1ae512545b15c67ba8585b11a4473a88597c1f6b2b" },

  // ── Auditors (AUDITOR_ROLE) ──
  { email: "claire.dubois@comfortage.health",  password: "Audit@Claire2024!",     fullName: "Claire Dubois",     role: "auditor",          privateKey: "0x75f2ffb21b4541a563fb2bc4a9bbd47be06dac0ddc0660c88f0fa5ce781ead8b" },
  { email: "peter.kowalski@comfortage.health", password: "Audit@Peter2024!",      fullName: "Peter Kowalski",    role: "auditor",          privateKey: "0x7e877bb718e6942360ac0e6f0a19df75d2de475aa15ad98d5abc148d58bb1bf3" },
];

function seedUsers(silent = false) {
  const upsert = db.prepare(`
    INSERT INTO users
      (email, password_hash, full_name, role, wallet_address, encrypted_private_key, wallet_iv, wallet_auth_tag)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      password_hash         = excluded.password_hash,
      full_name             = excluded.full_name,
      role                  = excluded.role,
      wallet_address        = excluded.wallet_address,
      encrypted_private_key = excluded.encrypted_private_key,
      wallet_iv             = excluded.wallet_iv,
      wallet_auth_tag       = excluded.wallet_auth_tag,
      updated_at            = datetime('now')
  `);

  for (const u of testUsers) {
    const hash = bcrypt.hashSync(u.password, SALT_ROUNDS);
    const pk = u.privateKey ?? ethers.Wallet.createRandom().privateKey;
    const address = new ethers.Wallet(pk).address;
    const { encrypted, iv, authTag } = encryptPrivateKey(pk);
    upsert.run(u.email, hash, u.fullName, u.role, address, encrypted, iv, authTag);
    if (!silent) console.log(`✓ ${u.role.padEnd(16)} ${u.email}  →  ${address}`);
  }

  if (!silent) console.log("\nDone. All test users seeded with pre-authorized wallets.");
}

module.exports = { seedUsers };

// Run directly: node scripts/seed-users.js
if (require.main === module) {
  seedUsers();
  process.exit(0);
}
