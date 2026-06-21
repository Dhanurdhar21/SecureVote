import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Mail, ArrowRight, Loader2, Wallet, Check, ArrowLeft, Info, Vote, Lock, ShieldCheck, Key, AlertTriangle, CheckCircle2, X, Download, RefreshCw, HelpCircle, Wifi } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { clsx } from 'clsx';
import { ethers } from 'ethers';
import { syncElectionStatuses } from '../../lib/electionSync';
import { validateNetwork, switchToSepolia } from '../../lib/blockchain/contract';

const VoterLogin = () => {
  const [stage, setStage] = useState<'election' | 'email' | 'otp' | 'wallet'>('election');
  const [hasEthereum, setHasEthereum] = useState(!!(window as any).ethereum);
  const [showWhyModal, setShowWhyModal] = useState(false);
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [walletAddress, setWalletAddress] = useState('');
  const [isWalletConnecting, setIsWalletConnecting] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [isNetworkCorrect, setIsNetworkCorrect] = useState(true);
  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false);

  const [election, setElection] = useState<any>(null);
  const [customElectionId, setCustomElectionId] = useState('');

  const navigate = useNavigate();
  const { signInWithOtp, verifyOtp } = useAuth();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const eid = searchParams.get('election');
    if (eid) {
      setCustomElectionId(eid);
      handleElectionSubmit(eid);
    }
  }, [searchParams]);

  const handleElectionSubmit = async (codeOverride?: string) => {
    const codeToUse = codeOverride || customElectionId;
    if (!codeToUse.trim()) {
      setError('Please enter an Election ID');
      return;
    }

    setLoading(true);
    setError('');

    const trimmedCode = codeToUse.trim();

    try {
      await syncElectionStatuses();

      const { data, error: fetchErr } = await supabase
        .from('elections')
        .select('*')
        .eq('id', trimmedCode)
        .maybeSingle();

      if (fetchErr) throw fetchErr;
      if (!data) {
        setError('Election not found. Please check the ID.');
        setLoading(false);
        return;
      }

      // Validate election is active and within date range
      const now = new Date();
      const start = new Date(data.start_date);
      const end = new Date(data.end_date);

      if (now < start) {
        setError(
          `This election has not started yet. It begins on ${start.toLocaleString()}`
        );
        return;
      }

      if (now > end) {
        setError('This election has already ended.');
        return;
      }

      // Console logging for debugging timezone discrepancies
      console.log('--- Election Date Validation ---');
      console.log('Status:', data.status);
      console.log('Raw Start Date (from DB):', data.start_date);
      console.log('Raw End Date (from DB):', data.end_date);
      console.log('Parsed Start Date (Local):', start.toString());
      console.log('Parsed End Date (Local):', end.toString());
      console.log('Current Time (Local):', now.toString());
      console.log('Current Time UTC:', now.toISOString());

      // Use getTime() to compare exact UTC epoch milliseconds, avoiding timezone offset issues
      const nowMs = now.getTime();
      const startMs = start.getTime();
      const endMs = end.getTime();

      console.log('Now (ms):', nowMs);
      console.log('Start (ms):', startMs);
      console.log('Now < Start?', nowMs < startMs);



      if (nowMs < startMs) {
        setError(`This election has not started yet. It begins on ${start.toLocaleString()}.`);
        setLoading(false);
        return;
      }

      if (nowMs > endMs) {
        setError(`This election has ended (closed on ${end.toLocaleString()}).`);
        setLoading(false);
        return;
      }

      setElection(data);
      setStage('email');
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email');
      return;
    }
    setLoading(true);
    setError('');
    const trimmedEmail = email.trim().toLowerCase();

    try {
      const { data: eligibleVoter, error: queryErr } = await supabase
        .from('eligible_voters')
        .select('*')
        .eq('election_id', election.id)
        .eq('email', trimmedEmail)
        .maybeSingle();

      if (queryErr) {
        console.error('Supabase eligible_voters query error:', queryErr);
        throw queryErr;
      }

      if (!eligibleVoter) {
        // Log high-risk fraud alert for unregistered attempt
        await supabase.from('fraud_alerts').insert([{
          election_id: election.id,
          reason: `Unregistered email attempt: ${trimmedEmail}`,
          risk_score: 90,
          alert_level: 'high',
          metadata: { email: trimmedEmail, action: 'login_attempt', time: new Date().toISOString() }
        }]);

        setError('Access denied. Email not on participant list.');
        setLoading(false);
        return;
      }

      if (eligibleVoter.has_voted) {
        // Log medium-risk fraud alert for multiple login attempt
        await supabase.from('fraud_alerts').insert([{
          election_id: election.id,
          reason: `Multiple login attempt for already voted email: ${trimmedEmail}`,
          risk_score: 50,
          alert_level: 'medium',
          metadata: { email: trimmedEmail, action: 'login_attempt_after_vote', time: new Date().toISOString() }
        }]);

        setError('You have already cast your vote in this election.');
        setLoading(false);
        return;
      }

      await signInWithOtp(trimmedEmail);
      setStage('otp');
    } catch (err: any) {
      if (err.message?.includes('rate') || err.message?.includes('limit')) {
        setError('Too many OTP requests. Please wait a minute before trying again.');
      } else {
        setError(err.message || 'Failed to send OTP.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6) {
      setError('Please enter a valid 6-digit OTP');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const { error: otpError } = await verifyOtp(email.trim().toLowerCase(), otp);
      if (otpError) {
        if (otpError.message?.includes('expired')) {
          throw new Error('OTP has expired. Please go back and request a new one.');
        }
        throw otpError;
      }
      setStage('wallet');
    } catch (err: any) {
      setError(err.message || 'Invalid OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const connectWallet = async () => {
    setError('');
    if (!(window as any).ethereum) {
      setError('MetaMask is required to participate in blockchain-secured voting. Please install the MetaMask browser extension.');
      return;
    }

    setIsWalletConnecting(true);
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      if (accounts.length > 0) {
        setWalletAddress(accounts[0]);
        // Check network after connecting
        const networkOk = await validateNetwork();
        setIsNetworkCorrect(networkOk);
      } else {
        setError('No accounts found. Please unlock MetaMask and try again.');
      }
    } catch (err: any) {
      if (err.code === 4001) {
        setError('MetaMask connection was rejected. Please approve the connection request.');
      } else {
        setError(err.message || 'Failed to connect wallet');
      }
    } finally {
      setIsWalletConnecting(false);
    }
  };

  const handleSwitchNetwork = async () => {
    setIsSwitchingNetwork(true);
    setError('');
    try {
      await switchToSepolia();
      const networkOk = await validateNetwork();
      setIsNetworkCorrect(networkOk);
      if (!networkOk) {
        setError('Network switch failed. Please switch manually in MetaMask.');
      }
    } catch (err: any) {
      if (err.code === 4001) {
        setError('Network switch was rejected. Please switch to Sepolia manually in MetaMask.');
      } else {
        setError(err.message || 'Failed to switch network.');
      }
    } finally {
      setIsSwitchingNetwork(false);
    }
  };

  const signMessage = async () => {
    setError('');
    setIsSigning(true);
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();

      const nonce = Math.random().toString(36).substring(2, 15);
      const message = `SecureVote Authentication\nElection: ${election.id}\nNonce: ${nonce}`;

      const signature = await signer.signMessage(message);

      const recoveredAddress = ethers.verifyMessage(message, signature);
      if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        throw new Error('Signature verification failed');
      }

      const { error: upsertError } = await supabase
        .from('voter_wallets')
        .upsert({
          voter_email: email.trim().toLowerCase(),
          election_id: election.id,
          wallet_address: walletAddress,
          verified: true
        }, { onConflict: 'election_id, voter_email' });

      if (upsertError) throw upsertError;

      navigate(`/vote/wizard?election=${election.id}`);

    } catch (err: any) {
      if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
        setError('Signature request was rejected. Please sign the message to proceed.');
      } else {
        setError(err.message || 'Failed to sign message');
      }
      setIsSigning(false);
    }
  };

  const renderSteps = () => {
    const isStepCompleted = (stepIndex: number) => {
      const stages = ['election', 'email', 'otp', 'wallet'];
      return stages.indexOf(stage) > stepIndex;
    };

    const isStepActive = (stepIndex: number) => {
      const stages = ['election', 'email', 'otp', 'wallet'];
      return stages.indexOf(stage) === stepIndex;
    };

    return (
      <div className="flex justify-between items-center mb-8 relative">
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/10 -translate-y-1/2 z-0" />

        {[
          { icon: <Vote size={14} />, label: 'Election' },
          { icon: <Mail size={14} />, label: 'Email' },
          { icon: <Key size={14} />, label: 'OTP' },
          { icon: <Wallet size={14} />, label: 'Wallet' }
        ].map((s, idx) => (
          <div key={idx} className="relative z-10 flex flex-col items-center">
            <div className={clsx(
              "w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300",
              isStepCompleted(idx) ? "bg-green-500 border-green-500 text-black shadow-[0_0_15px_rgba(34,197,94,0.4)]" :
                isStepActive(idx) ? "bg-primary border-primary text-black shadow-[0_0_15px_rgba(0,112,243,0.4)] scale-110" :
                  "bg-black border-white/20 text-muted-foreground"
            )}>
              {isStepCompleted(idx) ? <Check size={14} className="font-bold" /> : s.icon}
            </div>
            <span className={clsx(
              "absolute top-10 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-colors duration-300 hidden sm:block",
              isStepActive(idx) ? "text-primary" :
                isStepCompleted(idx) ? "text-green-500" : "text-muted-foreground"
            )}>
              {s.label}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-black flex flex-col justify-center relative overflow-hidden text-white font-sans">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-black to-black" />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.02]" />

      <div className="w-full max-w-md mx-auto z-10 px-6 sm:px-0 mt-[-50px]">

        <div className="text-center mb-10">
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-16 h-16 bg-gradient-to-br from-primary to-blue-600 rounded-2xl mx-auto flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(0,112,243,0.3)] border border-white/10"
          >
            <ShieldCheck size={32} className="text-white" />
          </motion.div>
          <h1 className="text-3xl font-extrabold tracking-tight mb-2 text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60">SecureVote Access</h1>
          <p className="text-muted-foreground text-sm font-medium">Verify your identity to participate securely.</p>
        </div>

        <div className="bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-[32px] p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-50" />

          {renderSteps()}

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold flex items-center gap-2 mb-6"
            >
              <AlertTriangle size={14} /><span>{error}</span>
            </motion.div>
          )}

          <AnimatePresence mode="wait">
            {stage === 'election' && (
              <motion.form key="election" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} onSubmit={(e) => { e.preventDefault(); handleElectionSubmit(); }}>
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1 mb-2 block">Election ID</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Vote size={18} className="text-muted-foreground" />
                      </div>
                      <input type="text" value={customElectionId} onChange={(e) => setCustomElectionId(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl py-4 pl-12 pr-4 text-sm focus:outline-none focus:border-primary transition-colors text-white font-mono placeholder:font-sans placeholder:text-muted-foreground/50" placeholder="e.g. fd23-..." />
                    </div>
                  </div>
                  <button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(0,112,243,0.3)] disabled:opacity-50 disabled:cursor-not-allowed group">
                    {loading ? <Loader2 className="animate-spin" size={20} /> : <>Continue <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" /></>}
                  </button>
                </div>
              </motion.form>
            )}

            {stage === 'email' && (
              <motion.form key="email" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} onSubmit={handleEmailSubmit}>
                <div className="space-y-4">
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-start gap-3 mb-2">
                    <Info size={16} className="text-primary mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-white mb-0.5">{election?.name}</p>
                      <p className="text-[10px] text-muted-foreground">Enter your registered email to receive an OTP.</p>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1 mb-2 block">Institutional Email</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Mail size={18} className="text-muted-foreground" />
                      </div>
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl py-4 pl-12 pr-4 text-sm focus:outline-none focus:border-primary transition-colors text-white placeholder:text-muted-foreground/50" placeholder="student@university.edu" />
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button type="button" onClick={() => setStage('election')} className="px-4 py-4 rounded-xl border border-white/10 text-muted-foreground hover:bg-white/5 transition-colors">
                      <ArrowLeft size={18} />
                    </button>
                    <button type="submit" disabled={loading} className="flex-1 bg-primary hover:bg-primary/90 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(0,112,243,0.3)] disabled:opacity-50 disabled:cursor-not-allowed group">
                      {loading ? <Loader2 className="animate-spin" size={20} /> : <>Send OTP <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" /></>}
                    </button>
                  </div>
                </div>
              </motion.form>
            )}

            {stage === 'otp' && (
              <motion.form key="otp" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} onSubmit={handleOtpSubmit}>
                <div className="space-y-4">
                  <div className="text-center mb-6">
                    <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Lock size={20} className="text-primary" />
                    </div>
                    <p className="text-xs text-muted-foreground">OTP sent to <span className="text-white font-bold">{email}</span></p>
                  </div>

                  <div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Key size={18} className="text-muted-foreground" />
                      </div>
                      <input type="text" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} className="w-full bg-black/50 border border-white/10 rounded-xl py-4 pl-12 pr-4 text-center text-2xl tracking-[0.5em] focus:outline-none focus:border-primary transition-colors text-white font-mono placeholder:text-muted-foreground/30" placeholder="------" />
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button type="button" onClick={() => setStage('email')} className="px-4 py-4 rounded-xl border border-white/10 text-muted-foreground hover:bg-white/5 transition-colors">
                      <ArrowLeft size={18} />
                    </button>
                    <button type="submit" disabled={loading || otp.length !== 6} className="flex-1 bg-primary hover:bg-primary/90 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(0,112,243,0.3)] disabled:opacity-50 disabled:cursor-not-allowed group">
                      {loading ? <Loader2 className="animate-spin" size={20} /> : <>Verify OTP <Check size={18} /></>}
                    </button>
                  </div>
                </div>
              </motion.form>
            )}

            {stage === 'wallet' && (
              <motion.div key="wallet" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6 text-center">

                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 flex items-center justify-center gap-2 text-green-400 text-xs font-bold mb-4">
                  <CheckCircle2 size={16} /> Email & OTP Verified Successfully
                </div>

                {!hasEthereum ? (
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-left space-y-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20">
                        <Wallet className="text-white" size={20} />
                      </div>
                      <h3 className="text-lg font-bold text-white">Blockchain Verification Required</h3>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      SecureVote uses blockchain wallet signatures to protect election integrity and prevent duplicate voting.
                    </p>

                    <div className="space-y-2 bg-black/30 p-4 rounded-xl border border-white/5">
                      <div className="flex items-center gap-2 text-[10px] text-white">
                        <CheckCircle2 size={12} className="text-green-500" /> Votes cannot be tampered with
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-white">
                        <CheckCircle2 size={12} className="text-green-500" /> One voter can vote only once
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-white">
                        <CheckCircle2 size={12} className="text-green-500" /> Votes can be independently verified
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-white">
                        <CheckCircle2 size={12} className="text-green-500" /> No cryptocurrency payment is required
                      </div>
                    </div>

                    <div className="pt-2">
                      <button
                        onClick={() => window.open('https://metamask.io/download/', '_blank', 'noopener,noreferrer')}
                        className="w-full bg-[#F6851B] hover:bg-[#E2761B] text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(246,133,27,0.3)] mb-3"
                      >
                        <Download size={16} /> Install MetaMask
                      </button>

                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setHasEthereum(!!(window as any).ethereum);
                            if (!(window as any).ethereum) {
                              setError("MetaMask was not detected. If you just installed it, you may need to refresh the page.");
                            } else {
                              setError("");
                            }
                          }}
                          className="flex-1 bg-white/5 hover:bg-white/10 text-white font-bold py-3 rounded-xl border border-white/10 transition-all flex items-center justify-center gap-2 text-xs"
                        >
                          <RefreshCw size={14} /> Check Again
                        </button>
                        <button
                          onClick={() => setShowWhyModal(true)}
                          className="flex-1 bg-white/5 hover:bg-white/10 text-white font-bold py-3 rounded-xl border border-white/10 transition-all flex items-center justify-center gap-2 text-xs"
                        >
                          <HelpCircle size={14} /> Why is this required?
                        </button>
                      </div>
                    </div>

                    <p className="text-[10px] text-muted-foreground text-center mt-2">
                      {isMobile
                        ? "Install the MetaMask mobile app and open the voting link from the MetaMask browser."
                        : "Install the MetaMask browser extension for Chrome, Edge, Firefox, or Brave."}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="w-20 h-20 bg-gradient-to-br from-orange-400 to-orange-600 rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-orange-500/20 mb-2">
                      <img src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" alt="MetaMask" className="w-12 h-12" />
                    </div>

                    <div>
                      <h3 className="text-lg font-bold text-white mb-2">Connect Web3 Wallet</h3>
                      <p className="text-xs text-muted-foreground px-4">MetaMask is required to secure your vote cryptographically on the blockchain.</p>
                    </div>

                    {!walletAddress ? (
                      <button onClick={connectWallet} disabled={isWalletConnecting} className="w-full bg-[#F6851B] hover:bg-[#E2761B] text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-3 shadow-[0_0_20px_rgba(246,133,27,0.3)] disabled:opacity-50">
                        {isWalletConnecting ? <Loader2 className="animate-spin" size={20} /> : <><Wallet size={20} /> Connect MetaMask</>}
                      </button>
                    ) : (
                      <div className="space-y-4">
                        <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between">
                          <div className="flex items-center gap-3 text-left">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-500" />
                            <div>
                              <p className="text-[10px] font-bold text-muted-foreground uppercase">Connected Wallet</p>
                              <p className="text-xs font-mono text-white">{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</p>
                            </div>
                          </div>
                          <CheckCircle2 size={20} className="text-green-500" />
                        </div>

                        {/* Network Validation */}
                        {!isNetworkCorrect && (
                          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 space-y-3">
                            <div className="flex items-center gap-2 text-red-400 text-xs font-bold">
                              <Wifi size={14} />
                              <span>Wrong network detected. Please switch to Sepolia testnet.</span>
                            </div>
                            <button
                              onClick={handleSwitchNetwork}
                              disabled={isSwitchingNetwork}
                              className="w-full bg-red-500/20 hover:bg-red-500/30 text-red-400 font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-xs border border-red-500/20 disabled:opacity-50"
                            >
                              {isSwitchingNetwork ? <Loader2 className="animate-spin" size={14} /> : <><Wifi size={14} /> Switch to Sepolia</>}
                            </button>
                          </div>
                        )}

                        <button onClick={signMessage} disabled={isSigning || !isNetworkCorrect} className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(0,112,243,0.3)] disabled:opacity-50 disabled:cursor-not-allowed group">
                          {isSigning ? <Loader2 className="animate-spin" size={20} /> : <>Sign Authentication Message <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" /></>}
                        </button>
                        <p className="text-[10px] text-muted-foreground italic">Signing is free and does not cost any gas.</p>
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="text-center mt-8">
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-2">
            <Lock size={12} /> End-to-end encrypted protocol
          </p>
        </div>
      </div>

      {/* Why MetaMask Modal */}
      <AnimatePresence>
        {showWhyModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-white/10 rounded-[24px] p-6 max-w-sm w-full shadow-2xl relative"
            >
              <button
                onClick={() => setShowWhyModal(false)}
                className="absolute top-4 right-4 text-muted-foreground hover:text-white transition-colors"
              >
                <X size={20} />
              </button>

              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center">
                  <ShieldCheck className="text-primary" size={20} />
                </div>
                <h3 className="text-lg font-bold text-white">Why MetaMask?</h3>
              </div>

              <p className="text-sm text-muted-foreground mb-6">
                SecureVote uses MetaMask only as a secure digital identity layer.
              </p>

              <div className="space-y-6">
                <div>
                  <h4 className="text-xs font-bold text-red-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <X size={14} /> We DO NOT:
                  </h4>
                  <ul className="space-y-2">
                    <li className="text-xs text-white flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Access your funds</li>
                    <li className="text-xs text-white flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Request cryptocurrency</li>
                    <li className="text-xs text-white flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Perform paid transactions</li>
                  </ul>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-green-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Check size={14} /> We ONLY:
                  </h4>
                  <ul className="space-y-2">
                    <li className="text-xs text-white flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Verify wallet ownership</li>
                    <li className="text-xs text-white flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Secure the voting process</li>
                    <li className="text-xs text-white flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Prevent duplicate voting</li>
                    <li className="text-xs text-white flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Create cryptographic proof of participation</li>
                  </ul>
                </div>
              </div>

              <button
                onClick={() => setShowWhyModal(false)}
                className="w-full mt-8 bg-white/5 hover:bg-white/10 text-white font-bold py-3 rounded-xl border border-white/10 transition-all text-sm"
              >
                I Understand
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default VoterLogin;
