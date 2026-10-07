const { ethers } = require("ethers");
const SecureVoteABI = require("./src/lib/blockchain/SecureVoteABI.json");

const SUPABASE_ID = "50816552-aa60-4f5d-a482-b2d2da111f3b";
const CONTRACT_ADDRESS = "0xeE1Ffb3c9bC40d87a66270EfcEeb4BA555Afa8fA"; // Need to get this from env or search

async function main() {
  require('dotenv').config();
  const address = process.env.VITE_CONTRACT_ADDRESS;
  if (!address) throw new Error("VITE_CONTRACT_ADDRESS not set");

  const provider = new ethers.JsonRpcProvider(process.env.VITE_RPC_URL || "https://rpc.sepolia.org");
  const contract = new ethers.Contract(address, SecureVoteABI, provider);

  const electionBytes32 = ethers.id(SUPABASE_ID);
  
  console.log("Supabase ID:", SUPABASE_ID);
  console.log("Bytes32:", electionBytes32);

  const election = await contract.getElection(electionBytes32);
  console.log("Election Data:", election);
}

main().catch(console.error);
