const { ethers } = require("ethers");
const fs = require("fs");
const SecureVoteABI = JSON.parse(fs.readFileSync("./src/lib/blockchain/SecureVoteABI.json", "utf8"));
require('dotenv').config();

const SUPABASE_ID = "50816552-aa60-4f5d-a482-b2d2da111f3b";
const CONTRACT_ADDRESS = process.env.VITE_CONTRACT_ADDRESS;

async function main() {
  if (!CONTRACT_ADDRESS) throw new Error("VITE_CONTRACT_ADDRESS not set");

const provider = new ethers.JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com");
  const contract = new ethers.Contract(CONTRACT_ADDRESS, SecureVoteABI, provider);

  const electionBytes32 = ethers.id(SUPABASE_ID);
  
  console.log("Supabase ID:", SUPABASE_ID);
  console.log("Bytes32:", electionBytes32);

  const election = await contract.getElection(electionBytes32);
  console.log("Election Data:", election);

  const block = await provider.getBlock("latest");
  console.log("Current Block Timestamp:", block.timestamp);
}

main().catch(console.error);
