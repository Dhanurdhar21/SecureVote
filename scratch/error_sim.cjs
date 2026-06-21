const { ethers } = require("hardhat");

async function main() {
  const [deployer, voter] = await ethers.getSigners();

  const SecureVote = await ethers.getContractFactory("SecureVote");
  const secureVote = await SecureVote.deploy();
  await secureVote.waitForDeployment();

  const electionId = ethers.id("test-audit-election");
  const startTime = Math.floor(Date.now() / 1000) - 1000;
  const endTime = Math.floor(Date.now() / 1000) + 10000;
  
  await secureVote.createElection(electionId, "Audit", startTime, endTime, 2);
  await secureVote.registerCandidate(electionId, "C1");
  await secureVote.registerCandidate(electionId, "C2");
  await secureVote.activateElection(electionId);
  // Deliberately DO NOT authorize the voter to trigger VoterNotAuthorized

  try {
    await secureVote.connect(voter).castVote(electionId, 0, ethers.id("vote1"));
  } catch (error) {
    console.log("Keys on error:", Object.keys(error));
    console.log("error.data:", error.data);
    console.log("error.info:", error.info);
    console.log("error.error:", error.error);
    if (error.info && error.info.error && error.info.error.data) {
      console.log("Found nested error data:", error.info.error.data);
      console.log("Decoded:", secureVote.interface.parseError(error.info.error.data).name);
    }
  }
}

main().catch(console.error);
