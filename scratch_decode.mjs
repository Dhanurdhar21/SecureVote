import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: "c:/Users/dhanu/Projects/SecureVote-main/.env" });

const RPC_URL = process.env.SEPOLIA_RPC_URL;
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const CONTRACT_ADDRESS = process.env.VITE_CONTRACT_ADDRESS;

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    
    const abiPath = "c:/Users/dhanu/Projects/SecureVote-main/src/lib/blockchain/SecureVoteABI.json";
    const abi = JSON.parse(fs.readFileSync(abiPath, "utf-8"));
    const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);
    
    try {
        const electionId = ethers.id("test-election-" + Date.now());
        const start = Math.floor(Date.now() / 1000);
        const end = start + 3600;
        console.log("Calling createElection...");
        const tx = await contract.createElection(electionId, "Test", start, end, 3);
        console.log("Tx hash:", tx.hash);
        await tx.wait();
        console.log("Success");
    } catch (e) {
        console.error("Error occurred!");
        if (e.data) {
            console.log("Error data:", e.data);
            try {
                const decoded = contract.interface.parseError(e.data);
                console.log("Decoded error:", decoded);
            } catch(decErr) {
                console.log("Could not decode:", decErr);
            }
        } else {
            console.error(e);
        }
    }
}

main().catch(console.error);
