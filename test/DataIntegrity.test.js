const { expect } = require("chai");
const hre = require("hardhat");

describe("DataIntegrity on Reltime (simulated)", function () {
  let contract;
  let admin, ingester, validator, outsider;

  const SAMPLE_HASH = hre.ethers.id("sample-dataset-content");
  const SAMPLE_HASH_2 = hre.ethers.id("updated-dataset-content");
  const DATASET_ID = "DS-PILOT-001";
  const METADATA_CID = "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco";

  beforeEach(async function () {
    [admin, ingester, validator, outsider] = await hre.ethers.getSigners();

    // Use fully qualified contract name to avoid ambiguity
    const DataIntegrity = await hre.ethers.getContractFactory("contracts/DataIntegrity.sol:DataIntegrity");
    contract = await DataIntegrity.deploy(admin.address, {
      gasPrice: 0,
    });
    await contract.waitForDeployment();

    // Grant roles
    const INGESTION_ROLE = await contract.INGESTION_ROLE();
    const VALIDATOR_ROLE = await contract.VALIDATOR_ROLE();
    await contract.grantRole(INGESTION_ROLE, ingester.address, { gasPrice: 0 });
    await contract.grantRole(VALIDATOR_ROLE, validator.address, { gasPrice: 0 });
  });

  describe("Hash Storage", function () {
    it("should store a dataset hash", async function () {
      const tx = await contract
        .connect(ingester)
        .storeHash(DATASET_ID, SAMPLE_HASH, METADATA_CID, { gasPrice: 0 });
      
      const receipt = await tx.wait();
      expect(receipt.status).to.equal(1);

      const [hash, timestamp, submitter, cid] = await contract.getHash(DATASET_ID);
      expect(hash).to.equal(SAMPLE_HASH);
      expect(submitter).to.equal(ingester.address);
      expect(cid).to.equal(METADATA_CID);
    });

    it("should reject duplicate dataset IDs", async function () {
      await contract
        .connect(ingester)
        .storeHash(DATASET_ID, SAMPLE_HASH, "", { gasPrice: 0 });

      await expect(
        contract
          .connect(ingester)
          .storeHash(DATASET_ID, SAMPLE_HASH, "", { gasPrice: 0 })
      ).to.be.revertedWithCustomError(contract, "DatasetAlreadyExists");
    });

    it("should reject zero hash", async function () {
      await expect(
        contract
          .connect(ingester)
          .storeHash(DATASET_ID, hre.ethers.ZeroHash, "", { gasPrice: 0 })
      ).to.be.revertedWithCustomError(contract, "InvalidHash");
    });

    it("should reject unauthorized callers", async function () {
      await expect(
        contract
          .connect(outsider)
          .storeHash(DATASET_ID, SAMPLE_HASH, "", { gasPrice: 0 })
      ).to.be.reverted;
    });
  });

  describe("Hash Update", function () {
    beforeEach(async function () {
      await contract
        .connect(ingester)
        .storeHash(DATASET_ID, SAMPLE_HASH, METADATA_CID, { gasPrice: 0 });
    });

    it("should update an existing hash", async function () {
      await contract
        .connect(ingester)
        .updateHash(DATASET_ID, SAMPLE_HASH_2, METADATA_CID, { gasPrice: 0 });

      const [hash] = await contract.getHash(DATASET_ID);
      expect(hash).to.equal(SAMPLE_HASH_2);
    });

    it("should maintain hash history", async function () {
      await contract
        .connect(ingester)
        .updateHash(DATASET_ID, SAMPLE_HASH_2, "", { gasPrice: 0 });

      const history = await contract.getHashHistory(DATASET_ID);
      expect(history.length).to.equal(2);
      expect(history[0]).to.equal(SAMPLE_HASH);
      expect(history[1]).to.equal(SAMPLE_HASH_2);
    });
  });

  describe("Hash Validation (T3.4 DataIntegrityValidator)", function () {
    beforeEach(async function () {
      await contract
        .connect(ingester)
        .storeHash(DATASET_ID, SAMPLE_HASH, METADATA_CID, { gasPrice: 0 });
    });

    it("should validate a correct hash", async function () {
      const tx = await contract
        .connect(validator)
        .validateHash(DATASET_ID, SAMPLE_HASH, { gasPrice: 0 });

      const receipt = await tx.wait();
      
      // Parse IntegrityChecked event
      const event = receipt.logs
        .map((log) => {
          try { return contract.interface.parseLog(log); } catch { return null; }
        })
        .find((e) => e && e.name === "IntegrityChecked");

      expect(event.args.isValid).to.be.true;
    });

    it("should detect a tampered hash", async function () {
      const WRONG_HASH = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("tampered-data"));

      const tx = await contract
        .connect(validator)
        .validateHash(DATASET_ID, WRONG_HASH, { gasPrice: 0 });

      const receipt = await tx.wait();
      const event = receipt.logs
        .map((log) => {
          try { return contract.interface.parseLog(log); } catch { return null; }
        })
        .find((e) => e && e.name === "IntegrityChecked");

      expect(event.args.isValid).to.be.false;
    });
  });

  describe("Record Count", function () {
    it("should track total records", async function () {
      expect(await contract.totalRecords()).to.equal(0);

      await contract.connect(ingester).storeHash("DS-001", SAMPLE_HASH, "", { gasPrice: 0 });
      expect(await contract.totalRecords()).to.equal(1);

      await contract.connect(ingester).storeHash("DS-002", SAMPLE_HASH_2, "", { gasPrice: 0 });
      expect(await contract.totalRecords()).to.equal(2);
    });
  });
});
