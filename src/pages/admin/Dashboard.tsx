import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  PlusCircle,
  Users,
  ShieldAlert,
  LogOut,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Percent,
  Loader2,
  ChevronDown,
  Bell,
  Share2,
  Copy,
  X,
  Upload,
  Link2,
  ExternalLink,
  Link,
  Key,
  Lock,
  Trophy,
  Calendar
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip
} from 'recharts';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { clsx } from 'clsx';
import { CreateElectionWizard } from './CreateElectionWizard';
import { syncElectionStatuses } from '../../lib/electionSync';
import { createElectionOnChain } from '../../lib/blockchain/blockchainService';
import { validateNetwork } from '../../lib/blockchain/contract';
const AdminDashboard = () => {
  const { user, profile, signOut, linkNotification, dismissLinkNotification, signInWithOtp, verifyOtp } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedElection, setSelectedElection] = useState<any>(null);
  const [elections, setElections] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [shareModalElection, setShareModalElection] = useState<any>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showVotersModal, setShowVotersModal] = useState(false);
  const [votersList, setVotersList] = useState<any[]>([]);
  const [voterModalFilter, setVoterModalFilter] = useState<'all' | 'voted' | 'pending'>('all');
  const [uploadingCandidateId, setUploadingCandidateId] = useState<string | null>(null);
  const [chartData, setChartData] = useState<any[]>([
    { name: '08:00', v: 0 }, { name: '12:00', v: 0 }, { name: '16:00', v: 0 }, { name: '20:00', v: 0 }
  ]);

  // Election Details Modal & OTP State
  const [detailsModalElection, setDetailsModalElection] = useState<any>(null);
  const [detailsCandidates, setDetailsCandidates] = useState<any[]>([]);
  const [otpAction, setOtpAction] = useState<'end' | 'extend' | null>(null);
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [otpValue, setOtpValue] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);

  // Blockchain audit state
  const [auditRecords, setAuditRecords] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const EXPLORER_URL = import.meta.env.VITE_BLOCK_EXPLORER_URL || 'https://sepolia.etherscan.io';
  const [isDeploying, setIsDeploying] = useState(false);

  const [stats, setStats] = useState({
    totalRegistered: 0,
    votesCast: 0,
    remainingVoters: 0,
    turnoutPercentage: 0
  });

  useEffect(() => {
    if (user) {
      fetchDashboardData();
    }
  }, [user]);

  useEffect(() => {
    if (user && selectedElection) {
      fetchStatsAndCandidates(selectedElection);
      if (activeTab === 'blockchain') {
        fetchAuditRecords(selectedElection.id);
      }
    }
  }, [selectedElection, activeTab]);

  const handleViewDetails = async (election: any) => {
    setDetailsModalElection(election);
    setOtpAction(null);
    setShowOtpInput(false);
    setOtpValue('');
    setOtpError('');
    setNewEndDate('');

    try {
      const [
        { data: candidateData },
        { data: votesData }
      ] = await Promise.all([
        supabase.from('candidates').select('*').eq('election_id', election.id),
        supabase.from('votes').select('*').eq('election_id', election.id)
      ]);

      const candidatesWithCounts = (candidateData || []).map(candidate => {
        const actualVotes = votesData?.filter(v => v.candidate_id === candidate.id).length || 0;
        return {
          ...candidate,
          vote_count: Math.max(candidate.vote_count || 0, actualVotes)
        };
      }).sort((a, b) => b.vote_count - a.vote_count);

      setDetailsCandidates(candidatesWithCounts);
    } catch (err) {
      console.error(err);
    }
  };

  const handleInitiateOtpAction = async (action: 'end' | 'extend') => {
    if (action === 'extend' && !newEndDate) {
      setOtpError('Please select a new date and time.');
      return;
    }
    setOtpError('');
    setOtpLoading(true);
    try {
      await signInWithOtp(user!.email!);
      setOtpAction(action);
      setShowOtpInput(true);
    } catch (err: any) {
      setOtpError(err.message || 'Failed to send OTP.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleConfirmOtpAction = async () => {
    if (otpValue.length < 6) {
      setOtpError('Please enter a valid 6-digit OTP.');
      return;
    }
    setOtpError('');
    setOtpLoading(true);
    try {
      const { error: otpErr } = await verifyOtp(user!.email!, otpValue);
      if (otpErr) {
        if (otpErr.message?.includes('expired')) {
          throw new Error('OTP has expired. Please go back and request a new one.');
        }
        throw otpErr;
      }

      if (otpAction === 'end') {
        const { error: updErr } = await supabase
          .from('elections')
          .update({ end_date: new Date().toISOString(), status: 'completed' })
          .eq('id', detailsModalElection.id);
        if (updErr) throw updErr;
      } else if (otpAction === 'extend') {
        const { error: updErr } = await supabase
          .from('elections')
          .update({ end_date: new Date(newEndDate).toISOString() })
          .eq('id', detailsModalElection.id);
        if (updErr) throw updErr;
      }

      const { data: updatedElection } = await supabase
        .from('elections')
        .select('*')
        .eq('id', detailsModalElection.id)
        .single();
        
      if (updatedElection) {
        setDetailsModalElection(updatedElection);
      }
      
      setOtpAction(null);
      setShowOtpInput(false);
      setOtpValue('');
      await fetchDashboardData();
    } catch (err: any) {
      setOtpError(err.message || 'Invalid OTP. Action failed.');
    } finally {
      setOtpLoading(false);
    }
  };

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      await syncElectionStatuses();

      const { data: electionData, error: electionErr } = await supabase
        .from('elections')
        .select('*')
        .eq('created_by', user!.id)
        .order('created_at', { ascending: false });

      if (electionErr) throw electionErr;
      setElections(electionData || []);
      if (electionData && electionData.length > 0) setSelectedElection(electionData[0]);
      else setActiveTab('create-election');
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStatsAndCandidates = async (election: any) => {
    try {
      const [
        { data: voterData },
        { data: candidateData },
        { data: alertData },
        { data: votesData }
      ] = await Promise.all([
        supabase.from('eligible_voters').select('*').eq('election_id', election.id).order('name'),
        supabase.from('candidates').select('*').eq('election_id', election.id).order('vote_count', { ascending: false }),
        supabase.from('fraud_alerts').select('*, profiles(email)').eq('election_id', election.id).order('created_at', { ascending: false }).limit(5),
        supabase.from('votes').select('*').eq('election_id', election.id).order('voted_at', { ascending: true })
      ]);

      const registered = voterData?.length || 0;
      const cast = voterData?.filter(v => v.has_voted)?.length || 0;

      setStats({
        totalRegistered: registered,
        votesCast: cast,
        remainingVoters: Math.max(0, registered - cast),
        turnoutPercentage: registered > 0 ? Math.round((cast / registered) * 100) : 0
      });

      // Calculate real vote counts dynamically to ensure absolute accuracy
      const candidatesWithCounts = (candidateData || []).map(candidate => {
        const actualVotes = votesData?.filter(v => v.candidate_id === candidate.id).length || 0;
        return {
          ...candidate,
          vote_count: Math.max(candidate.vote_count || 0, actualVotes)
        };
      }).sort((a, b) => b.vote_count - a.vote_count);

      setCandidates(candidatesWithCounts);
      setAlerts(alertData || []);
      setVotersList(voterData || []);

      // Calculate chart data based on real votes
      if (votesData && votesData.length > 0) {
        // Fallback to voted_at if created_at is missing (depends on migration status)
        const votePoints = votesData.map((vote, index) => {
          const t = vote.created_at || vote.voted_at || new Date().toISOString();
          const date = new Date(t);
          return {
            name: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            v: index + 1
          };
        });

        let startPoint = { name: 'Start', v: 0 };
        if (election.start_date) {
          startPoint = { name: new Date(election.start_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), v: 0 };
        } else {
          const firstDate = new Date(votesData[0].created_at || votesData[0].voted_at);
          firstDate.setMinutes(firstDate.getMinutes() - 30);
          startPoint = { name: firstDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), v: 0 };
        }

        setChartData([startPoint, ...votePoints]);
      } else {
        setChartData([
          { name: '08:00', v: 0 }, { name: '12:00', v: 0 }, { name: '16:00', v: 0 }, { name: '20:00', v: 0 }
        ]);
      }

    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  const handleViewVoters = (filter: 'all' | 'voted' | 'pending' = 'all') => {
    if (!selectedElection) return;
    setVoterModalFilter(filter);
    setShowVotersModal(true);
  };

  const fetchAuditRecords = async (electionId: string) => {
    setLoadingAudit(true);
    try {
      const { data, error } = await supabase
        .from('vote_audit')
        .select('*')
        .eq('election_id', electionId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setAuditRecords(data || []);
    } catch (err) {
      console.error('Error fetching audit records:', err);
      setAuditRecords([]);
    } finally {
      setLoadingAudit(false);
    }
  };

  const handleWizardSuccess = () => {
    setActiveTab('overview');
    fetchDashboardData();
  };

  const handleDeployOnChain = async () => {
    if (!selectedElection) return;
    try {
      setIsDeploying(true);
      const networkOk = await validateNetwork();
      if (!networkOk) {
        alert('Please switch to Sepolia testnet in MetaMask to deploy on blockchain.');
        return;
      }
      const bcResult = await createElectionOnChain(
        selectedElection.id,
        selectedElection.name,
        new Date(selectedElection.start_date),
        new Date(selectedElection.end_date),
        candidates.length
      );
      const { error } = await supabase
        .from('elections')
        .update({
          is_on_chain: true,
          contract_election_id: bcResult.contractElectionId,
        })
        .eq('id', selectedElection.id);
      if (error) throw error;
      fetchDashboardData();
    } catch (err: any) {
      console.error('Error deploying on chain:', err);
      alert(err.message || 'Failed to deploy on chain');
    } finally {
      setIsDeploying(false);
    }
  };

  const handleSwitchAccount = async () => {
    const provider = user?.app_metadata?.provider;
    await supabase.auth.signOut();

    if (provider === 'github') {
      await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          queryParams: { prompt: 'login' },
          redirectTo: `${window.location.origin}/admin/dashboard`
        }
      });
    } else {
      window.location.href = '/admin/login';
    }
  };

  const handleCandidatePhotoUpdate = async (candidateId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedElection) return;

    try {
      setUploadingCandidateId(candidateId);
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('candidate-photos')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('candidate-photos').getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from('candidates')
        .update({ photo_url: data.publicUrl })
        .eq('id', candidateId);

      if (updateError) throw updateError;

      fetchStatsAndCandidates(selectedElection);
    } catch (err) {
      console.error('Error updating candidate photo:', err);
      alert('Failed to upload photo. Ensure you have run the storage policies SQL script.');
    } finally {
      setUploadingCandidateId(null);
    }
  };

  const userAvatar = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;

  if (loading && activeTab !== 'create-election') {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-black">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-black text-white overflow-hidden">
      {/* Account Linked Notification Banner */}
      <AnimatePresence>
        {linkNotification && (
          <motion.div
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 bg-green-500/10 border border-green-500/30 text-green-400 text-xs font-bold px-5 py-3 rounded-2xl shadow-2xl backdrop-blur-xl max-w-sm w-full"
          >
            <Link2 size={16} className="shrink-0" />
            <span className="flex-1">{linkNotification}</span>
            <button onClick={dismissLinkNotification} className="text-green-400/60 hover:text-green-400 transition-colors">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Sidebar */}
      <aside className="w-64 border-r border-white/10 p-6 flex flex-col bg-black/50 backdrop-blur-xl z-20">
        <div className="flex items-center gap-3 font-bold text-xl mb-12 px-2">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
            <ShieldAlert className="w-5 h-5 text-white" />
          </div>
          SecureVote <span className="text-xs text-primary font-mono bg-primary/10 px-1.5 py-0.5 rounded">Admin</span>
        </div>

        <nav className="flex-1 space-y-1">
          <SidebarItem icon={<LayoutDashboard size={20} />} label="Overview" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
          <SidebarItem icon={<PlusCircle size={20} />} label="Elections" active={activeTab === 'elections'} onClick={() => setActiveTab('elections')} />
          <SidebarItem icon={<Users size={20} />} label="Candidates" active={activeTab === 'candidates'} onClick={() => setActiveTab('candidates')} />
          <SidebarItem icon={<ShieldAlert size={20} />} label="Fraud Alerts" active={activeTab === 'fraud'} onClick={() => setActiveTab('fraud')} />
          <SidebarItem icon={<Link size={20} />} label="Blockchain" active={activeTab === 'blockchain'} onClick={() => { setActiveTab('blockchain'); if (selectedElection) fetchAuditRecords(selectedElection.id); }} />
        </nav>

        <div className="pt-6 border-t border-white/10 space-y-1">
          <SidebarItem icon={<PlusCircle size={20} />} label="Launch Wizard" active={activeTab === 'create-election'} onClick={() => setActiveTab('create-election')} />
          <SidebarItem icon={<LogOut size={20} />} label="Sign Out" className="text-red-400 hover:bg-red-500/10" onClick={signOut} />
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header with Profile */}
        <header className="h-20 border-b border-white/10 flex items-center justify-between px-8 bg-black/40 backdrop-blur-md z-10">
          <div className="flex items-center gap-4">
            {activeTab !== 'create-election' && elections.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Active Election:</span>
                <select
                  value={selectedElection?.id}
                  onChange={(e) => setSelectedElection(elections.find(el => el.id === e.target.value))}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-bold focus:outline-none focus:border-primary text-white cursor-pointer"
                >
                  {elections.map(el => <option key={el.id} value={el.id} className="bg-slate-950">{el.name}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center gap-6">
            <button className="p-2 text-muted-foreground hover:text-white transition-colors relative">
              <Bell size={20} />
              <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full border-2 border-black" />
            </button>

            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-3 p-1 pr-3 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
              >
                {userAvatar ? (
                  <img
                    src={userAvatar}
                    alt="Profile"
                    className="w-8 h-8 rounded-full object-cover border border-white/20 bg-black/50"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.parentElement!.prepend(
                        Object.assign(document.createElement('div'), {
                          className: 'w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm border border-white/20',
                          innerText: (profile?.full_name || user?.email || 'A').charAt(0).toUpperCase()
                        })
                      );
                    }}
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm border border-white/20">
                    {(profile?.full_name || user?.email || 'A').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="text-left hidden sm:block">
                  <p className="text-xs font-bold truncate max-w-[120px]">{profile?.full_name || user?.email?.split('@')[0]}</p>
                  <p className="text-[10px] text-muted-foreground truncate max-w-[120px]">{user?.email}</p>
                </div>
                <ChevronDown size={14} className={clsx("text-muted-foreground transition-transform", showProfileMenu && "rotate-180")} />
              </button>

              <AnimatePresence>
                {showProfileMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute right-0 mt-2 w-48 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl p-2 z-50"
                  >
                    <div className="px-3 py-2 border-b border-white/5 mb-1">
                      <p className="text-[10px] font-bold text-primary uppercase tracking-widest">Administrator</p>
                    </div>
                    <button
                      onClick={handleSwitchAccount}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-white hover:bg-white/5 rounded-lg transition-all"
                    >
                      <Users size={16} /> Switch Account
                    </button>
                    <button
                      onClick={signOut}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                    >
                      <LogOut size={16} /> Sign Out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 overflow-y-auto p-8 bg-gradient-to-br from-black to-slate-950">
          {activeTab === 'create-election' ? (
            <CreateElectionWizard onSuccess={handleWizardSuccess} onCancel={() => elections.length > 0 ? setActiveTab('overview') : signOut()} />
          ) : (
            <div className="max-w-7xl mx-auto">
              <div className="mb-8">
                <h1 className="text-4xl font-bold tracking-tight mb-1">
                  {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
                </h1>
                <p className="text-muted-foreground text-sm">
                  {selectedElection ? `Monitoring ${selectedElection.name} (${selectedElection.id})` : 'System oversight and security.'}
                </p>
              </div>

              <AnimatePresence mode="wait">
                {activeTab === 'overview' && selectedElection && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      <StatCard label="Registered Voters" value={stats.totalRegistered} icon={<Users />} clickable={true} onClick={() => handleViewVoters('all')} />
                      <StatCard label="Votes Cast" value={stats.votesCast} icon={<CheckCircle2 />} trend={`${stats.turnoutPercentage}%`} clickable={true} onClick={() => handleViewVoters('voted')} />
                      <StatCard label="Remaining" value={stats.remainingVoters} icon={<Clock />} clickable={true} onClick={() => handleViewVoters('pending')} />
                      <StatCard label="Turnout" value={`${stats.turnoutPercentage}%`} icon={<Percent />} variant="turnout" clickable={true} onClick={() => handleViewVoters('all')} />
                    </div>

                    <div className="grid lg:grid-cols-3 gap-6">
                      <div className="lg:col-span-2 p-8 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-sm h-[400px]">
                        <h3 className="text-lg font-bold mb-6">Voting Activity</h3>
                        <ResponsiveContainer width="100%" height="80%">
                          <AreaChart data={chartData}>
                            <defs>
                              <linearGradient id="colorV" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#0070f3" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#0070f3" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                            <XAxis dataKey="name" stroke="#666" fontSize={11} />
                            <YAxis stroke="#666" fontSize={11} />
                            <Tooltip contentStyle={{ backgroundColor: '#000', border: '1px solid #333', borderRadius: '12px' }} />
                            <Area type="monotone" dataKey="v" stroke="#0070f3" strokeWidth={3} fill="url(#colorV)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="p-8 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-sm">
                        <h3 className="text-lg font-bold mb-6">Security Alerts</h3>
                        <div className="space-y-4">
                          {alerts.length > 0 ? alerts.map((alert) => (
                            <div key={alert.id} className="flex items-start gap-4 p-4 rounded-2xl bg-white/5 border border-white/5">
                              <AlertTriangle className={clsx("w-5 h-5", alert.alert_level === 'high' ? "text-red-500" : "text-yellow-500")} />
                              <div>
                                <p className="text-xs font-bold">{alert.reason}</p>
                                <p className="text-[10px] text-muted-foreground">{alert.profiles?.email}</p>
                              </div>
                            </div>
                          )) : <p className="text-center py-12 text-xs text-muted-foreground italic">No alerts logged.</p>}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'elections' && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                    {elections.length === 0 ? (
                      <p className="text-center py-12 text-muted-foreground text-sm">No elections found. Create one using the Launch Wizard.</p>
                    ) : (
                      elections.map(el => (
                        <div key={el.id} className="p-6 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between cursor-pointer hover:bg-white/10 transition-colors" onClick={() => handleViewDetails(el)}>
                          <div>
                            <h4 className="text-sm font-bold">{el.name}</h4>
                            <p className="text-[10px] text-muted-foreground font-mono">{el.id}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">{el.description}</p>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className={clsx("text-[10px] font-bold px-3 py-1 rounded-full uppercase",
                              el.status === 'active' ? 'bg-green-500/10 text-green-400' :
                                el.status === 'upcoming' ? 'bg-blue-500/10 text-blue-400' :
                                  'bg-white/5 text-muted-foreground'
                            )}>{el.status}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); setShareModalElection(el); }}
                              className="p-2 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 text-muted-foreground hover:text-white transition-colors"
                              title="Share Election"
                            >
                              <Share2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </motion.div>
                )}

                {activeTab === 'candidates' && selectedElection && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                    {candidates.length === 0 ? (
                      <p className="text-center py-12 text-muted-foreground text-sm">No candidates found for this election.</p>
                    ) : (
                      candidates.map(c => (
                        <div key={c.id} className="p-6 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-6">
                          <div className="w-14 h-14 rounded-xl bg-white/10 overflow-hidden border border-white/10 flex items-center justify-center font-bold text-lg relative group cursor-pointer shrink-0">
                            {c.photo_url ? (
                              <img
                                src={c.photo_url}
                                alt={c.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  e.currentTarget.parentElement!.innerText = c.name?.charAt(0) || 'C';
                                }}
                              />
                            ) : c.name?.charAt(0)}

                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              {uploadingCandidateId === c.id ? (
                                <Loader2 size={16} className="text-white animate-spin" />
                              ) : (
                                <Upload size={16} className="text-white" />
                              )}
                            </div>
                            <input
                              type="file"
                              accept="image/*"
                              disabled={uploadingCandidateId === c.id}
                              onChange={(e) => handleCandidatePhotoUpdate(c.id, e)}
                              className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-wait"
                            />
                          </div>
                          <div className="flex-1">
                            <h4 className="text-sm font-bold">{c.name}</h4>
                            <p className="text-[10px] text-muted-foreground">{c.position} • {c.department}</p>
                            {c.manifesto && <p className="text-[10px] text-muted-foreground mt-1 line-clamp-1">{c.manifesto}</p>}
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-bold text-primary">{c.vote_count || 0}</p>
                            <p className="text-[10px] text-muted-foreground uppercase font-bold">Votes</p>
                          </div>
                        </div>
                      ))
                    )}
                  </motion.div>
                )}

                {activeTab === 'fraud' && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                    {alerts.length === 0 ? (
                      <p className="text-center py-12 text-muted-foreground text-sm">No fraud alerts detected.</p>
                    ) : (
                      alerts.map(alert => (
                        <div key={alert.id} className="p-6 rounded-2xl bg-white/5 border border-white/10 flex items-start gap-4">
                          <AlertTriangle className={clsx("w-6 h-6 shrink-0", alert.alert_level === 'high' ? 'text-red-500' : 'text-yellow-500')} />
                          <div className="flex-1">
                            <p className="text-sm font-bold">{alert.reason}</p>
                            <p className="text-[10px] text-muted-foreground">{alert.profiles?.email || 'Unknown user'}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">{new Date(alert.created_at).toLocaleString()}</p>
                          </div>
                          <span className={clsx("text-[10px] font-bold px-3 py-1 rounded-full uppercase",
                            alert.alert_level === 'high' ? 'bg-red-500/10 text-red-400' :
                              alert.alert_level === 'medium' ? 'bg-yellow-500/10 text-yellow-400' :
                                'bg-white/5 text-muted-foreground'
                          )}>{alert.alert_level}</span>
                        </div>
                      ))
                    )}
                  </motion.div>
                )}

                {activeTab === 'blockchain' && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                    {/* On-chain status */}
                    {selectedElection && (
                      <div className={clsx(
                        "flex items-center justify-between p-4 rounded-2xl border text-sm font-bold",
                        selectedElection.is_on_chain
                          ? "bg-green-500/10 border-green-500/20 text-green-400"
                          : "bg-yellow-500/10 border-yellow-500/20 text-yellow-400"
                      )}>
                        <div className="flex items-center gap-3">
                          {selectedElection.is_on_chain ? (
                            <><Link size={16} /> This election is deployed on-chain</>
                          ) : (
                            <><AlertTriangle size={16} /> This election is not yet deployed on-chain</>
                          )}
                        </div>
                        {!selectedElection.is_on_chain && (
                          <button 
                            onClick={handleDeployOnChain} 
                            disabled={isDeploying}
                            className="bg-primary text-white px-4 py-2 rounded-xl text-xs flex items-center gap-2 hover:bg-primary/90 transition-all disabled:opacity-50"
                          >
                            {isDeploying ? <Loader2 size={14} className="animate-spin" /> : <Link size={14} />}
                            Deploy Now
                          </button>
                        )}
                      </div>
                    )}

                    {/* Audit summary */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-primary/10 border border-primary/20 rounded-2xl p-5 text-center">
                        <p className="text-3xl font-bold text-primary">{auditRecords.length}</p>
                        <p className="text-[10px] font-bold text-primary/80 uppercase mt-1">On-Chain Votes</p>
                      </div>
                      <div className="bg-white/5 border border-white/10 rounded-2xl p-5 text-center">
                        <p className="text-3xl font-bold text-white">{auditRecords.length > 0 ? auditRecords[0].block_number : '—'}</p>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase mt-1">Latest Block</p>
                      </div>
                    </div>

                    {/* Audit table */}
                    {loadingAudit ? (
                      <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
                    ) : auditRecords.length === 0 ? (
                      <p className="text-center py-12 text-muted-foreground text-sm">No blockchain transactions recorded yet.</p>
                    ) : (
                      <div className="rounded-2xl border border-white/10 overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead className="bg-white/5 border-b border-white/10">
                              <tr>
                                <th className="text-left px-4 py-3 font-bold text-muted-foreground uppercase tracking-wider">Wallet</th>
                                <th className="text-left px-4 py-3 font-bold text-muted-foreground uppercase tracking-wider">Tx Hash</th>
                                <th className="text-left px-4 py-3 font-bold text-muted-foreground uppercase tracking-wider">Block</th>
                                <th className="text-left px-4 py-3 font-bold text-muted-foreground uppercase tracking-wider">Status</th>
                                <th className="text-left px-4 py-3 font-bold text-muted-foreground uppercase tracking-wider">Time</th>
                                <th className="px-4 py-3"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {auditRecords.map((record) => (
                                <tr key={record.id} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                                  <td className="px-4 py-3 font-mono text-white">{record.wallet_address?.slice(0, 6)}...{record.wallet_address?.slice(-4)}</td>
                                  <td className="px-4 py-3">
                                    <button
                                      onClick={() => window.open(`${EXPLORER_URL}/tx/${record.transaction_hash}`, '_blank', 'noopener,noreferrer')}
                                      className="font-mono text-primary hover:underline flex items-center gap-1"
                                    >
                                      {record.transaction_hash?.slice(0, 10)}...{record.transaction_hash?.slice(-6)}
                                      <ExternalLink size={10} />
                                    </button>
                                  </td>
                                  <td className="px-4 py-3 font-mono text-muted-foreground">#{record.block_number}</td>
                                  <td className="px-4 py-3">
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-500/10 text-green-400 uppercase">{record.verification_status}</span>
                                  </td>
                                  <td className="px-4 py-3 text-muted-foreground">{new Date(record.created_at).toLocaleString()}</td>
                                  <td className="px-4 py-3">
                                    <button
                                      onClick={() => window.open(`${EXPLORER_URL}/tx/${record.transaction_hash}`, '_blank', 'noopener,noreferrer')}
                                      className="p-1.5 hover:bg-primary/20 rounded-lg text-primary transition-all"
                                      title="View on Etherscan"
                                    >
                                      <ExternalLink size={12} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Share Modal */}
          <AnimatePresence>
            {shareModalElection && (
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
                  className="bg-slate-900 border border-white/10 rounded-[24px] p-6 max-w-md w-full shadow-2xl relative"
                >
                  <button
                    onClick={() => {
                      setShareModalElection(null);
                      setCopiedLink(false);
                    }}
                    className="absolute top-4 right-4 text-muted-foreground hover:text-white transition-colors"
                  >
                    <X size={20} />
                  </button>

                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center">
                      <Share2 className="text-primary" size={20} />
                    </div>
                    <h3 className="text-lg font-bold text-white">Share Election</h3>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-1">Institute / Organization</p>
                      <p className="text-sm text-white font-medium">SecureVote Platform</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-1">Election Name</p>
                      <p className="text-sm text-white font-medium">{shareModalElection.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">{shareModalElection.description}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-1">Election ID (Token)</p>
                      <div className="bg-black/50 border border-primary/30 p-3 rounded-xl flex items-center justify-between group">
                        <p className="text-lg font-mono text-primary font-bold tracking-wider">{shareModalElection.id}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-1">Direct Voting Link</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          readOnly
                          value={`${window.location.origin}/voter/login?election=${shareModalElection.id}`}
                          className="flex-1 bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-muted-foreground focus:outline-none"
                        />
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}/voter/login?election=${shareModalElection.id}`);
                            setCopiedLink(true);
                            setTimeout(() => setCopiedLink(false), 2000);
                          }}
                          className={clsx("p-2 rounded-xl transition-colors flex items-center justify-center text-white", copiedLink ? "bg-green-500 hover:bg-green-600" : "bg-primary hover:bg-primary/90")}
                          title={copiedLink ? "Copied!" : "Copy Link"}
                        >
                          {copiedLink ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setShareModalElection(null);
                      setCopiedLink(false);
                    }}
                    className="w-full mt-8 bg-white/5 hover:bg-white/10 text-white font-bold py-3 rounded-xl border border-white/10 transition-all text-sm"
                  >
                    Done
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Voters List Modal */}
          <AnimatePresence>
            {showVotersModal && (
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
                  className="bg-slate-900 border border-white/10 rounded-[24px] p-6 max-w-2xl w-full shadow-2xl relative flex flex-col max-h-[80vh]"
                >
                  <button
                    onClick={() => setShowVotersModal(false)}
                    className="absolute top-4 right-4 text-muted-foreground hover:text-white transition-colors"
                  >
                    <X size={20} />
                  </button>

                  <div className="flex items-center gap-3 mb-6 shrink-0">
                    <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center">
                      <Users className="text-primary" size={20} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">Registered Voters</h3>
                      <p className="text-xs text-muted-foreground">{selectedElection?.name}</p>
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className="flex items-center gap-2 mb-6 shrink-0 bg-white/5 p-1 rounded-xl">
                    <button
                      onClick={() => setVoterModalFilter('all')}
                      className={clsx("flex-1 py-1.5 text-xs font-bold rounded-lg transition-all", voterModalFilter === 'all' ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white")}
                    >
                      All ({votersList.length})
                    </button>
                    <button
                      onClick={() => setVoterModalFilter('voted')}
                      className={clsx("flex-1 py-1.5 text-xs font-bold rounded-lg transition-all", voterModalFilter === 'voted' ? "bg-green-500/20 text-green-400" : "text-muted-foreground hover:text-green-400")}
                    >
                      Voted ({votersList.filter(v => v.has_voted).length})
                    </button>
                    <button
                      onClick={() => setVoterModalFilter('pending')}
                      className={clsx("flex-1 py-1.5 text-xs font-bold rounded-lg transition-all", voterModalFilter === 'pending' ? "bg-yellow-500/20 text-yellow-400" : "text-muted-foreground hover:text-yellow-400")}
                    >
                      Pending ({votersList.filter(v => !v.has_voted).length})
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 border border-white/10 rounded-xl bg-black/20">
                    {votersList.filter(v => voterModalFilter === 'all' ? true : voterModalFilter === 'voted' ? v.has_voted : !v.has_voted).length === 0 ? (
                      <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                        No voters found in this category.
                      </div>
                    ) : (
                      <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 bg-slate-900/95 backdrop-blur z-10 border-b border-white/10">
                          <tr>
                            <th className="px-4 py-3 font-bold text-muted-foreground uppercase tracking-wider">Name</th>
                            <th className="px-4 py-3 font-bold text-muted-foreground uppercase tracking-wider">Email</th>
                            <th className="px-4 py-3 font-bold text-muted-foreground uppercase tracking-wider text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {votersList.filter(v => voterModalFilter === 'all' ? true : voterModalFilter === 'voted' ? v.has_voted : !v.has_voted).map((voter) => (
                            <tr key={voter.id} className="hover:bg-white/5 transition-colors">
                              <td className="px-4 py-3 font-medium text-white">{voter.name}</td>
                              <td className="px-4 py-3 text-muted-foreground">{voter.email}</td>
                              <td className="px-4 py-3 text-center">
                                {voter.has_voted ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-green-500/10 text-green-400 uppercase">
                                    <CheckCircle2 size={10} /> Voted
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-white/5 text-muted-foreground uppercase">
                                    <Clock size={10} /> Pending
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
          {/* Election Details Modal */}
          <AnimatePresence>
            {detailsModalElection && (
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
                  className="bg-slate-900 border border-white/10 rounded-[24px] p-6 max-w-lg w-full shadow-2xl relative flex flex-col max-h-[90vh] overflow-y-auto custom-scrollbar"
                >
                  <button
                    onClick={() => { setDetailsModalElection(null); setShowOtpInput(false); setOtpError(''); }}
                    className="absolute top-4 right-4 text-muted-foreground hover:text-white transition-colors"
                  >
                    <X size={20} />
                  </button>

                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center">
                      <Calendar className="text-primary" size={20} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">Election Details</h3>
                      <p className="text-xs text-muted-foreground">{detailsModalElection.name}</p>
                    </div>
                  </div>

                  <div className="space-y-4 mb-6">
                    <div className="bg-black/50 p-4 rounded-xl border border-white/5 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Status</span>
                        <span className={clsx("text-[10px] font-bold px-3 py-1 rounded-full uppercase",
                          detailsModalElection.status === 'active' ? 'bg-green-500/10 text-green-400' :
                            detailsModalElection.status === 'upcoming' ? 'bg-blue-500/10 text-blue-400' :
                              'bg-white/5 text-muted-foreground'
                        )}>{detailsModalElection.status}</span>
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Start Date</span>
                        <span className="text-sm font-medium">{new Date(detailsModalElection.start_date).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">End Date</span>
                        <span className="text-sm font-medium">{new Date(detailsModalElection.end_date).toLocaleString()}</span>
                      </div>
                      
                      {detailsModalElection.status !== 'completed' && detailsModalElection.status !== 'ended' ? (
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Time Left</span>
                          <span className="text-sm font-bold text-primary">
                            {new Date(detailsModalElection.end_date).getTime() > new Date().getTime() 
                              ? Math.ceil((new Date(detailsModalElection.end_date).getTime() - new Date().getTime()) / (1000 * 60 * 60)) + ' hours'
                              : 'Ending soon'}
                          </span>
                        </div>
                      ) : null}
                    </div>

                    <div className="bg-black/50 p-4 rounded-xl border border-white/5 space-y-3">
                      {detailsModalElection.status === 'completed' || detailsModalElection.status === 'ended' ? (
                        <>
                          <div className="flex items-center gap-2 mb-2">
                            <Trophy size={16} className="text-yellow-400" />
                            <span className="text-sm font-bold text-white">Election Results</span>
                          </div>
                          {detailsCandidates.length > 0 ? (
                            <>
                              <div className="flex justify-between items-center">
                                <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Winner</span>
                                <span className="text-sm font-bold text-yellow-400">{detailsCandidates[0].name}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Votes Received</span>
                                <span className="text-sm font-medium">{detailsCandidates[0].vote_count}</span>
                              </div>
                              {detailsCandidates.length > 1 && (
                                <div className="flex justify-between items-center">
                                  <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Majority By</span>
                                  <span className="text-sm font-medium text-green-400">{(detailsCandidates[0].vote_count - detailsCandidates[1].vote_count)} votes</span>
                                </div>
                              )}
                            </>
                          ) : (
                            <p className="text-xs text-muted-foreground">No candidates or votes recorded.</p>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 mb-2">
                            <Trophy size={16} className="text-blue-400" />
                            <span className="text-sm font-bold text-white">Current Leader</span>
                          </div>
                          {detailsCandidates.length > 0 && detailsCandidates[0].vote_count > 0 ? (
                            <div className="flex justify-between items-center">
                              <span className="text-sm font-bold text-blue-400">{detailsCandidates[0].name}</span>
                              <span className="text-sm font-medium">{detailsCandidates[0].vote_count} votes</span>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">No votes cast yet.</p>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {!showOtpInput ? (
                    <div className="grid grid-cols-2 gap-4 mt-6">
                      <button
                        onClick={() => handleInitiateOtpAction('extend')}
                        disabled={detailsModalElection.status === 'completed' || detailsModalElection.status === 'ended'}
                        className="bg-white/5 hover:bg-white/10 text-white font-bold py-3 rounded-xl border border-white/10 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Extend Duration
                      </button>
                      <button
                        onClick={() => handleInitiateOtpAction('end')}
                        disabled={detailsModalElection.status === 'completed' || detailsModalElection.status === 'ended'}
                        className="bg-red-500/20 hover:bg-red-500/30 text-red-400 font-bold py-3 rounded-xl border border-red-500/30 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        End Election
                      </button>
                      
                      {otpError && (
                        <div className="col-span-2 text-xs text-red-400 text-center mt-2">{otpError}</div>
                      )}
                      
                      {/* Date picker for extend */}
                      {otpAction === 'extend' && (
                         <div className="col-span-2 mt-2">
                           <label className="text-xs text-muted-foreground mb-1 block">Select New End Date</label>
                           <input 
                             type="datetime-local" 
                             value={newEndDate}
                             onChange={(e) => setNewEndDate(e.target.value)}
                             className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary text-white"
                           />
                         </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-black/50 p-6 rounded-xl border border-white/10 mt-2 space-y-4 text-center">
                      <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-2">
                        <Lock className="text-primary" size={20} />
                      </div>
                      <h4 className="text-sm font-bold text-white">Admin Authentication</h4>
                      <p className="text-xs text-muted-foreground">OTP sent to your email. Please enter it below to confirm {otpAction === 'end' ? 'ending the election' : 'extending the duration'}.</p>
                      
                      <div className="relative max-w-[200px] mx-auto">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Key size={14} className="text-muted-foreground" />
                        </div>
                        <input 
                          type="text" 
                          maxLength={6} 
                          value={otpValue} 
                          onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, ''))} 
                          className="w-full bg-black/80 border border-white/20 rounded-xl py-3 pl-10 pr-3 text-center tracking-widest focus:outline-none focus:border-primary transition-colors text-white font-mono" 
                          placeholder="------" 
                        />
                      </div>

                      {otpError && <p className="text-xs text-red-400">{otpError}</p>}

                      <div className="flex gap-2 justify-center mt-4">
                        <button 
                          onClick={() => { setShowOtpInput(false); setOtpError(''); }} 
                          className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold transition-all"
                        >
                          Cancel
                        </button>
                        <button 
                          onClick={handleConfirmOtpAction}
                          disabled={otpValue.length !== 6 || otpLoading}
                          className="px-6 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-2"
                        >
                          {otpLoading ? <Loader2 size={14} className="animate-spin" /> : 'Confirm'}
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
};

const SidebarItem = ({ icon, label, active = false, onClick, className }: any) => (
  <button onClick={onClick} className={clsx("w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all group", active ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-muted-foreground hover:bg-white/5 hover:text-white", className)}>
    {icon} {label}
  </button>
);

const StatCard = ({ label, value, icon, trend, variant, onClick, clickable }: any) => (
  <div
    onClick={onClick}
    className={clsx(
      "p-6 rounded-3xl bg-white/5 border border-white/10 relative overflow-hidden group backdrop-blur-sm",
      clickable && "cursor-pointer hover:bg-white/10 hover:border-white/20 transition-all active:scale-[0.98]"
    )}
  >
    <div className="flex justify-between items-start mb-4">
      <div className={clsx("w-11 h-11 rounded-xl flex items-center justify-center", variant === 'turnout' ? "bg-green-500/10 text-green-500" : "bg-primary/10 text-primary")}>
        {icon}
      </div>
      {trend && <span className="text-[10px] font-bold text-green-400 bg-green-400/10 px-2.5 py-1 rounded-full">{trend}</span>}
    </div>
    <div className="text-3xl font-bold mb-1 tracking-tight">{value}</div>
    <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">{label}</div>
  </div>
);

export default AdminDashboard;
