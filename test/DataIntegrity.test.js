const { expect } = require("chai");
const hre = require("hardhat");

/**
 * COMFORTage T3.3 — DataIntegrity contract tests
 *
 * Simulates a real clinical workflow across 5 roles:
 *   nurse            → LAB_RESULT, DIAGNOSIS, IMAGING
 *   doctor           → validates any record type
 *   pharmacist       → PRESCRIPTION
 *   consent_manager  → CONSENT_FORM
 *   auditor          → read-only audit summary
 */
describe("DataIntegrity — Role-Based Access & Record Types", function () {
  let contract;
  let admin, nurse, doctor, pharmacist, consentManager, auditor, outsider;

  // Role constants (fetched from contract)
  let INGESTION_ROLE, VALIDATOR_ROLE, PHARMACIST_ROLE, CONSENT_MANAGER_ROLE, AUDITOR_ROLE;

  // RecordType enum indices (mirrors Solidity enum)
  const RT = { LAB_RESULT: 0, DIAGNOSIS: 1, PRESCRIPTION: 2, CONSENT_FORM: 3, IMAGING: 4 };

  // ── Realistic test data ────────────────────────────────────────────
  // These represent SHA-256 hashes of real off-chain medical records.
  // We use ethers.id() (keccak256 of a string) to generate deterministic
  // test hashes — in production these would be SHA-256(record_bytes).

  const records = {
    // Nurse uploads a blood panel for patient P-10042
    labResult: {
      datasetId:   "LAB-P10042-CBC-20240318",
      hash:        hre.ethers.id("CBC|P10042|WBC:6.2|RBC:4.8|HGB:14.2|HCT:42.1|MCV:88|PLT:210|2024-03-18"),
      metadataCID: "QmLabCBCP10042Mar2024",
      recordType:  RT.LAB_RESULT,
    },

    // Nurse uploads an HbA1c result for a diabetic patient
    labResult2: {
      datasetId:   "LAB-P10099-HBA1C-20240320",
      hash:        hre.ethers.id("HbA1c|P10099|result:7.4%|ref:<5.7%|2024-03-20"),
      metadataCID: "QmLabHba1cP10099Mar2024",
      recordType:  RT.LAB_RESULT,
    },

    // Nurse uploads a clinical diagnosis record
    diagnosis: {
      datasetId:   "DX-P10042-T2DM-20240318",
      hash:        hre.ethers.id("ICD10:E11.9|Type2Diabetes|P10042|attending:DR-CHEN|2024-03-18"),
      metadataCID: "QmDxT2DMP10042",
      recordType:  RT.DIAGNOSIS,
    },

    // Pharmacist uploads a prescription hash
    prescription: {
      datasetId:   "RX-P10042-MET-20240318",
      hash:        hre.ethers.id("Metformin|500mg|BID|P10042|prescriber:DR-CHEN|qty:60|refills:5|2024-03-18"),
      metadataCID: "QmRxMetforminP10042",
      recordType:  RT.PRESCRIPTION,
    },

    // Pharmacist uploads an insulin prescription
    prescription2: {
      datasetId:   "RX-P10099-INS-20240320",
      hash:        hre.ethers.id("Insulin-Glargine|10units|QHS|P10099|prescriber:DR-CHEN|2024-03-20"),
      metadataCID: "QmRxInsulinP10099",
      recordType:  RT.PRESCRIPTION,
    },

    // Consent manager uploads signed consent form
    consentForm: {
      datasetId:   "CONSENT-P10042-STUDY-20240315",
      hash:        hre.ethers.id("STUDY:COMFORT-T33|patient:P10042|signed:2024-03-15|witness:NURSE-SARA"),
      metadataCID: "QmConsentP10042Study",
      recordType:  RT.CONSENT_FORM,
    },

    // Nurse uploads a chest X-ray imaging record
    imaging: {
      datasetId:   "IMG-P10099-CXR-20240320",
      hash:        hre.ethers.id("DICOM|CXR|P10099|radiologist:DR-PATEL|impression:NoAcuteDisease|2024-03-20"),
      metadataCID: "QmCxrP10099Mar2024",
      recordType:  RT.IMAGING,
    },
  };

  before(async function () {
    [admin, nurse, doctor, pharmacist, consentManager, auditor, outsider] =
      await hre.ethers.getSigners();

    const DataIntegrity = await hre.ethers.getContractFactory(
      "contracts/DataIntegrity.sol:DataIntegrity"
    );
    contract = await DataIntegrity.deploy(admin.address, { gasPrice: 0 });
    await contract.waitForDeployment();

    // Fetch role hashes from contract
    INGESTION_ROLE      = await contract.INGESTION_ROLE();
    VALIDATOR_ROLE      = await contract.VALIDATOR_ROLE();
    PHARMACIST_ROLE     = await contract.PHARMACIST_ROLE();
    CONSENT_MANAGER_ROLE= await contract.CONSENT_MANAGER_ROLE();
    AUDITOR_ROLE        = await contract.AUDITOR_ROLE();

    // Grant roles
    await contract.grantRole(INGESTION_ROLE,       nurse.address,         { gasPrice: 0 });
    await contract.grantRole(VALIDATOR_ROLE,        doctor.address,        { gasPrice: 0 });
    await contract.grantRole(PHARMACIST_ROLE,       pharmacist.address,    { gasPrice: 0 });
    await contract.grantRole(CONSENT_MANAGER_ROLE,  consentManager.address,{ gasPrice: 0 });
    await contract.grantRole(AUDITOR_ROLE,          auditor.address,       { gasPrice: 0 });
  });

  // ── Role Assignment ──────────────────────────────────────────────
  describe("Role Assignment", function () {
    it("nurse has INGESTION_ROLE", async function () {
      expect(await contract.hasRole(INGESTION_ROLE, nurse.address)).to.be.true;
    });

    it("doctor has VALIDATOR_ROLE", async function () {
      expect(await contract.hasRole(VALIDATOR_ROLE, doctor.address)).to.be.true;
    });

    it("pharmacist has PHARMACIST_ROLE", async function () {
      expect(await contract.hasRole(PHARMACIST_ROLE, pharmacist.address)).to.be.true;
    });

    it("consent manager has CONSENT_MANAGER_ROLE", async function () {
      expect(await contract.hasRole(CONSENT_MANAGER_ROLE, consentManager.address)).to.be.true;
    });

    it("auditor has AUDITOR_ROLE", async function () {
      expect(await contract.hasRole(AUDITOR_ROLE, auditor.address)).to.be.true;
    });

    it("outsider has no roles", async function () {
      expect(await contract.hasRole(INGESTION_ROLE,      outsider.address)).to.be.false;
      expect(await contract.hasRole(VALIDATOR_ROLE,      outsider.address)).to.be.false;
      expect(await contract.hasRole(PHARMACIST_ROLE,     outsider.address)).to.be.false;
      expect(await contract.hasRole(CONSENT_MANAGER_ROLE,outsider.address)).to.be.false;
      expect(await contract.hasRole(AUDITOR_ROLE,        outsider.address)).to.be.false;
    });
  });

  // ── Nurse: LAB_RESULT & DIAGNOSIS & IMAGING ──────────────────────
  describe("Nurse — LAB_RESULT, DIAGNOSIS, IMAGING", function () {
    it("stores a CBC blood panel (LAB_RESULT)", async function () {
      const { datasetId, hash, metadataCID, recordType } = records.labResult;
      const tx = await contract.connect(nurse).storeHash(datasetId, hash, metadataCID, recordType, { gasPrice: 0 });
      const receipt = await tx.wait();
      expect(receipt.status).to.equal(1);

      const [storedHash,, submitter,, storedType] = await contract.getHash(datasetId);
      expect(storedHash).to.equal(hash);
      expect(submitter).to.equal(nurse.address);
      expect(storedType).to.equal(BigInt(RT.LAB_RESULT));
    });

    it("stores a HbA1c result (LAB_RESULT)", async function () {
      const { datasetId, hash, metadataCID, recordType } = records.labResult2;
      await contract.connect(nurse).storeHash(datasetId, hash, metadataCID, recordType, { gasPrice: 0 });
      const [storedHash] = await contract.getHash(datasetId);
      expect(storedHash).to.equal(hash);
    });

    it("stores a Type 2 Diabetes diagnosis (DIAGNOSIS)", async function () {
      const { datasetId, hash, metadataCID, recordType } = records.diagnosis;
      await contract.connect(nurse).storeHash(datasetId, hash, metadataCID, recordType, { gasPrice: 0 });
      const [storedHash,,,, storedType] = await contract.getHash(datasetId);
      expect(storedHash).to.equal(hash);
      expect(storedType).to.equal(BigInt(RT.DIAGNOSIS));
    });

    it("stores a chest X-ray record (IMAGING)", async function () {
      const { datasetId, hash, metadataCID, recordType } = records.imaging;
      await contract.connect(nurse).storeHash(datasetId, hash, metadataCID, recordType, { gasPrice: 0 });
      const [storedHash,,,, storedType] = await contract.getHash(datasetId);
      expect(storedHash).to.equal(hash);
      expect(storedType).to.equal(BigInt(RT.IMAGING));
    });

    it("BLOCKS nurse from submitting PRESCRIPTION", async function () {
      await expect(
        contract.connect(nurse).storeHash(
          "RX-NURSE-ATTEMPT",
          hre.ethers.id("unauthorized-rx"),
          "",
          RT.PRESCRIPTION,
          { gasPrice: 0 }
        )
      ).to.be.revertedWithCustomError(contract, "UnauthorizedRecordType");
    });

    it("BLOCKS nurse from submitting CONSENT_FORM", async function () {
      await expect(
        contract.connect(nurse).storeHash(
          "CONSENT-NURSE-ATTEMPT",
          hre.ethers.id("unauthorized-consent"),
          "",
          RT.CONSENT_FORM,
          { gasPrice: 0 }
        )
      ).to.be.revertedWithCustomError(contract, "UnauthorizedRecordType");
    });
  });

  // ── Pharmacist: PRESCRIPTION only ────────────────────────────────
  describe("Pharmacist — PRESCRIPTION only", function () {
    it("stores a Metformin prescription (PRESCRIPTION)", async function () {
      const { datasetId, hash, metadataCID, recordType } = records.prescription;
      await contract.connect(pharmacist).storeHash(datasetId, hash, metadataCID, recordType, { gasPrice: 0 });

      const [storedHash,, submitter,, storedType] = await contract.getHash(datasetId);
      expect(storedHash).to.equal(hash);
      expect(submitter).to.equal(pharmacist.address);
      expect(storedType).to.equal(BigInt(RT.PRESCRIPTION));
    });

    it("stores an Insulin Glargine prescription (PRESCRIPTION)", async function () {
      const { datasetId, hash, metadataCID, recordType } = records.prescription2;
      await contract.connect(pharmacist).storeHash(datasetId, hash, metadataCID, recordType, { gasPrice: 0 });
      const [storedHash] = await contract.getHash(datasetId);
      expect(storedHash).to.equal(hash);
    });

    it("BLOCKS pharmacist from submitting LAB_RESULT", async function () {
      await expect(
        contract.connect(pharmacist).storeHash(
          "LAB-PHARM-ATTEMPT",
          hre.ethers.id("unauthorized-lab"),
          "",
          RT.LAB_RESULT,
          { gasPrice: 0 }
        )
      ).to.be.revertedWithCustomError(contract, "UnauthorizedRecordType");
    });

    it("BLOCKS pharmacist from submitting CONSENT_FORM", async function () {
      await expect(
        contract.connect(pharmacist).storeHash(
          "CONSENT-PHARM-ATTEMPT",
          hre.ethers.id("unauthorized-consent"),
          "",
          RT.CONSENT_FORM,
          { gasPrice: 0 }
        )
      ).to.be.revertedWithCustomError(contract, "UnauthorizedRecordType");
    });
  });

  // ── Consent Manager: CONSENT_FORM only ───────────────────────────
  describe("Consent Manager — CONSENT_FORM only", function () {
    it("stores a signed study consent form (CONSENT_FORM)", async function () {
      const { datasetId, hash, metadataCID, recordType } = records.consentForm;
      await contract.connect(consentManager).storeHash(datasetId, hash, metadataCID, recordType, { gasPrice: 0 });

      const [storedHash,, submitter,, storedType] = await contract.getHash(datasetId);
      expect(storedHash).to.equal(hash);
      expect(submitter).to.equal(consentManager.address);
      expect(storedType).to.equal(BigInt(RT.CONSENT_FORM));
    });

    it("BLOCKS consent manager from submitting LAB_RESULT", async function () {
      await expect(
        contract.connect(consentManager).storeHash(
          "LAB-CM-ATTEMPT",
          hre.ethers.id("unauthorized-lab"),
          "",
          RT.LAB_RESULT,
          { gasPrice: 0 }
        )
      ).to.be.revertedWithCustomError(contract, "UnauthorizedRecordType");
    });

    it("BLOCKS consent manager from submitting PRESCRIPTION", async function () {
      await expect(
        contract.connect(consentManager).storeHash(
          "RX-CM-ATTEMPT",
          hre.ethers.id("unauthorized-rx"),
          "",
          RT.PRESCRIPTION,
          { gasPrice: 0 }
        )
      ).to.be.revertedWithCustomError(contract, "UnauthorizedRecordType");
    });
  });

  // ── Doctor: validate any record type ─────────────────────────────
  describe("Doctor — VALIDATOR_ROLE (all types)", function () {
    it("validates a lab result hash as correct", async function () {
      const { datasetId, hash } = records.labResult;
      const tx = await contract.connect(doctor).validateHash(datasetId, hash, { gasPrice: 0 });
      const receipt = await tx.wait();

      const event = receipt.logs
        .map((log) => { try { return contract.interface.parseLog(log); } catch { return null; } })
        .find((e) => e?.name === "IntegrityChecked");

      expect(event.args.isValid).to.be.true;
      expect(event.args.recordType).to.equal(BigInt(RT.LAB_RESULT));
    });

    it("detects a tampered lab result (wrong hash)", async function () {
      const { datasetId } = records.labResult;
      const tamperedHash = hre.ethers.id("tampered-CBC-values");

      const tx = await contract.connect(doctor).validateHash(datasetId, tamperedHash, { gasPrice: 0 });
      const receipt = await tx.wait();

      const event = receipt.logs
        .map((log) => { try { return contract.interface.parseLog(log); } catch { return null; } })
        .find((e) => e?.name === "IntegrityChecked");

      expect(event.args.isValid).to.be.false;
    });

    it("validates a prescription hash", async function () {
      const { datasetId, hash } = records.prescription;
      const tx = await contract.connect(doctor).validateHash(datasetId, hash, { gasPrice: 0 });
      const receipt = await tx.wait();

      const event = receipt.logs
        .map((log) => { try { return contract.interface.parseLog(log); } catch { return null; } })
        .find((e) => e?.name === "IntegrityChecked");

      expect(event.args.isValid).to.be.true;
      expect(event.args.recordType).to.equal(BigInt(RT.PRESCRIPTION));
    });

    it("validates a consent form", async function () {
      const { datasetId, hash } = records.consentForm;
      const tx = await contract.connect(doctor).validateHash(datasetId, hash, { gasPrice: 0 });
      const receipt = await tx.wait();

      const event = receipt.logs
        .map((log) => { try { return contract.interface.parseLog(log); } catch { return null; } })
        .find((e) => e?.name === "IntegrityChecked");

      expect(event.args.isValid).to.be.true;
      expect(event.args.recordType).to.equal(BigInt(RT.CONSENT_FORM));
    });

    it("BLOCKS outsider from validating", async function () {
      const { datasetId, hash } = records.labResult;
      await expect(
        contract.connect(outsider).validateHash(datasetId, hash, { gasPrice: 0 })
      ).to.be.reverted;
    });
  });

  // ── Hash Update ───────────────────────────────────────────────────
  describe("Hash Update — amended records", function () {
    it("nurse can update an existing lab result (amended CBC)", async function () {
      const { datasetId } = records.labResult;
      const amendedHash = hre.ethers.id("CBC|P10042|WBC:6.8|RBC:4.9|HGB:14.5|HCT:43|MCV:88|PLT:215|AMENDED");

      await contract.connect(nurse).updateHash(datasetId, amendedHash, "QmAmendedCBCCID", { gasPrice: 0 });

      const [storedHash] = await contract.getHash(datasetId);
      expect(storedHash).to.equal(amendedHash);
    });

    it("maintains full history after amendment", async function () {
      const { datasetId, hash } = records.labResult;
      const history = await contract.getHashHistory(datasetId);

      expect(history.length).to.equal(2);
      expect(history[0]).to.equal(hash);     // original
      // history[1] = amended hash
    });

    it("pharmacist can update a prescription", async function () {
      const { datasetId } = records.prescription;
      const updatedRx = hre.ethers.id("Metformin|1000mg|BID|P10042|prescriber:DR-CHEN|qty:60|refills:5|DOSE-INCREASED");

      await contract.connect(pharmacist).updateHash(datasetId, updatedRx, "QmRxMetforminUpdated", { gasPrice: 0 });

      const [storedHash] = await contract.getHash(datasetId);
      expect(storedHash).to.equal(updatedRx);
    });

    it("BLOCKS nurse from updating a prescription", async function () {
      const { datasetId } = records.prescription;
      const tamperedHash = hre.ethers.id("unauthorized-rx-update");

      await expect(
        contract.connect(nurse).updateHash(datasetId, tamperedHash, "", { gasPrice: 0 })
      ).to.be.revertedWithCustomError(contract, "UnauthorizedRecordType");
    });
  });

  // ── Auditor: read-only summary ────────────────────────────────────
  describe("Auditor — Compliance Summary", function () {
    it("auditor can read audit summary with correct counts", async function () {
      const [labResults, diagnoses, prescriptions, consentForms, imagingRecords, total] =
        await contract.connect(auditor).getAuditSummary();

      // At this point: 2 labs, 1 diagnosis, 2 prescriptions, 1 consent, 1 imaging = 7
      expect(labResults).to.equal(2n);
      expect(diagnoses).to.equal(1n);
      expect(prescriptions).to.equal(2n);
      expect(consentForms).to.equal(1n);
      expect(imagingRecords).to.equal(1n);
      expect(total).to.equal(7n);
    });

    it("BLOCKS outsider from reading audit summary", async function () {
      await expect(
        contract.connect(outsider).getAuditSummary()
      ).to.be.reverted;
    });

    it("BLOCKS nurse from reading audit summary", async function () {
      await expect(
        contract.connect(nurse).getAuditSummary()
      ).to.be.reverted;
    });
  });

  // ── Guard rails ───────────────────────────────────────────────────
  describe("Guard rails", function () {
    it("rejects zero hash", async function () {
      await expect(
        contract.connect(nurse).storeHash("DS-ZERO", hre.ethers.ZeroHash, "", RT.LAB_RESULT, { gasPrice: 0 })
      ).to.be.revertedWithCustomError(contract, "InvalidHash");
    });

    it("rejects empty datasetId", async function () {
      await expect(
        contract.connect(nurse).storeHash("", hre.ethers.id("some-hash"), "", RT.LAB_RESULT, { gasPrice: 0 })
      ).to.be.revertedWithCustomError(contract, "InvalidDatasetId");
    });

    it("rejects duplicate datasetId", async function () {
      await expect(
        contract.connect(nurse).storeHash(
          records.labResult.datasetId,
          records.labResult.hash,
          "",
          RT.LAB_RESULT,
          { gasPrice: 0 }
        )
      ).to.be.revertedWithCustomError(contract, "DatasetAlreadyExists");
    });

    it("rejects outsider from any ingestion", async function () {
      await expect(
        contract.connect(outsider).storeHash(
          "DS-OUTSIDER",
          hre.ethers.id("malicious-data"),
          "",
          RT.LAB_RESULT,
          { gasPrice: 0 }
        )
      ).to.be.revertedWithCustomError(contract, "UnauthorizedRecordType");
    });
  });
});
