const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("SecureVote", function () {
  async function deploySecureVoteFixture() {
    const [owner, voter1, voter2, voter3, nonVoter] = await ethers.getSigners();

    const SecureVote = await ethers.getContractFactory("SecureVote");
    const secureVote = await SecureVote.deploy();

    const electionId = ethers.id("test-election-001");
    const now = Math.floor(Date.now() / 1000);
    const startTime = now - 3600; // Started 1 hour ago
    const endTime = now + 86400;  // Ends in 24 hours
    const candidateCount = 3;

    return { secureVote, owner, voter1, voter2, voter3, nonVoter, electionId, startTime, endTime, candidateCount };
  }

  describe("Election Creation", function () {
    it("Should create an election", async function () {
      const { secureVote, electionId, startTime, endTime, candidateCount } = await loadFixture(deploySecureVoteFixture);

      await expect(secureVote.createElection(electionId, "Student Council 2025", startTime, endTime, candidateCount))
        .to.emit(secureVote, "ElectionCreated")
        .withArgs(electionId, "Student Council 2025", startTime, endTime, candidateCount);
    });

    it("Should reject duplicate election IDs", async function () {
      const { secureVote, electionId, startTime, endTime, candidateCount } = await loadFixture(deploySecureVoteFixture);

      await secureVote.createElection(electionId, "First Election", startTime, endTime, candidateCount);
      await expect(secureVote.createElection(electionId, "Duplicate", startTime, endTime, candidateCount))
        .to.be.revertedWithCustomError(secureVote, "ElectionAlreadyExists");
    });

    it("Should reject invalid time ranges", async function () {
      const { secureVote, electionId } = await loadFixture(deploySecureVoteFixture);
      const now = Math.floor(Date.now() / 1000);

      await expect(secureVote.createElection(electionId, "Bad Time", now + 100, now + 50, 2))
        .to.be.revertedWithCustomError(secureVote, "InvalidTimeRange");
    });

    it("Should reject zero candidate count", async function () {
      const { secureVote, electionId, startTime, endTime } = await loadFixture(deploySecureVoteFixture);

      await expect(secureVote.createElection(electionId, "No Candidates", startTime, endTime, 0))
        .to.be.revertedWithCustomError(secureVote, "InvalidCandidateCount");
    });

    it("Should allow any user to create elections", async function () {
      const { secureVote, voter1, electionId, startTime, endTime, candidateCount } = await loadFixture(deploySecureVoteFixture);

      await expect(secureVote.connect(voter1).createElection(electionId, "Authorized", startTime, endTime, candidateCount))
        .to.emit(secureVote, "ElectionCreated")
        .withArgs(electionId, "Authorized", startTime, endTime, candidateCount);
    });
  });

  describe("Voter Authorization", function () {
    it("Should authorize voters", async function () {
      const { secureVote, voter1, electionId, startTime, endTime, candidateCount } = await loadFixture(deploySecureVoteFixture);

      await secureVote.createElection(electionId, "Test", startTime, endTime, candidateCount);

      await expect(secureVote.authorizeVoter(electionId, voter1.address))
        .to.emit(secureVote, "VoterAuthorized")
        .withArgs(electionId, voter1.address);

      expect(await secureVote.isVoterAuthorized(electionId, voter1.address)).to.be.true;
    });

    it("Should batch authorize voters", async function () {
      const { secureVote, voter1, voter2, voter3, electionId, startTime, endTime, candidateCount } = await loadFixture(deploySecureVoteFixture);

      await secureVote.createElection(electionId, "Test", startTime, endTime, candidateCount);
      await secureVote.authorizeVotersBatch(electionId, [voter1.address, voter2.address, voter3.address]);

      expect(await secureVote.isVoterAuthorized(electionId, voter1.address)).to.be.true;
      expect(await secureVote.isVoterAuthorized(electionId, voter2.address)).to.be.true;
      expect(await secureVote.isVoterAuthorized(electionId, voter3.address)).to.be.true;
    });
  });

  describe("Voting", function () {
    it("Should cast a vote successfully (any wallet, no on-chain auth required)", async function () {
      const { secureVote, voter1, electionId, startTime, endTime, candidateCount } = await loadFixture(deploySecureVoteFixture);

      await secureVote.createElection(electionId, "Test", startTime, endTime, candidateCount);
      for(let i=0; i<candidateCount; i++) {
        await secureVote.registerCandidate(electionId, `Candidate ${i}`);
      }
      await secureVote.activateElection(electionId);
      // No authorizeVoter call — voter authorization is handled off-chain via Supabase

      const voteHash = ethers.id("test-vote-hash");

      await expect(secureVote.connect(voter1).castVote(electionId, 0, voteHash))
        .to.emit(secureVote, "VoteCast")
        .withArgs(electionId, voter1.address, 0, voteHash);

      const [hasVoted, storedHash] = await secureVote.verifyVote(electionId, voter1.address);
      expect(hasVoted).to.be.true;
      expect(storedHash).to.equal(voteHash);
    });

    it("Should prevent double voting", async function () {
      const { secureVote, voter1, electionId, startTime, endTime, candidateCount } = await loadFixture(deploySecureVoteFixture);

      await secureVote.createElection(electionId, "Test", startTime, endTime, candidateCount);
      for(let i=0; i<candidateCount; i++) {
        await secureVote.registerCandidate(electionId, `Candidate ${i}`);
      }
      await secureVote.activateElection(electionId);
      await secureVote.authorizeVoter(electionId, voter1.address);

      const voteHash = ethers.id("vote1");
      await secureVote.connect(voter1).castVote(electionId, 0, voteHash);

      await expect(secureVote.connect(voter1).castVote(electionId, 1, ethers.id("vote2")))
        .to.be.revertedWithCustomError(secureVote, "AlreadyVoted");
    });

    it("Should allow any wallet to vote without on-chain authorization", async function () {
      const { secureVote, nonVoter, electionId, startTime, endTime, candidateCount } = await loadFixture(deploySecureVoteFixture);

      await secureVote.createElection(electionId, "Test", startTime, endTime, candidateCount);
      for(let i=0; i<candidateCount; i++) {
        await secureVote.registerCandidate(electionId, `Candidate ${i}`);
      }
      await secureVote.activateElection(electionId);

      // Should succeed — authorization is handled off-chain
      await expect(secureVote.connect(nonVoter).castVote(electionId, 0, ethers.id("hash")))
        .to.emit(secureVote, "VoteCast");
    });
  });

  describe("Election Closure & Results", function () {
    it("Should close an election and return results", async function () {
      const { secureVote, voter1, voter2, electionId, startTime, endTime, candidateCount } = await loadFixture(deploySecureVoteFixture);

      await secureVote.createElection(electionId, "Test", startTime, endTime, candidateCount);
      for(let i=0; i<candidateCount; i++) {
        await secureVote.registerCandidate(electionId, `Candidate ${i}`);
      }
      await secureVote.activateElection(electionId);
      await secureVote.authorizeVotersBatch(electionId, [voter1.address, voter2.address]);

      await secureVote.connect(voter1).castVote(electionId, 0, ethers.id("v1"));
      await secureVote.connect(voter2).castVote(electionId, 1, ethers.id("v2"));

      await expect(secureVote.closeElection(electionId))
        .to.emit(secureVote, "ElectionClosed");

      const results = await secureVote.getResults(electionId);
      expect(results[0]).to.equal(1n);
      expect(results[1]).to.equal(1n);
      expect(results[2]).to.equal(0n);
    });
  });
});
