/**
 * COMFORTage T3.3 — Full Deployment & User Setup
 *
 * What this does:
 *  1.  Deploys DataIntegrity contract to Reltime Mainnet
 *  2.  Creates an admin account in the local DB (email + password)
 *  3.  Registers 10 clinical users (2 per role) with email + password
 *      — backend auto-provisions a blockchain wallet for each user
 *  4.  Admin assigns on-chain roles to all users via PUT /admin/users/:id/role
 *  5.  Seeds 10 realistic medical record hashes using each role's account
 *  6.  Doctor validates every record on-chain (audit trail)
 *  7.  Auditor pulls the compliance summary
 *  8.  Saves the complete setup report to users.json
 *
 * Usage:
 *   node scripts/full-setup.js
 *
 * Requires:
 *   DEPLOYER_PRIVATE_KEY and JWT_SECRET set in .env
 *   Server NOT running (this script calls the DB and blockchain directly)
 */

require("dotenv").config();
const { ethers }   = require("ethers");
const bcrypt       = require("bcrypt");
const crypto       = require("crypto");
const fs           = require("fs");
const path         = require("path");

// ── Bootstrap DB and services directly (no HTTP) ─────────────────
const db = require("../src/db/database");
const { generateWallet, encryptPrivateKey, decryptPrivateKey } = require("../src/services/walletService");
const { issueToken } = require("../src/middleware/auth");
const blockchainService = require("../src/services/blockchainService");

const sep  = () => console.log("─".repeat(64));
const sep2 = () => console.log("═".repeat(64));

function sha256hex(str) {
  return "0x" + crypto.createHash("sha256").update(str, "utf8").digest("hex");
}

// ── User definitions (2 per role) ────────────────────────────────
const USER_DEFS = [
  // Nurses
  { email: "sara.johnson@comfortage.health",   password: "Nurse@Sara2024!",      fullName: "Sara Johnson",    role: "nurse"           },
  { email: "miguel.torres@comfortage.health",  password: "Nurse@Miguel2024!",     fullName: "Miguel Torres",   role: "nurse"           },
  // Doctors
  { email: "dr.emily.chen@comfortage.health",  password: "Doctor@Emily2024!",     fullName: "Dr. Emily Chen",  role: "doctor"          },
  { email: "dr.james.patel@comfortage.health", password: "Doctor@James2024!",     fullName: "Dr. James Patel", role: "doctor"          },
  // Pharmacists
  { email: "anna.schmidt@comfortage.health",   password: "Pharma@Anna2024!",      fullName: "Anna Schmidt",    role: "pharmacist"      },
  { email: "lucas.martin@comfortage.health",   password: "Pharma@Lucas2024!",     fullName: "Lucas Martin",    role: "pharmacist"      },
  // Consent Managers
  { email: "sofia.russo@comfortage.health",    password: "Consent@Sofia2024!",    fullName: "Sofia Russo",     role: "consent_manager" },
  { email: "alex.nguyen@comfortage.health",    password: "Consent@Alex2024!",     fullName: "Alex Nguyen",     role: "consent_manager" },
  // Auditors
  { email: "claire.dubois@comfortage.health",  password: "Audit@Claire2024!",     fullName: "Claire Dubois",   role: "auditor"         },
  { email: "peter.kowalski@comfortage.health", password: "Audit@Peter2024!",      fullName: "Peter Kowalski",  role: "auditor"         },
];

// ── Realistic medical records ─────────────────────────────────────
// plaintext = what gets SHA-256'd off-chain before sending to blockchain
const RECORDS = [
  {
    datasetId:   "LAB-P10042-CBC-20240318",
    plaintext:   "CBC|patient:P10042|WBC:6.2|RBC:4.81|HGB:14.2|HCT:42.1|MCV:88|PLT:210|date:2024-03-18|lab:RELTIME-LAB-01",
    recordType:  "LAB_RESULT",
    submitterEmail: "sara.johnson@comfortage.health",
    metadataCID: "QmLabCBCP10042Mar2024",
  },
  {
    datasetId:   "LAB-P10042-CMP-20240318",
    plaintext:   "CMP|patient:P10042|glucose:182|BUN:14|creatinine:0.9|eGFR:88|Na:139|K:4.1|date:2024-03-18|lab:RELTIME-LAB-01",
    recordType:  "LAB_RESULT",
    submitterEmail: "sara.johnson@comfortage.health",
    metadataCID: "QmLabCMPP10042Mar2024",
  },
  {
    datasetId:   "LAB-P10099-HBA1C-20240320",
    plaintext:   "HbA1c|patient:P10099|result:7.4%|ref:<5.7%|date:2024-03-20|lab:RELTIME-LAB-02",
    recordType:  "LAB_RESULT",
    submitterEmail: "miguel.torres@comfortage.health",
    metadataCID: "QmLabHba1cP10099",
  },
  {
    datasetId:   "IMG-P10099-CXR-20240320",
    plaintext:   "DICOM|modality:CXR|patient:P10099|radiologist:DR-PATEL|findings:ClearLungs|impression:NoAcuteDisease|date:2024-03-20",
    recordType:  "IMAGING",
    submitterEmail: "miguel.torres@comfortage.health",
    metadataCID: "QmCxrP10099",
  },
  {
    datasetId:   "DX-P10042-T2DM-HTN-20240318",
    plaintext:   "ICD10:E11.9,I10|diagnoses:Type2Diabetes,Hypertension|patient:P10042|attending:DR-CHEN|date:2024-03-18",
    recordType:  "DIAGNOSIS",
    submitterEmail: "sara.johnson@comfortage.health",
    metadataCID: "QmDxP10042",
  },
  {
    datasetId:   "RX-P10042-MET-20240318",
    plaintext:   "Rx|drug:Metformin|dose:500mg|freq:BID|patient:P10042|prescriber:DR-CHEN|qty:60|refills:5|date:2024-03-18",
    recordType:  "PRESCRIPTION",
    submitterEmail: "anna.schmidt@comfortage.health",
    metadataCID: "QmRxMetforminP10042",
  },
  {
    datasetId:   "RX-P10042-AML-20240318",
    plaintext:   "Rx|drug:Amlodipine|dose:5mg|freq:QD|patient:P10042|prescriber:DR-CHEN|qty:30|refills:11|date:2024-03-18",
    recordType:  "PRESCRIPTION",
    submitterEmail: "anna.schmidt@comfortage.health",
    metadataCID: "QmRxAmlodipineP10042",
  },
  {
    datasetId:   "RX-P10099-INS-20240320",
    plaintext:   "Rx|drug:InsulinGlargine|dose:10units|freq:QHS|patient:P10099|prescriber:DR-CHEN|qty:1vial|refills:3|date:2024-03-20",
    recordType:  "PRESCRIPTION",
    submitterEmail: "lucas.martin@comfortage.health",
    metadataCID: "QmRxInsulinP10099",
  },
  {
    datasetId:   "CONSENT-P10042-STUDY-20240315",
    plaintext:   "Consent|study:COMFORT-T33|patient:P10042|signed:2024-03-15T10:22:00Z|witness:NURSE-SARA|version:v2.1",
    recordType:  "CONSENT_FORM",
    submitterEmail: "sofia.russo@comfortage.health",
    metadataCID: "QmConsentP10042Study",
  },
  {
    datasetId:   "CONSENT-P10099-STUDY-20240316",
    plaintext:   "Consent|study:COMFORT-T33|patient:P10099|signed:2024-03-16T09:10:00Z|witness:NURSE-MIGUEL|version:v2.1",
    recordType:  "CONSENT_FORM",
    submitterEmail: "alex.nguyen@comfortage.health",
    metadataCID: "QmConsentP10099Study",
  },
];

const RECORD_TYPE_INDEX = { LAB_RESULT: 0, DIAGNOSIS: 1, PRESCRIPTION: 2, CONSENT_FORM: 3, IMAGING: 4 };

// ─────────────────────────────────────────────────────────────────
async function main() {
  sep2();
  console.log("  COMFORTage T3.3 — Full Deployment & User Setup");
  console.log("  Network: Reltime Mainnet (Chain ID: 32323)");
  sep2();

  if (!process.env.DEPLOYER_PRIVATE_KEY) {
    console.error("\n❌  DEPLOYER_PRIVATE_KEY not set in .env\n");
    process.exit(1);
  }

  // ── 1. Deploy contract ────────────────────────────────────────
  console.log("\n[1/7] Deploying DataIntegrity contract...");
  sep();
  await blockchainService.initialize();
  console.log("      Blockchain service connected.");

  const rpc = process.env.RELTIME_RPC_URL || "https://mainnet.reltime.com/";
  const provider = new ethers.JsonRpcProvider(rpc, { name: "reltime-mainnet", chainId: 32323 });
  const deployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  console.log(`      Deployer: ${deployer.address}`);

  const artifactPath = path.join(__dirname, "../artifacts/contracts/DataIntegrity.sol/DataIntegrity.json");
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const factory  = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);

  const contract = await factory.deploy(deployer.address, { gasPrice: 0, gasLimit: 10_000_000 });
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();
  console.log(`  ✅  Deployed: ${contractAddress}`);

  // Patch .env with new contract address
  let envContent = fs.readFileSync(path.join(__dirname, "../.env"), "utf8");
  envContent = envContent.replace(/^CONTRACT_ADDRESS=.*$/m, `CONTRACT_ADDRESS=${contractAddress}`);
  fs.writeFileSync(path.join(__dirname, "../.env"), envContent);
  console.log("  ✅  CONTRACT_ADDRESS written to .env");

  // Re-init blockchain service with the new contract address
  process.env.CONTRACT_ADDRESS = contractAddress;
  blockchainService.contract = new ethers.Contract(contractAddress, artifact.abi, deployer);
  blockchainService.signer = deployer;

  // ── 2. Create admin account ───────────────────────────────────
  console.log("\n[2/7] Creating admin account...");
  sep();

  const adminEmail    = "admin@comfortage.health";
  const adminPassword = "Admin@Comfortage2024!";
  const adminWallet   = generateWallet();
  const adminEnc      = encryptPrivateKey(adminWallet.privateKey);

  db.prepare("DELETE FROM users WHERE email = ?").run(adminEmail);
  const adminHash = await bcrypt.hash(adminPassword, 12);
  const adminResult = db.prepare(`
    INSERT INTO users (email, password_hash, full_name, role, wallet_address, encrypted_private_key, wallet_iv, wallet_auth_tag)
    VALUES (?, ?, ?, 'admin', ?, ?, ?, ?)
  `).run(adminEmail, adminHash, "System Administrator", adminWallet.address, adminEnc.encrypted, adminEnc.iv, adminEnc.authTag);

  const adminUser = db.prepare("SELECT * FROM users WHERE id = ?").get(adminResult.lastInsertRowid);
  const adminToken = issueToken(adminUser);
  console.log(`  ✅  admin  ${adminEmail}  wallet: ${adminWallet.address}`);

  // ── 3. Register 10 clinical users ─────────────────────────────
  console.log("\n[3/7] Registering 10 clinical users (2 per role)...");
  sep();

  const registeredUsers = [];

  for (const def of USER_DEFS) {
    // Clean existing (idempotent re-run)
    db.prepare("DELETE FROM users WHERE email = ?").run(def.email);

    const passwordHash = await bcrypt.hash(def.password, 12);
    const wallet = generateWallet();
    const enc    = encryptPrivateKey(wallet.privateKey);

    const result = db.prepare(`
      INSERT INTO users (email, password_hash, full_name, role, wallet_address, encrypted_private_key, wallet_iv, wallet_auth_tag)
      VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)
    `).run(def.email, passwordHash, def.fullName, wallet.address, enc.encrypted, enc.iv, enc.authTag);

    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
    const token = issueToken(user);

    registeredUsers.push({ ...def, id: user.id, walletAddress: wallet.address, token });
    console.log(`  ✅  ${def.fullName.padEnd(22)} ${def.role.padEnd(16)} ${wallet.address}`);
  }

  // ── 4. Admin assigns on-chain roles ──────────────────────────
  console.log("\n[4/7] Assigning on-chain roles (admin → each user)...");
  sep();

  const ROLE_HASH_FN = {
    nurse:           () => contract.INGESTION_ROLE(),
    doctor:          () => contract.VALIDATOR_ROLE(),
    pharmacist:      () => contract.PHARMACIST_ROLE(),
    consent_manager: () => contract.CONSENT_MANAGER_ROLE(),
    auditor:         () => contract.AUDITOR_ROLE(),
  };

  for (const user of registeredUsers) {
    const roleHash = await ROLE_HASH_FN[user.role]();
    const tx = await contract.grantRole(roleHash, user.walletAddress, { gasPrice: 0 });
    await tx.wait();
    // Update DB role
    db.prepare("UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?").run(user.role, user.id);
    user.token = issueToken({ id: user.id, email: user.email, role: user.role });
    console.log(`  ✅  ${user.fullName.padEnd(22)} → ${user.role}`);
  }

  // ── 5. Seed medical record hashes ────────────────────────────
  console.log("\n[5/7] Seeding 10 medical record hashes on-chain...");
  sep();

  const seeded = [];

  for (const rec of RECORDS) {
    const submitter = registeredUsers.find(u => u.email === rec.submitterEmail);
    if (!submitter) { console.warn(`  ⚠  No user found for ${rec.submitterEmail}`); continue; }

    const dbUser = db.prepare("SELECT * FROM users WHERE id = ?").get(submitter.id);
    const privateKey = decryptPrivateKey(dbUser.encrypted_private_key, dbUser.wallet_iv, dbUser.wallet_auth_tag);
    const hash = sha256hex(rec.plaintext);
    const rtIdx = RECORD_TYPE_INDEX[rec.recordType];

    process.stdout.write(`  ${rec.datasetId.padEnd(34)} `);
    const result = await blockchainService.storeHashAs(privateKey, rec.datasetId, hash, rec.metadataCID, rtIdx);
    console.log(`✅  block ${result.blockNumber}  ${hash.slice(0, 14)}...`);

    seeded.push({ ...rec, hash, txHash: result.transactionHash, blockNumber: result.blockNumber });
  }

  // ── 6. Doctor validates all records ──────────────────────────
  console.log("\n[6/7] Validating all records on-chain (Dr. Emily Chen)...");
  sep();

  const doctor = registeredUsers.find(u => u.email === "dr.emily.chen@comfortage.health");
  const doctorDbUser = db.prepare("SELECT * FROM users WHERE id = ?").get(doctor.id);
  const doctorKey = decryptPrivateKey(doctorDbUser.encrypted_private_key, doctorDbUser.wallet_iv, doctorDbUser.wallet_auth_tag);

  for (const rec of seeded) {
    process.stdout.write(`  Validating ${rec.datasetId.padEnd(34)} `);
    const res = await blockchainService.validateHashAs(doctorKey, rec.datasetId, rec.hash);
    console.log(res.isValid ? "✅  VALID" : "❌  TAMPERED");
  }

  // ── 7. Auditor pulls compliance summary ───────────────────────
  console.log("\n[7/7] Compliance audit summary (Claire Dubois, Auditor)...");
  sep();

  const auditor = registeredUsers.find(u => u.email === "claire.dubois@comfortage.health");
  const auditorDbUser = db.prepare("SELECT * FROM users WHERE id = ?").get(auditor.id);
  const auditorKey = decryptPrivateKey(auditorDbUser.encrypted_private_key, auditorDbUser.wallet_iv, auditorDbUser.wallet_auth_tag);
  const summary = await blockchainService.getAuditSummaryAs(auditorKey);

  console.log("  Record type breakdown on Reltime blockchain:");
  console.log(`    LAB_RESULT   : ${summary.labResults}`);
  console.log(`    DIAGNOSIS    : ${summary.diagnoses}`);
  console.log(`    PRESCRIPTION : ${summary.prescriptions}`);
  console.log(`    CONSENT_FORM : ${summary.consentForms}`);
  console.log(`    IMAGING      : ${summary.imagingRecords}`);
  console.log(`    ──────────────────`);
  console.log(`    TOTAL        : ${summary.total}`);

  // ── Save report ───────────────────────────────────────────────
  const report = {
    generatedAt:     new Date().toISOString(),
    contractAddress,
    network:         "Reltime Mainnet",
    chainId:         32323,
    adminAccount: {
      email:         adminEmail,
      password:      adminPassword,
      walletAddress: adminWallet.address,
      token:         adminToken,
    },
    users: registeredUsers.map(u => ({
      id:            u.id,
      email:         u.email,
      password:      u.password,
      fullName:      u.fullName,
      role:          u.role,
      walletAddress: u.walletAddress,
      jwtToken:      u.token,
    })),
    seededRecords: seeded.map(r => ({
      datasetId:     r.datasetId,
      recordType:    r.recordType,
      submittedBy:   r.submitterEmail,
      hash:          r.hash,
      txHash:        r.txHash,
      blockNumber:   r.blockNumber,
    })),
    auditSummary: summary,
  };

  const outPath = path.join(__dirname, "../users.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  // ── Print credentials table ───────────────────────────────────
  sep2();
  console.log("\n🎉  Setup complete!");
  sep2();
  console.log(`\n  Contract  : ${contractAddress}`);
  console.log(`  Records   : ${seeded.length} hashes stored on-chain`);
  console.log(`  Report    : users.json\n`);
  sep();
  console.log("  USER CREDENTIALS\n");

  const allUsers = [
    { email: adminEmail, password: adminPassword, role: "admin", token: adminToken, walletAddress: adminWallet.address },
    ...registeredUsers.map(u => ({ email: u.email, password: u.password, role: u.role, token: u.token, walletAddress: u.walletAddress })),
  ];

  for (const u of allUsers) {
    console.log(`  [${u.role.padEnd(16)}] ${u.fullName || u.email}`);
    console.log(`   Email    : ${u.email}`);
    console.log(`   Password : ${u.password}`);
    console.log(`   Wallet   : ${u.walletAddress}`);
    console.log(`   Token    : ${u.token.slice(0, 60)}...`);
    console.log();
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("\n❌  Setup failed:", err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  });
