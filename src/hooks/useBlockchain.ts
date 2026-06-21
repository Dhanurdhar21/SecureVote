/**
 * useBlockchain.ts — React hook for blockchain state management.
 * Wraps blockchainService with reactive state for UI rendering.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  castVoteOnChain,
  verifyVoteOnChain,
  type BlockchainVoteResult,
} from '../lib/blockchain/blockchainService';
import {
  detectWalletState,
  switchToSepolia,
  validateNetwork,
  getExplorerTxUrl,
  getExplorerAddressUrl,
  getExplorerBlockUrl,
  type WalletState,
} from '../lib/blockchain/contract';

export type TxState = 'idle' | 'pending' | 'confirming' | 'confirmed' | 'failed';

export interface UseBlockchainReturn {
  // State
  walletState: WalletState | 'checking';
  isCorrectNetwork: boolean;
  txState: TxState;
  txHash: string | null;
  txError: string | null;

  // Actions
  castVote: (electionId: string, candidateIndex: number) => Promise<BlockchainVoteResult | null>;
  verifyVote: (electionId: string, voterAddress: string) => Promise<{ hasVoted: boolean; voteHash: string }>;
  switchNetwork: () => Promise<void>;
  retry: () => Promise<void>;
  resetState: () => void;
  refreshWalletState: () => Promise<void>;

  // Explorer URL helpers
  getExplorerTxUrl: (txHash: string) => string;
  getExplorerAddressUrl: (address: string) => string;
  getExplorerBlockUrl: (blockNumber: number) => string;
}

export function useBlockchain(): UseBlockchainReturn {
  const [walletState, setWalletState] = useState<WalletState | 'checking'>('checking');
  const [isCorrectNetwork, setIsCorrectNetwork] = useState(false);
  const [txState, setTxState] = useState<TxState>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  // Store last vote args for retry
  const lastVoteArgs = useRef<{ electionId: string; candidateIndex: number } | null>(null);

  // ──────────────────────────────────────────────
  // Detect wallet state on mount and on chain/account changes
  // ──────────────────────────────────────────────
  const refreshWalletState = useCallback(async () => {
    try {
      const state = await detectWalletState();
      setWalletState(state);
      setIsCorrectNetwork(state === 'connected');
    } catch {
      setWalletState('not_installed');
      setIsCorrectNetwork(false);
    }
  }, []);

  useEffect(() => {
    refreshWalletState();

    const ethereum = (window as any).ethereum;
    if (ethereum) {
      const handleChange = () => { refreshWalletState(); };
      ethereum.on('chainChanged', handleChange);
      ethereum.on('accountsChanged', handleChange);

      return () => {
        ethereum.removeListener('chainChanged', handleChange);
        ethereum.removeListener('accountsChanged', handleChange);
      };
    }
  }, [refreshWalletState]);

  // ──────────────────────────────────────────────
  // Cast Vote
  // ──────────────────────────────────────────────
  const castVote = useCallback(async (
    electionId: string,
    candidateIndex: number
  ): Promise<BlockchainVoteResult | null> => {
    lastVoteArgs.current = { electionId, candidateIndex };
    setTxState('pending');
    setTxHash(null);
    setTxError(null);

    try {
      // Validate network first
      const networkOk = await validateNetwork();
      if (!networkOk) {
        throw new Error('Please switch to Sepolia testnet before voting.');
      }

      setTxState('confirming');
      const result = await castVoteOnChain(electionId, candidateIndex, '');

      setTxHash(result.transactionHash);
      setTxState('confirmed');
      return result;
    } catch (err: any) {
      setTxState('failed');

      // Parse user-friendly error messages
      if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
        setTxError('Transaction was rejected in MetaMask. Please try again.');
      } else if (err.message?.includes('AlreadyVoted')) {
        setTxError('You have already voted in this election. Double voting is not allowed.');
      } else if (err.message?.includes('VoterNotAuthorized')) {
        setTxError('Your wallet is not authorized to vote in this election.');
      } else if (err.message?.includes('ElectionNotStarted')) {
        setTxError('This election has not started yet.');
      } else if (err.message?.includes('ElectionEnded')) {
        setTxError('This election has already ended.');
      } else if (err.message?.includes('ElectionAlreadyClosed')) {
        setTxError('This election has been closed by the administrator.');
      } else if (err.message?.includes('insufficient funds')) {
        setTxError('Insufficient ETH for gas fees. Get free Sepolia ETH from a faucet.');
      } else {
        setTxError(err.message || 'Transaction failed. Please try again.');
      }

      return null;
    }
  }, []);

  // ──────────────────────────────────────────────
  // Verify Vote
  // ──────────────────────────────────────────────
  const verifyVote = useCallback(async (
    electionId: string,
    voterAddress: string
  ): Promise<{ hasVoted: boolean; voteHash: string }> => {
    return verifyVoteOnChain(electionId, voterAddress);
  }, []);

  // ──────────────────────────────────────────────
  // Switch Network
  // ──────────────────────────────────────────────
  const switchNetwork = useCallback(async () => {
    try {
      await switchToSepolia();
      await refreshWalletState();
    } catch (err: any) {
      if (err.code === 4001) {
        setTxError('Network switch was rejected. Please switch manually in MetaMask.');
      } else {
        setTxError(err.message || 'Failed to switch network.');
      }
    }
  }, [refreshWalletState]);

  // ──────────────────────────────────────────────
  // Retry last failed transaction
  // ──────────────────────────────────────────────
  const retry = useCallback(async () => {
    if (lastVoteArgs.current) {
      await castVote(lastVoteArgs.current.electionId, lastVoteArgs.current.candidateIndex);
    }
  }, [castVote]);

  // ──────────────────────────────────────────────
  // Reset
  // ──────────────────────────────────────────────
  const resetState = useCallback(() => {
    setTxState('idle');
    setTxHash(null);
    setTxError(null);
    lastVoteArgs.current = null;
  }, []);

  return {
    walletState,
    isCorrectNetwork,
    txState,
    txHash,
    txError,
    castVote,
    verifyVote,
    switchNetwork,
    retry,
    resetState,
    refreshWalletState,
    getExplorerTxUrl,
    getExplorerAddressUrl,
    getExplorerBlockUrl,
  };
}
