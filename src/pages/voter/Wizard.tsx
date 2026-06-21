import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, UserCheck, CheckCircle2, ArrowRight, Loader2, AlertCircle, ExternalLink, RefreshCw } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { clsx } from 'clsx';
import { syncElectionStatuses } from '../../lib/electionSync';
import { useBlockchain } from '../../hooks/useBlockchain';
import { castVoteOnChain, type BlockchainVoteResult } from '../../lib/blockchain/blockchainService';
import { validateNetwork, getConnectedAddress } from '../../lib/blockchain/contract';
import NetworkBanner from '../../components/NetworkBanner';

const steps = [
  { id: 'select', title: 'Candidate Selection', icon: <UserCheck /> },
  { id: 'confirm', title: 'Final Confirmation', icon: <CheckCircle2 /> }
];

const VoterWizard = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const electionId = searchParams.get('election');

  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<any>(null);
  const [election, setElection] = useState<any>(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // Blockchain state
  const { walletState, isCorrectNetwork, switchNetwork } = useBlockchain();
  const [blockchainStep, setBlockchainStep] = useState<'idle' | 'submitting' | 'confirming' | 'confirmed' | 'failed'>('idle');
  const [blockchainResult, setBlockchainResult] = useState<BlockchainVoteResult | null>(null);

  useEffect(() => {
    if (!electionId) {
      navigate('/voter/login');
      return;
    }
    fetchElectionData();
  }, [electionId]);

  const fetchElectionData = async () => {
    try {
      setLoading(true);
      await syncElectionStatuses();

      const { data: electionData, error: electionErr } = await supabase
        .from('elections')
        .select('*')
        .eq('id', electionId)
        .single();

      if (electionErr) throw electionErr;
      setElection(electionData);

      const { data: candidateData } = await supabase
        .from('candidates')
        .select('*')
        .eq('election_id', electionId!);
      setCandidates(candidateData || []);
    } catch (err: any) {
      setError('Unable to load election details.');
    } finally {
      setLoading(false);
    }
  };

  const submitVote = async () => {
    if (!selectedCandidate || !election || !user) return;

    setLoading(true);
    setError('');
    setBlockchainStep('idle');

    try {
      await syncElectionStatuses();

      // ── Step 1: Validate network ──
      const networkOk = await validateNetwork();
      if (!networkOk) {
        setError('Please switch to Sepolia testnet before voting.');
        setLoading(false);
        return;
      }

      // ── Step 2: Get wallet address ──
      let walletAddress: string;
      try {
        walletAddress = await getConnectedAddress();
      } catch {
        setError('Please connect your MetaMask wallet.');
        setLoading(false);
        return;
      }

      // ── Step 3: Find candidate index for smart contract ──
      const candidateIndex = candidates.findIndex(c => c.id === selectedCandidate.id);
      if (candidateIndex === -1) {
        setError('Selected candidate not found.');
        setLoading(false);
        return;
      }

      // ── Debug: Log all voting parameters ──
      console.log('[Vote] === Blockchain Vote Debug ===');
      console.log('[Vote] electionId:', election.id);
      console.log('[Vote] candidateIndex:', candidateIndex);
      console.log('[Vote] walletAddress:', walletAddress);
      console.log('[Vote] contractAddress:', import.meta.env.VITE_CONTRACT_ADDRESS);
      console.log('[Vote] candidateName:', selectedCandidate.name);
      console.log('[Vote] totalCandidates:', candidates.length);

      // ── Step 4: Submit vote to blockchain ──
      setBlockchainStep('submitting');

      let bcResult: BlockchainVoteResult | null = null;
      try {
        setBlockchainStep('confirming');
        bcResult = await castVoteOnChain(election.id, candidateIndex, walletAddress);
        setBlockchainResult(bcResult);
        setBlockchainStep('confirmed');
        console.log('[Vote] ✅ Vote confirmed on-chain. TX:', bcResult.transactionHash);
      } catch (bcErr: any) {
        setBlockchainStep('failed');
        console.error('[Vote] ❌ Blockchain vote failed:', bcErr.message);
        console.error('[Vote] Full error:', bcErr);

        // Parse blockchain errors into user-friendly messages
        const msg = bcErr.message || '';
        if (bcErr.code === 'ACTION_REJECTED' || bcErr.code === 4001) {
          setError('Transaction was rejected in MetaMask. Please try again.');
        } else if (msg.includes('AlreadyVoted')) {
          setError('You have already voted in this election on the blockchain.');
        } else if (msg.includes('VoterNotAuthorized')) {
          setError('Your wallet is not authorized for this election. Contact the administrator.');
        } else if (msg.includes('ElectionDoesNotExist')) {
          setError('This election does not exist on the blockchain. It may not have been deployed on-chain.');
        } else if (msg.includes('ElectionNotActive')) {
          setError('This election is not yet active on the blockchain. Contact the administrator.');
        } else if (msg.includes('ElectionNotStarted')) {
          setError('This election has not started yet on the blockchain.');
        } else if (msg.includes('ElectionEnded') || msg.includes('ElectionAlreadyClosed')) {
          setError('This election has ended on the blockchain.');
        } else if (msg.includes('InvalidCandidateIndex')) {
          setError('Invalid candidate selection. The candidate index does not match the blockchain.');
        } else if (msg.includes('InvalidCandidateCount')) {
          setError('Candidate count mismatch between the app and the blockchain.');
        } else if (msg.includes('insufficient funds')) {
          setError('Insufficient ETH for gas. Get free Sepolia ETH from a faucet.');
        } else {
          setError(msg || 'Blockchain transaction failed. Please try again.');
        }
        setLoading(false);
        return;
      }

      // ── Step 5: Record in Supabase (existing votes table — unchanged) ──
      const { error: voteError } = await supabase
        .from('votes')
        .insert({
          election_id: election.id,
          candidate_id: selectedCandidate.id,
          voter_id: user.id
        });

      if (voteError) throw voteError;

      // ── Step 6: Update eligible voter has_voted flag (existing — unchanged) ──
      await supabase
        .from('eligible_voters')
        .update({ has_voted: true })
        .eq('election_id', election.id)
        .eq('email', user.email);

      // ── Step 7: Record in vote_audit table (new blockchain audit) ──
      if (bcResult) {
        await supabase
          .from('vote_audit')
          .insert({
            election_id: election.id,
            candidate_id: selectedCandidate.id,
            wallet_address: walletAddress,
            vote_hash: bcResult.voteHash,
            transaction_hash: bcResult.transactionHash,
            block_number: bcResult.blockNumber,
            chain_id: parseInt(import.meta.env.VITE_CHAIN_ID || '11155111'),
            verification_status: 'verified',
          });
      }

      // ── Step 8: Navigate to ThankYou with blockchain receipt data ──
      navigate('/voter/thanks', {
        state: {
          electionName: election.name,
          timestamp: new Date().toLocaleString(),
          refNumber: "SV-" + Math.random().toString(36).substr(2, 9).toUpperCase(),
          // Blockchain receipt data
          transactionHash: bcResult?.transactionHash || null,
          blockNumber: bcResult?.blockNumber || null,
          voteHash: bcResult?.voteHash || null,
          walletAddress,
          candidateName: selectedCandidate.name,
        }
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !election) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (error && !election) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <p className="text-red-400">{error}</p>
          <button onClick={() => navigate('/voter/login')} className="px-6 py-3 bg-white/10 rounded-xl text-sm font-bold hover:bg-white/20 transition-all">
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
      <div className="absolute top-0 left-0 w-full h-1.5 bg-white/5">
        <motion.div
          className="h-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
        />
      </div>

      <div className="max-w-2xl w-full">
        {/* Network Banner */}
        <NetworkBanner className="mb-4" />

        {/* Election name header */}
        {election && (
          <div className="text-center mb-6">
            <p className="text-xs text-primary font-bold uppercase tracking-widest">{election.id}</p>
            <p className="text-sm text-muted-foreground">{election.name}</p>
          </div>
        )}

        <div className="flex justify-center gap-12 mb-16 px-4">
          {steps.map((step, idx) => (
            <div key={step.id} className={clsx("flex flex-col items-center gap-3", idx > currentStep ? "opacity-20" : "opacity-100")}>
              <div className={clsx("w-12 h-12 rounded-2xl flex items-center justify-center border-2 transition-all", idx === currentStep ? "border-primary bg-primary/10 text-primary scale-110" : idx < currentStep ? "border-green-500 bg-green-500/10 text-green-500" : "border-white/10 bg-white/5")}>
                {idx < currentStep ? <CheckCircle2 size={20} /> : step.icon}
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest hidden md:block">{step.title}</span>
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={currentStep} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white/5 border border-white/10 rounded-[40px] p-8 md:p-12 backdrop-blur-2xl shadow-2xl">
            {currentStep === 0 && (
              <div className="space-y-8">
                <h2 className="text-4xl font-bold text-center">Select Your Candidate</h2>
                {candidates.length === 0 ? (
                  <div className="text-center py-12">
                    <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground text-sm">No candidates found for this election.</p>
                  </div>
                ) : (
                  <div className="grid gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {candidates.map((candidate) => (
                      <button key={candidate.id} onClick={() => { setSelectedCandidate(candidate); setCurrentStep(1); }} className={clsx("w-full flex items-center gap-6 p-6 rounded-3xl border transition-all text-left group hover:scale-[1.01]", selectedCandidate?.id === candidate.id ? "bg-primary/10 border-primary" : "bg-white/5 border-white/10 hover:border-white/30")}>
                        <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center font-bold text-2xl group-hover:bg-primary/20 transition-all overflow-hidden border border-white/10">
                          {candidate.photo_url ? (
                            <img 
                              src={candidate.photo_url} 
                              alt={candidate.name} 
                              className="w-full h-full object-cover" 
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.parentElement!.innerText = candidate.name?.charAt(0) || 'C';
                              }}
                            />
                          ) : (
                            candidate.name.charAt(0)
                          )}
                        </div>
                        <div className="flex-1">
                          <h4 className="text-xl font-bold">{candidate.name}</h4>
                          <p className="text-sm text-muted-foreground">{candidate.position} • {candidate.department}</p>
                          {candidate.manifesto && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{candidate.manifesto}</p>}
                        </div>
                        <ArrowRight size={18} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {currentStep === 1 && (
              <div className="text-center space-y-8">
                <h2 className="text-4xl font-bold">Confirm Your Vote</h2>
                <div className="p-8 rounded-3xl bg-primary/5 border border-primary/20">
                  <p className="text-xs text-primary font-bold uppercase mb-4 tracking-widest">Selected Candidate</p>
                  <div className="w-20 h-20 rounded-2xl bg-primary/20 flex items-center justify-center font-bold text-3xl mx-auto mb-4 overflow-hidden border border-white/20 shadow-lg">
                    {selectedCandidate?.photo_url ? (
                      <img 
                        src={selectedCandidate.photo_url} 
                        alt={selectedCandidate.name} 
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.parentElement!.innerText = selectedCandidate.name?.charAt(0) || 'C';
                        }}
                      />
                    ) : (
                      selectedCandidate?.name?.charAt(0)
                    )}
                  </div>
                  <p className="text-3xl font-bold">{selectedCandidate?.name}</p>
                  <p className="text-muted-foreground mt-1">{selectedCandidate?.position} • {selectedCandidate?.department}</p>
                </div>

                {/* Blockchain Transaction Status Overlay */}
                {blockchainStep !== 'idle' && blockchainStep !== 'failed' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-2xl bg-primary/5 border border-primary/20 space-y-3"
                  >
                    <div className="flex items-center justify-center gap-3">
                      {blockchainStep === 'confirmed' ? (
                        <CheckCircle2 size={18} className="text-green-500" />
                      ) : (
                        <Loader2 size={18} className="text-primary animate-spin" />
                      )}
                      <span className="text-sm font-bold">
                        {blockchainStep === 'submitting' && '⛓️ Submitting vote to blockchain...'}
                        {blockchainStep === 'confirming' && '⏳ Waiting for block confirmation...'}
                        {blockchainStep === 'confirmed' && '✅ Vote confirmed on-chain!'}
                      </span>
                    </div>
                  </motion.div>
                )}

                {error && (
                  <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs">{error}</div>
                )}

                <div className="flex gap-4">
                  <button onClick={() => { setCurrentStep(0); setError(''); setBlockchainStep('idle'); }} className="flex-1 bg-white/5 py-5 rounded-2xl font-bold border border-white/10 hover:bg-white/10 transition-all">Back</button>
                  
                  {blockchainStep === 'failed' ? (
                    <button onClick={submitVote} className="flex-1 bg-orange-500 py-5 rounded-2xl font-bold shadow-xl shadow-orange-500/20 flex items-center justify-center gap-3 hover:opacity-90 transition-all">
                      <RefreshCw size={18} /> Retry
                    </button>
                  ) : (
                    <button onClick={submitVote} disabled={loading || blockchainStep === 'confirming' || blockchainStep === 'submitting'} className="flex-1 bg-primary py-5 rounded-2xl font-bold shadow-xl shadow-primary/20 flex items-center justify-center gap-3 hover:opacity-90 transition-all disabled:opacity-50">
                      {loading ? <Loader2 className="animate-spin" /> : 'Confirm & Submit'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default VoterWizard;
