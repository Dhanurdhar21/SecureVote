const { ethers } = require("ethers");
const fs = require("fs");
const SecureVoteABI = JSON.parse(fs.readFileSync("./src/lib/blockchain/SecureVoteABI.json", "utf8"));
require('dotenv').config();

const SUPABASE_ID = "50816552-aa60-4f5d-a482-b2d2da111f3b";
const CONTRACT_ADDRESS = process.env.VITE_CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

async function main() {
  const provider = new ethers.JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com");
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, SecureVoteABI, wallet);
  const electionBytes32 = ethers.id(SUPABASE_ID);

  try {
    console.log("Registering candidate 1...");
    let tx = await contract.registerCandidate(electionBytes32, "Veera");
    await tx.wait();

    console.log("Registering candidate 2...");
    tx = await contract.registerCandidate(electionBytes32, "Arjun");
    await tx.wait();

    console.log("Activating election...");
    tx = await contract.activateElection(electionBytes32);
    await tx.wait();
    console.log("Activated!");
  } catch (e) {
    console.error(e);
  }

  // Now static call castVote again
  try {
    await contract.castVote.staticCall(electionBytes32, 0, ethers.id("test"));
    console.log("castVote staticCall succeeded");
  } catch (e) {
    if (e.data) {
      const decoded = contract.interface.parseError(e.data);
      console.log("castVote reverted with:", decoded?.name || e.data);
    } else {
      console.log("castVote reverted with:", e.message);
    }
  }
}
main().catch(console.error);
