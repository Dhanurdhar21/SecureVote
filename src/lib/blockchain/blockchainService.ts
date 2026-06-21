/**
 * blockchainService.ts — High-level blockchain operations for SecureVote.
 * Every function validates the network, handles errors, and waits for tx confirmation.
 */
import { ethers } from 'ethers';
import { getContract, getReadOnlyContract, validateNetwork, getProvider } from './contract';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface BlockchainVoteResult {
  transactionHash: string;
  blockNumber: number;
  voteHash: string;
  timestamp: number;
}

export interface BlockchainElectionResult {
  transactionHash: string;
  blockNumber: number;
  contractElectionId: string;
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/**
 * Converts a Supabase UUID string into a bytes32 election ID for the contract.
 * Uses keccak256 hash so any string works as a deterministic bytes32.
 */
export function electionIdToBytes32(supabaseId: string): string {
  return ethers.id(supabaseId);
}

/**
 * Ensures the user is on the correct network before proceeding.
 * Throws a descriptive error if not.
 */
async function ensureCorrectNetwork(): Promise<void> {
  const isCorrect = await validateNetwork();
  if (!isCorrect) {
    throw new Error(
      'Wrong network detected. Please switch to Sepolia testnet in MetaMask to continue.'
    );
  }
}

/**
 * Generates a cryptographic vote hash for on-chain storage.
 * The hash commits to the election, candidate, voter, and a random nonce
 * so the actual vote choice is not directly visible on-chain.
 */
function generateVoteHash(
  electionId: string,
  candidateIndex: number,
  voterAddress: string
): string {
  const nonce = ethers.hexlify(ethers.randomBytes(16));
  return ethers.solidityPackedKeccak256(
    ['bytes32', 'uint256', 'address', 'bytes'],
    [electionIdToBytes32(electionId), candidateIndex, voterAddress, nonce]
  );
}

/**
 * Extracts and decodes the exact custom error from an Ethers.js v6 error object.
 * Checks nested error properties where MetaMask/Hardhat often bury the revert data.
 */
function parseEthersError(err: any, contract: ethers.Contract): Error {
  let errorData = null;

  // Search common paths for revert data
  if (err.data) errorData = err.data;
  else if (err.info?.error?.data) errorData = err.info.error.data;
  else if (err.error?.data) errorData = err.error.data;
  else if (err.error?.error?.data) errorData = err.error.error.data;
  else if (typeof err.reason === 'string' && err.reason.startsWith('execution reverted:')) {
     return new Error(err.reason);
  }

  if (errorData) {
    try {
      const decodedError = contract.interface.parseError(errorData);
      if (decodedError) {
        return new Error(decodedError.name);
      }
    } catch (e) {
      // Failed to parse, fallback below
    }
  }

  return err;
}

// ──────────────────────────────────────────────
// Admin Operations
// ──────────────────────────────────────────────

/**
 * Creates an election on the smart contract.
 * Called automatically during election creation in CreateElectionWizard.
 */
export async function createElectionOnChain(
  electionId: string,
  name: string,
  startTime: Date,
  endTime: Date,
  candidateCount: number
): Promise<BlockchainElectionResult> {
  await ensureCorrectNetwork();

  const contract = await getContract();
  const electionBytes32 = electionIdToBytes32(electionId);
  const startUnix = Math.floor(startTime.getTime() / 1000);
  const endUnix = Math.floor(endTime.getTime() / 1000);

  try {
    const tx = await contract.createElection(
      electionBytes32,
      name,
      startUnix,
      endUnix,
      candidateCount
    );

    const receipt = await tx.wait(1); // Wait for 1 block confirmation

    return {
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      contractElectionId: electionBytes32,
    };
  } catch (error: any) {
    throw parseEthersError(error, contract);
  }
}

/**
 * Registers a candidate for the election on the smart contract.
 */
export async function registerCandidateOnChain(
  electionId: string,
  candidateName: string
): Promise<string> {
  await ensureCorrectNetwork();

  const contract = await getContract();
  const electionBytes32 = electionIdToBytes32(electionId);

  try {
    const tx = await contract.registerCandidate(electionBytes32, candidateName);
    const receipt = await tx.wait(1);
    return receipt.hash;
  } catch (error: any) {
    throw parseEthersError(error, contract);
  }
}

/**
 * Activates an election once all candidates are registered.
 */
export async function activateElectionOnChain(
  electionId: string
): Promise<string> {
  await ensureCorrectNetwork();

  const contract = await getContract();
  const electionBytes32 = electionIdToBytes32(electionId);

  try {
    const tx = await contract.activateElection(electionBytes32);
    const receipt = await tx.wait(1);
    return receipt.hash;
  } catch (error: any) {
    throw parseEthersError(error, contract);
  }
}



/**
 * Authorizes a voter wallet address for an election.
 */
export async function authorizeVoterOnChain(
  electionId: string,
  voterAddress: string
): Promise<string> {
  await ensureCorrectNetwork();

  const contract = await getContract();
  const electionBytes32 = electionIdToBytes32(electionId);

  try {
    const tx = await contract.authorizeVoter(electionBytes32, voterAddress);
    const receipt = await tx.wait(1);
    return receipt.hash;
  } catch (error: any) {
    throw parseEthersError(error, contract);
  }
}

/**
 * Authorizes multiple voters for an election in a single transaction.
 */
export async function authorizeVotersBatchOnChain(
  electionId: string,
  voterAddresses: string[]
): Promise<string> {
  await ensureCorrectNetwork();

  const contract = await getContract();
  const electionBytes32 = electionIdToBytes32(electionId);

  try {
    const tx = await contract.authorizeVotersBatch(electionBytes32, voterAddresses);
    const receipt = await tx.wait(1);
    return receipt.hash;
  } catch (error: any) {
    throw parseEthersError(error, contract);
  }
}

// ──────────────────────────────────────────────
// Voter Operations
// ──────────────────────────────────────────────

/**
 * Casts a vote on the smart contract.
 * Generates a cryptographic vote hash and submits it on-chain.
 * Returns the transaction receipt data for storage in Supabase vote_audit.
 */
export async function castVoteOnChain(
  electionId: string,
  candidateIndex: number,
  voterAddress: string
): Promise<BlockchainVoteResult> {
  await ensureCorrectNetwork();

  const contract = await getContract();
  const electionBytes32 = electionIdToBytes32(electionId);
  const voteHash = generateVoteHash(electionId, candidateIndex, voterAddress);

  try {
    const tx = await contract.castVote(electionBytes32, candidateIndex, voteHash);
    const receipt = await tx.wait(1); // Wait for 1 block confirmation

    // Get the block to extract timestamp
    const provider = getProvider();
    const block = await provider.getBlock(receipt.blockNumber);

    return {
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      voteHash,
      timestamp: block?.timestamp || Math.floor(Date.now() / 1000),
    };
  } catch (error: any) {
    throw parseEthersError(error, contract);
  }
}

/**
 * Closes an election on the smart contract.
 */
export async function closeElectionOnChain(
  electionId: string
): Promise<string> {
  await ensureCorrectNetwork();

  const contract = await getContract();
  const electionBytes32 = electionIdToBytes32(electionId);

  try {
    const tx = await contract.closeElection(electionBytes32);
    const receipt = await tx.wait(1);
    return receipt.hash;
  } catch (error: any) {
    throw parseEthersError(error, contract);
  }
}

// ──────────────────────────────────────────────
// Read Operations (no gas cost)
// ──────────────────────────────────────────────

/**
 * Returns vote counts for all candidates in an election.
 */
export async function getElectionResultsOnChain(
  electionId: string
): Promise<number[]> {
  const contract = getReadOnlyContract();
  const electionBytes32 = electionIdToBytes32(electionId);

  const results: bigint[] = await contract.getResults(electionBytes32);
  return results.map((r) => Number(r));
}

/**
 * Verifies whether a voter has voted and returns their vote hash.
 */
export async function verifyVoteOnChain(
  electionId: string,
  voterAddress: string
): Promise<{ hasVoted: boolean; voteHash: string }> {
  const contract = getReadOnlyContract();
  const electionBytes32 = electionIdToBytes32(electionId);

  const [hasVoted, voteHash] = await contract.verifyVote(electionBytes32, voterAddress);

  return {
    hasVoted,
    voteHash,
  };
}

/**
 * Checks if a voter is authorized for an election.
 */
export async function isVoterAuthorizedOnChain(
  electionId: string,
  voterAddress: string
): Promise<boolean> {
  const contract = getReadOnlyContract();
  const electionBytes32 = electionIdToBytes32(electionId);

  return contract.isVoterAuthorized(electionBytes32, voterAddress);
}

/**
 * Returns election metadata from the smart contract.
 */
export async function getElectionOnChain(
  electionId: string
): Promise<{
  name: string;
  startTime: number;
  endTime: number;
  candidateCount: number;
  isActive: boolean;
  closed: boolean;
  totalVotes: number;
}> {
  const contract = getReadOnlyContract();
  const electionBytes32 = electionIdToBytes32(electionId);

  const result = await contract.getElection(electionBytes32);

  return {
    name: result[0],
    startTime: Number(result[1]),
    endTime: Number(result[2]),
    candidateCount: Number(result[3]),
    isActive: result[4],
    closed: result[5],
    totalVotes: Number(result[6]),
  };
}

// ──────────────────────────────────────────────
// Verification Helpers
// ──────────────────────────────────────────────

/**
 * Returns the Etherscan URL for a given transaction hash.
 */
export function getTransactionUrl(hash: string): string {
  const baseUrl = import.meta.env.VITE_BLOCK_EXPLORER_URL || 'https://sepolia.etherscan.io';
  return `${baseUrl}/tx/${hash}`;
}

/**
 * Verifies a transaction by its hash directly on the blockchain.
 * Checks if the transaction was successful and if it emitted a VoteCast event.
 */
export async function verifyVote(transactionHash: string): Promise<boolean> {
  try {
    const provider = getProvider();
    const receipt = await provider.getTransactionReceipt(transactionHash);
    
    // Receipt exists and status is 1 (success)
    if (!receipt || receipt.status !== 1) {
      return false;
    }

    const contract = getReadOnlyContract();
    
    // Check if any log in the receipt matches the VoteCast event
    for (const log of receipt.logs) {
      try {
        const parsedLog = contract.interface.parseLog(log);
        if (parsedLog && parsedLog.name === 'VoteCast') {
          return true; // Vote successfully verified on-chain
        }
      } catch (e) {
        // Not a VoteCast log or not from our contract, ignore
      }
    }
    
    return false;
  } catch (err) {
    console.error('Error verifying vote:', err);
    return false;
  }
}
