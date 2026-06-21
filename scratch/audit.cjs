const { ethers } = require("hardhat");

async function main() {
  const [deployer, voter] = await ethers.getSigners();
  console.log("Using deployer address:", deployer.address);
  console.log("Using voter address:", voter.address);

  // Deploy the contract locally
  const SecureVote = await ethers.getContractFactory("SecureVote");
  const secureVote = await SecureVote.deploy();
  await secureVote.waitForDeployment();
  console.log("Deployed contract to:", await secureVote.getAddress());

  const electionId = ethers.id("test-audit-election");
  const startTime = Math.floor(Date.now() / 1000) - 1000;
  const endTime = Math.floor(Date.now() / 1000) + 10000;
  const candidateCount = 2;

  console.log("\n1. Creating election...");
  await secureVote.createElection(electionId, "Audit Election", startTime, endTime, candidateCount);
  console.log("Election created.");

  console.log("\n2. Registering candidates...");
  for (let i = 0; i < candidateCount; i++) {
    await secureVote.registerCandidate(electionId, `Candidate ${i}`);
  }
  console.log("Candidates registered.");

  console.log("\n3. Authorizing voter...");
  await secureVote.authorizeVoter(electionId, voter.address);
  console.log("Voter authorized.");

  console.log("\n4. Activating election...");
  await secureVote.activateElection(electionId);
  console.log("Election activated.");

  console.log("\n5. Getting election info...");
  const e = await secureVote.getElection(electionId);
  console.log("Election info:", e);

  console.log("\n6. Simulating castVote...");
  const voteHash = ethers.id("test-vote-hash");
  try {
    const tx = await secureVote.connect(voter).castVote(electionId, 0, voteHash);
    await tx.wait();
    console.log("Vote cast successfully.");
  } catch (error) {
    console.log("Vote casting failed!");
    if (error.data) {
      console.log("Error data:", error.data);
      try {
        const decodedError = secureVote.interface.parseError(error.data);
        console.log("Decoded error:", decodedError.name);
      } catch (e) {
        console.log("Failed to decode error.");
      }
    } else {
      console.log("Error object:", error);
    }
  }
}

main().catch(console.error);
