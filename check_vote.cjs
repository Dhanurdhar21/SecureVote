const { ethers } = require("ethers");
const fs = require("fs");
const SecureVoteABI = JSON.parse(fs.readFileSync("./src/lib/blockchain/SecureVoteABI.json", "utf8"));
require('dotenv').config();

const SUPABASE_ID = "50816552-aa60-4f5d-a482-b2d2da111f3b";
const CONTRACT_ADDRESS = process.env.VITE_CONTRACT_ADDRESS;

async function main() {
  const provider = new ethers.JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com");
  const contract = new ethers.Contract(CONTRACT_ADDRESS, SecureVoteABI, provider);
  const electionBytes32 = ethers.id(SUPABASE_ID);

  try {
    // Check if voter is authorized
    const isAuth = await contract.isVoterAuthorized(electionBytes32, "0x000000000000000000000000000000000000dEaD");
    console.log("Is Voter Authorized:", isAuth);
  } catch (e) {
    console.error("Error calling isVoterAuthorized", e);
  }

  // Let's also check static call for castVote to see what error it returns
  try {
    // candidateIndex 0, dummy vote hash
    await contract.castVote.staticCall(electionBytes32, 0, ethers.id("test"));
    console.log("castVote staticCall succeeded");
  } catch (e) {
    // Ethers v6 exposes custom errors via parsed error
    if (e.data) {
      const decoded = contract.interface.parseError(e.data);
      console.log("castVote reverted with:", decoded?.name || e.data);
    } else {
      console.log("castVote reverted with:", e.message);
    }
  }
}
main().catch(console.error);
