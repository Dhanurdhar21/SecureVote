import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Share2, Download, Home, ExternalLink, Copy, Check, Shield, Hash } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getExplorerTxUrl, getExplorerBlockUrl } from '../../lib/blockchain/contract';
import { verifyVote } from '../../lib/blockchain/blockchainService';

const ThankYou = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    electionName,
    timestamp,
    refNumber,
    // Blockchain receipt data
    transactionHash,
    blockNumber,
    voteHash,
    walletAddress,
    candidateName,
  } = location.state || {
    electionName: 'Election',
    timestamp: new Date().toLocaleString(),
    refNumber: "SV-" + Math.random().toString(36).substr(2, 9).toUpperCase(),
    transactionHash: null,
    blockNumber: null,
    voteHash: null,
    walletAddress: null,
    candidateName: null,
  };

  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<null | { hasVoted: boolean; voteHash: string }>(null);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleVerifyVote = async () => {
    if (!transactionHash) return;
    setVerifying(true);
    try {
      const isVerified = await verifyVote(transactionHash);
      setVerifyResult(isVerified ? { hasVoted: true, voteHash: voteHash || '' } : null);
    } catch (err) {
      console.error('Verification failed:', err);
    } finally {
      setVerifying(false);
    }
  };

  const handleDownload = () => {
    window.print();
  };

  const handleShare = async () => {
    const shareText = transactionHash
      ? `I just securely cast my vote for ${electionName} on the blockchain!\nReceipt No: ${refNumber}\nTx: ${getExplorerTxUrl(transactionHash)}`
      : `I just securely cast my vote for ${electionName}!\nReceipt No: ${refNumber}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Vote Receipt - SecureVote AI',
          text: shareText,
          url: window.location.origin
        });
      } catch (err) {
        console.error('Error sharing:', err);
      }
    } else {
      navigator.clipboard.writeText(shareText);
      alert('Receipt copied to clipboard! You can now paste and share it.');
    }
  };

  const truncateHash = (hash: string) => {
    if (!hash) return '';
    return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-6 print:bg-white print:text-black">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="max-w-md w-full text-center"
      >
        <div className="w-20 h-20 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mx-auto mb-8">
          <CheckCircle2 size={48} />
        </div>
        <h1 className="text-4xl font-bold mb-4 tracking-tight print:text-black">Vote Recorded Successfully</h1>
        <p className="text-muted-foreground mb-8 print:text-gray-600">
          Thank you for participating in the {electionName}. Your voice has been heard.
        </p>

        {/* Standard Receipt */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-6 mb-4 text-left space-y-4 print:border-black/20 print:bg-transparent print:text-black">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground print:text-gray-600">Election Name</span>
            <span className="font-bold print:text-black">{electionName}</span>
          </div>
          {candidateName && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground print:text-gray-600">Candidate</span>
              <span className="font-bold print:text-black">{candidateName}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground print:text-gray-600">Timestamp</span>
            <span className="font-bold print:text-black">{timestamp}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground print:text-gray-600">Reference No.</span>
            <span className="font-mono text-primary print:text-black">{refNumber}</span>
          </div>
        </div>

        {/* Blockchain Receipt */}
        {transactionHash && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-primary/5 border border-primary/20 rounded-3xl p-6 mb-4 text-left space-y-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <Shield size={16} className="text-primary" />
              <span className="text-xs font-bold text-primary uppercase tracking-widest">Blockchain Proof</span>
            </div>

            {/* Transaction Hash */}
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Transaction Hash</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-white flex-1 truncate">{truncateHash(transactionHash)}</span>
                <button
                  onClick={() => copyToClipboard(transactionHash, 'txHash')}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-all"
                  title="Copy full hash"
                >
                  {copiedField === 'txHash' ? <Check size={12} className="text-green-500" /> : <Copy size={12} className="text-muted-foreground" />}
                </button>
              </div>
            </div>

            {/* Block Number */}
            {blockNumber && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground text-xs">Block Number</span>
                <span className="font-mono text-xs text-white">#{blockNumber}</span>
              </div>
            )}

            {/* Vote Hash */}
            {voteHash && (
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Vote Hash</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-white/70 flex-1 truncate">{truncateHash(voteHash)}</span>
                  <button
                    onClick={() => copyToClipboard(voteHash, 'voteHash')}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-all"
                    title="Copy vote hash"
                  >
                    {copiedField === 'voteHash' ? <Check size={12} className="text-green-500" /> : <Copy size={12} className="text-muted-foreground" />}
                  </button>
                </div>
              </div>
            )}

            {/* Wallet */}
            {walletAddress && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground text-xs">Wallet</span>
                <span className="font-mono text-xs text-white/70">{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</span>
              </div>
            )}

            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground text-xs">Network</span>
              <span className="text-xs font-bold text-primary">Sepolia Testnet</span>
            </div>
          </motion.div>
        )}

        {/* Blockchain Action Buttons */}
        {transactionHash && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="grid grid-cols-2 gap-3 mb-4 print:hidden"
          >
            <button
              onClick={() => window.open(getExplorerTxUrl(transactionHash), '_blank', 'noopener,noreferrer')}
              className="flex items-center justify-center gap-2 bg-primary/10 border border-primary/20 py-3 rounded-xl text-xs font-bold text-primary hover:bg-primary/20 transition-all"
            >
              <ExternalLink size={14} /> View on Etherscan
            </button>
            <button
              onClick={handleVerifyVote}
              disabled={verifying}
              className="flex items-center justify-center gap-2 bg-green-500/10 border border-green-500/20 py-3 rounded-xl text-xs font-bold text-green-400 hover:bg-green-500/20 transition-all disabled:opacity-50"
            >
              {verifying ? (
                <span className="animate-spin">⏳</span>
              ) : verifyResult?.hasVoted ? (
                <><CheckCircle2 size={14} /> Verified ✓</>
              ) : (
                <><Shield size={14} /> Verify Vote</>
              )}
            </button>
          </motion.div>
        )}

        {/* Verification Result */}
        {verifyResult && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-bold mb-4 flex items-center justify-center gap-2"
          >
            <CheckCircle2 size={14} />
            Vote verified on blockchain. Your vote is immutably recorded.
          </motion.div>
        )}

        {/* Standard Action Buttons */}
        <div className="grid grid-cols-2 gap-4 mb-8 print:hidden">
          <button onClick={handleDownload} className="flex items-center justify-center gap-2 bg-white/5 py-3 rounded-xl text-sm font-bold hover:bg-white/10 transition-all">
            <Download size={16} /> Receipt
          </button>
          <button onClick={handleShare} className="flex items-center justify-center gap-2 bg-white/5 py-3 rounded-xl text-sm font-bold hover:bg-white/10 transition-all">
            <Share2 size={16} /> Share
          </button>
        </div>

        <button 
          onClick={() => navigate('/')}
          className="flex items-center justify-center gap-2 text-muted-foreground hover:text-white transition-colors mx-auto print:hidden"
        >
          <Home size={18} /> Back to Home
        </button>
      </motion.div>
    </div>
  );
};

export default ThankYou;
