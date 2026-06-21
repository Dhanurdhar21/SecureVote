/**
 * contract.ts — Low-level contract connection utilities for SecureVote.
 * Uses ethers v6 BrowserProvider with MetaMask.
 */
import { ethers } from 'ethers';
import SecureVoteABI from './SecureVoteABI.json';

// ──────────────────────────────────────────────
// Configuration from environment
// ──────────────────────────────────────────────
const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || '';
const EXPECTED_CHAIN_ID = parseInt(import.meta.env.VITE_CHAIN_ID || '11155111');
const CHAIN_NAME = import.meta.env.VITE_CHAIN_NAME || 'Sepolia';
const BLOCK_EXPLORER_URL = import.meta.env.VITE_BLOCK_EXPLORER_URL || 'https://sepolia.etherscan.io';

export type WalletState = 'connected' | 'locked' | 'wrong_network' | 'not_installed';

// ──────────────────────────────────────────────
// Provider & Signer
// ──────────────────────────────────────────────

/**
 * Returns a BrowserProvider connected to MetaMask.
 * Throws if MetaMask is not installed.
 */
export function getProvider(): ethers.BrowserProvider {
  const ethereum = (window as any).ethereum;
  if (!ethereum) {
    throw new Error('MetaMask is not installed. Please install MetaMask to continue.');
  }
  return new ethers.BrowserProvider(ethereum);
}

/**
 * Returns the connected signer from MetaMask.
 */
export async function getSigner(): Promise<ethers.JsonRpcSigner> {
  const provider = getProvider();
  return provider.getSigner();
}

/**
 * Returns the connected wallet address.
 */
export async function getConnectedAddress(): Promise<string> {
  const signer = await getSigner();
  return signer.getAddress();
}

// ──────────────────────────────────────────────
// Contract Instances
// ──────────────────────────────────────────────

/**
 * Returns a read-write contract instance connected via MetaMask signer.
 * Used for write operations (castVote, createElection, etc.).
 */
export async function getContract(): Promise<ethers.Contract> {
  if (!CONTRACT_ADDRESS) {
    throw new Error('Contract address not configured. Set VITE_CONTRACT_ADDRESS in .env');
  }
  const signer = await getSigner();
  return new ethers.Contract(CONTRACT_ADDRESS, SecureVoteABI, signer);
}

/**
 * Returns a read-only contract instance using the browser provider.
 * Used for view/pure function calls (getResults, verifyVote, etc.).
 */
export function getReadOnlyContract(): ethers.Contract {
  if (!CONTRACT_ADDRESS) {
    throw new Error('Contract address not configured. Set VITE_CONTRACT_ADDRESS in .env');
  }
  const provider = getProvider();
  return new ethers.Contract(CONTRACT_ADDRESS, SecureVoteABI, provider);
}

// ──────────────────────────────────────────────
// Network Validation
// ──────────────────────────────────────────────

/**
 * Validates the connected network matches the expected chain.
 * Returns true if on the correct network, false otherwise.
 */
export async function validateNetwork(): Promise<boolean> {
  try {
    const provider = getProvider();
    const network = await provider.getNetwork();
    return Number(network.chainId) === EXPECTED_CHAIN_ID;
  } catch {
    return false;
  }
}

/**
 * Prompts MetaMask to switch to the expected chain (Sepolia).
 * Falls back to adding the chain if it's not in MetaMask.
 */
export async function switchToSepolia(): Promise<void> {
  const ethereum = (window as any).ethereum;
  if (!ethereum) {
    throw new Error('MetaMask is not installed.');
  }

  const chainIdHex = '0x' + EXPECTED_CHAIN_ID.toString(16);

  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainIdHex }],
    });
  } catch (switchError: any) {
    // Chain not added to MetaMask — add it
    if (switchError.code === 4902) {
      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: chainIdHex,
          chainName: CHAIN_NAME,
          nativeCurrency: { name: 'SepoliaETH', symbol: 'ETH', decimals: 18 },
          rpcUrls: ['https://rpc.sepolia.org'],
          blockExplorerUrls: [BLOCK_EXPLORER_URL],
        }],
      });
    } else {
      throw switchError;
    }
  }
}

/**
 * Detects the current wallet state.
 */
export async function detectWalletState(): Promise<WalletState> {
  const ethereum = (window as any).ethereum;
  if (!ethereum) return 'not_installed';

  try {
    const accounts: string[] = await ethereum.request({ method: 'eth_accounts' });
    if (!accounts || accounts.length === 0) return 'locked';

    const isCorrect = await validateNetwork();
    if (!isCorrect) return 'wrong_network';

    return 'connected';
  } catch {
    return 'locked';
  }
}

// ──────────────────────────────────────────────
// Explorer URL Helpers
// ──────────────────────────────────────────────

export function getExplorerTxUrl(txHash: string): string {
  return `${BLOCK_EXPLORER_URL}/tx/${txHash}`;
}

export function getExplorerAddressUrl(address: string): string {
  return `${BLOCK_EXPLORER_URL}/address/${address}`;
}

export function getExplorerBlockUrl(blockNumber: number): string {
  return `${BLOCK_EXPLORER_URL}/block/${blockNumber}`;
}

export { CONTRACT_ADDRESS, EXPECTED_CHAIN_ID, CHAIN_NAME, BLOCK_EXPLORER_URL };
