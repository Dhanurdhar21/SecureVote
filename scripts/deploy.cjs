const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Deploying SecureVote contract to network...\n");

  const [deployer] = await ethers.getSigners();
  console.log("📋 Deployer address:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("💰 Deployer balance:", ethers.formatEther(balance), "ETH\n");

  // Deploy the contract
  const SecureVote = await ethers.getContractFactory("SecureVote");
  const secureVote = await SecureVote.deploy();
  await secureVote.waitForDeployment();

  const contractAddress = await secureVote.getAddress();
  console.log("✅ SecureVote deployed to:", contractAddress);
  console.log("🔗 Etherscan:", `https://sepolia.etherscan.io/address/${contractAddress}\n`);

  // Copy ABI to frontend
  const artifactPath = path.join(__dirname, "..", "artifacts", "contracts", "SecureVote.sol", "SecureVote.json");
  const abiOutputPath = path.join(__dirname, "..", "src", "lib", "blockchain", "SecureVoteABI.json");

  // Ensure output directory exists
  const outputDir = path.dirname(abiOutputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Read full artifact and extract just the ABI
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
  fs.writeFileSync(abiOutputPath, JSON.stringify(artifact.abi, null, 2));
  console.log("📦 ABI copied to:", abiOutputPath);

  // Print .env update instruction
  console.log("\n═══════════════════════════════════════════════");
  console.log("📝 Update your .env file:");
  console.log(`   VITE_CONTRACT_ADDRESS="${contractAddress}"`);
  console.log("═══════════════════════════════════════════════\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
