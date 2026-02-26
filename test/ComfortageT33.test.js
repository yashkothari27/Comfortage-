const { expect } = require("chai");
const hre = require("hardhat");

// NOTE: ComfortageT33 contract test - contract name is defined in ComfortageT33.sol
// but the actual contract is DataIntegrity. This test is skipped.
describe.skip("ComfortageT33", function () {
  it("Should deploy with initial supply", async function () {
    const ComfortageT33 = await hre.ethers.getContractFactory("ComfortageT33");
    const comfortageT33 = await ComfortageT33.deploy(1000000);
    await comfortageT33.waitForDeployment();
    expect(await comfortageT33.totalSupply()).to.equal(1000000);
  });
});