import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Building2, 
  Calendar, 
  UserPlus, 
  CheckCircle2, 
  Sparkles,
  AlertTriangle,
  Loader2,
  Copy,
  Check,
  Upload,
  Trash2,
  Plus,
  Image as ImageIcon,
  Users,
  Link
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { clsx } from 'clsx';
import {
  createElectionOnChain,
  registerCandidateOnChain,
  activateElectionOnChain,
  authorizeVotersBatchOnChain,
} from '../../lib/blockchain/blockchainService';
import { validateNetwork } from '../../lib/blockchain/contract';

interface CreateElectionWizardProps {
  onSuccess: () => void;
  onCancel: () => void;
}

const steps = [
  { id: 'config', title: 'Details', icon: <Building2 /> },
  { id: 'schedule', title: 'Schedule', icon: <Calendar /> },
  { id: 'candidates', title: 'Candidates', icon: <UserPlus /> },
  { id: 'voters', title: 'Voter Import', icon: <Users /> },
  { id: 'review', title: 'Review & Launch', icon: <CheckCircle2 /> }
];

export const CreateElectionWizard: React.FC<CreateElectionWizardProps> = ({ onSuccess, onCancel }) => {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [generatedElectionCode, setGeneratedElectionCode] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);

  // Blockchain deployment state
  const [deployStep, setDeployStep] = useState<'idle' | 'db' | 'chain' | 'candidates' | 'voters' | 'activate' | 'done' | 'failed'>('idle');
  const [deployError, setDeployError] = useState('');

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [numCandidates, setNumCandidates] = useState('3');
  const [expectedVoters, setExpectedVoters] = useState('');
  
  const [candidates, setCandidates] = useState<any[]>([
    { name: '', position: '', department: '', manifesto: '', photoFile: null, photoUrl: '' },
    { name: '', position: '', department: '', manifesto: '', photoFile: null, photoUrl: '' },
    { name: '', position: '', department: '', manifesto: '', photoFile: null, photoUrl: '' },
  ]);

  const [voters, setVoters] = useState<{ name: string; email: string }[]>([]);
  const [newVoterName, setNewVoterName] = useState('');
  const [newVoterEmail, setNewVoterEmail] = useState('');

  React.useEffect(() => {
    const targetSize = parseInt(numCandidates) || 0;
    if (targetSize > 0) {
      setCandidates(prev => {
        const next = [...prev];
        if (next.length < targetSize) {
          while (next.length < targetSize) {
            next.push({ name: '', position: '', department: '', manifesto: '', photoFile: null, photoUrl: '' });
          }
        } else if (next.length > targetSize) {
          return next.slice(0, targetSize);
        }
        return next;
      });
    }
  }, [numCandidates]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        if (!data) return;
        let parsedVoters: any[] = [];
        if (file.name.endsWith('.csv')) {
          const text = data as string;
          const lines = text.split(/\r?\n/);
          lines.forEach((line, idx) => {
            if (idx === 0 || !line.trim()) return;
            const parts = line.split(',');
            if (parts.length >= 2) parsedVoters.push({ name: parts[0].trim(), email: parts[1].trim() });
          });
        } else {
          const workbook = XLSX.read(data, { type: 'binary' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json<any>(sheet);
          rows.forEach((row) => {
            const nameKey = Object.keys(row).find(k => k.toLowerCase().includes('name')) || Object.keys(row)[0];
            const emailKey = Object.keys(row).find(k => k.toLowerCase().includes('email')) || Object.keys(row)[1];
            if (row[nameKey] && row[emailKey]) parsedVoters.push({ name: String(row[nameKey]), email: String(row[emailKey]) });
          });
        }
        setVoters(prev => [...prev, ...parsedVoters]);
      } catch (err) { setError('Error parsing file.'); }
    };
    if (file.name.endsWith('.csv')) reader.readAsText(file); else reader.readAsBinaryString(file);
  };

  const handleCandidatePhotoUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const n = [...candidates];
      n[index].photoFile = file;
      n[index].photoUrl = URL.createObjectURL(file); // preview
      setCandidates(n);
    }
  };

  const uploadPhotosToStorage = async (): Promise<string[]> => {
    const uploadedUrls: string[] = [];
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      const fallbackUrl = null;
      
      if (c.photoFile) {
        try {
          const fileExt = c.photoFile.name.split('.').pop();
          const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
          
          const { error: uploadError } = await supabase.storage
            .from('candidate-photos')
            .upload(fileName, c.photoFile);

          if (uploadError) {
            console.error(`[Upload] Failed for candidate ${i + 1}:`, uploadError.message);
            uploadedUrls.push(fallbackUrl);
          } else {
            const { data } = supabase.storage.from('candidate-photos').getPublicUrl(fileName);
            uploadedUrls.push(data.publicUrl);
          }
        } catch (err) {
          console.error(`[Upload] Unexpected error for candidate ${i + 1}:`, err);
          uploadedUrls.push(fallbackUrl);
        }
      } else {
        uploadedUrls.push(fallbackUrl);
      }
    }
    return uploadedUrls;
  };

  const handleCreateElection = async () => {
    setLoading(true);
    setError('');
    setDeployStep('idle');
    setDeployError('');
    try {
      const validCandidates = candidates.filter(c => c.name);
      
      if (validCandidates.length === 0) {
        throw new Error('You must provide at least one valid candidate.');
      }
      if (validCandidates.length !== parseInt(numCandidates)) {
        throw new Error(`You selected ${numCandidates} candidates but only provided details for ${validCandidates.length}.`);
      }

      const finalPhotoUrls = await uploadPhotosToStorage();

      // ── Step 1: Insert Election to Supabase ──
      setDeployStep('db');
      const { data: electionData, error: electionError } = await supabase
        .from('elections')
        .insert({
          name: title,
          description,
          organization_name: organizationName,
          start_date: new Date(startDate).toISOString(),
          end_date: new Date(endDate).toISOString(),
          expected_voters: parseInt(expectedVoters) || voters.length || 0,
          created_by: user?.id
        })
        .select()
        .single();

      if (electionError) throw electionError;
      setGeneratedElectionCode(electionData.id);

      // ── Step 2: Insert Candidates to Supabase ──
      const candidatesToInsert = candidates.map((c, idx) => ({
        election_id: electionData.id,
        name: c.name,
        photo_url: finalPhotoUrls[idx] || null,
        department: c.department,
        position: c.position,
        manifesto: c.manifesto
      }));

      const { error: candidatesError } = await supabase.from('candidates').insert(candidatesToInsert);
      if (candidatesError) throw candidatesError;

      // ── Step 3: Insert Eligible Voters to Supabase ──
      if (voters.length > 0) {
        const votersToInsert = voters.map(v => ({
          election_id: electionData.id,
          name: v.name,
          email: v.email.toLowerCase()
        }));
        const { error: votersError } = await supabase.from('eligible_voters').insert(votersToInsert);
        if (votersError) throw votersError;
      }

      // ── Step 4: Deploy Election to Blockchain (automatic) ──
      setDeployStep('chain');
      try {
        const networkOk = await validateNetwork();
        if (!networkOk) {
          throw new Error('Please switch to Sepolia testnet in MetaMask to deploy on blockchain.');
        }

        console.log('[Deploy] 1. Creating election on-chain...');
        console.log('[Deploy]    electionId:', electionData.id);
        console.log('[Deploy]    title:', title);
        console.log('[Deploy]    startDate:', new Date(startDate).toISOString());
        console.log('[Deploy]    endDate:', new Date(endDate).toISOString());
        console.log('[Deploy]    candidateCount:', validCandidates.length);
        const bcResult = await createElectionOnChain(
          electionData.id,
          title,
          new Date(startDate),
          new Date(endDate),
          validCandidates.length
        );
        console.log('[Deploy]    ✅ Election created. TX:', bcResult.transactionHash);

        // ── Step 5: Register Candidates on-chain ──
        setDeployStep('candidates');
        console.log('[Deploy] 2. Registering candidates on-chain...');
        for (let i = 0; i < validCandidates.length; i++) {
          console.log(`[Deploy]    Registering candidate ${i}: ${validCandidates[i].name}`);
          const txHash = await registerCandidateOnChain(electionData.id, validCandidates[i].name);
          console.log(`[Deploy]    ✅ Candidate ${i} registered. TX:`, txHash);
        }

        // ── Step 6: Voter authorization skipped ──
        // On-chain voter authorization is not enforced in the updated contract.
        // Authorization is handled off-chain via Supabase eligible_voters table.
        console.log('[Deploy] 3. Voter authorization: handled off-chain (skipped on-chain).');

        // ── Step 7: Activate Election on-chain ──
        setDeployStep('activate');
        console.log('[Deploy] 4. Activating election on-chain...');
        const activateTx = await activateElectionOnChain(electionData.id);
        console.log('[Deploy]    ✅ Election activated. TX:', activateTx);

        // ── Step 8: Mark election as on-chain in Supabase ──
        console.log('[Deploy] 5. Updating Supabase status...');
        await supabase
          .from('elections')
          .update({
            is_on_chain: true,
            contract_election_id: bcResult.contractElectionId,
          })
          .eq('id', electionData.id);

        setDeployStep('done');
        console.log('[Deploy] ✅ Full deployment complete!');
      } catch (bcErr: any) {
        // Blockchain deploy failed but Supabase election was created successfully.
        // Don't fail the whole flow — election still works, just not on-chain yet.
        console.error('[Blockchain Deploy] Failed:', bcErr.message);
        console.error('[Blockchain Deploy] Full error:', bcErr);
        setDeployError(bcErr.message || 'Blockchain deployment failed. Election was saved but not deployed on-chain.');
        setDeployStep('failed');
      }

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to launch election.');
    } finally {
      setLoading(false);
    }
  };

  const copyElectionCode = () => {
    navigator.clipboard.writeText(generatedElectionCode).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    });
  };

  return (
    <div className="max-w-4xl mx-auto py-4 px-2">
      <div className="flex justify-between items-center mb-8 bg-white/5 border border-white/10 rounded-2xl p-6">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2 text-white">
            <Sparkles size={20} className="text-primary animate-pulse" />
            Create New Election Wizard
          </h2>
          <p className="text-xs text-muted-foreground mt-1">Deploy an institutional election securely.</p>
        </div>
        <button onClick={onCancel} className="text-xs font-semibold text-muted-foreground hover:text-white px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl transition-all border border-white/10">Cancel</button>
      </div>

      <div className="flex justify-between items-center mb-10 px-4">
        {steps.map((step, idx) => (
          <div key={step.id} className="flex flex-col items-center flex-1 relative">
            <div className={clsx(
              "w-10 h-10 rounded-xl flex items-center justify-center border-2 transition-all relative z-10",
              idx === currentStep ? 'border-primary bg-primary/10 text-primary shadow-lg shadow-primary/20 scale-110' : 
              idx < currentStep ? 'border-green-500 bg-green-500/10 text-green-500' : 'border-white/10 bg-white/5 text-muted-foreground'
            )}>
              {idx < currentStep ? <CheckCircle2 size={18} /> : React.cloneElement(step.icon, { size: 18 })}
            </div>
            <span className={clsx("text-[10px] font-bold mt-2 hidden md:block uppercase tracking-wider", idx === currentStep ? 'text-primary' : 'text-muted-foreground')}>{step.title}</span>
            {idx < steps.length - 1 && <div className="absolute top-5 left-[50%] right-[-50%] h-0.5 bg-white/10 z-0" />}
          </div>
        ))}
      </div>

      <div className="bg-white/5 border border-white/10 rounded-[32px] p-8 backdrop-blur-xl relative overflow-hidden shadow-2xl min-h-[400px]">
        {error && <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm flex items-center gap-2 mb-6"><AlertTriangle size={16} /><span>{error}</span></div>}

        <AnimatePresence mode="wait">
          {!success ? (
            <motion.div key={currentStep} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              {currentStep === 0 && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground ml-1">Organization Name</label>
                    <input type="text" value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} placeholder="e.g. Student Council" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 focus:outline-none focus:border-primary transition-all text-sm" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground ml-1">Election Title</label>
                    <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Executive Committee Election 2026" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 focus:outline-none focus:border-primary transition-all text-sm" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground ml-1">Election Description</label>
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Explain the purpose..." rows={4} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 focus:outline-none focus:border-primary transition-all text-sm resize-none" />
                  </div>
                </div>
              )}

              {currentStep === 1 && (
                <div className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground ml-1">Start Date</label>
                      <input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 focus:outline-none focus:border-primary transition-all text-sm text-white" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground ml-1">End Date</label>
                      <input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 focus:outline-none focus:border-primary transition-all text-sm text-white" />
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground ml-1">Number of Candidates</label>
                      <select value={numCandidates} onChange={(e) => setNumCandidates(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 focus:outline-none focus:border-primary transition-all text-sm text-white">
                        {[2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n} className="bg-slate-900">{n} Candidates</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground ml-1">Expected Voters (if not importing)</label>
                      <input type="number" value={expectedVoters} onChange={(e) => setExpectedVoters(e.target.value)} placeholder="e.g. 500" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 focus:outline-none focus:border-primary transition-all text-sm" />
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 2 && (
                <div className="space-y-6 max-h-[450px] overflow-y-auto pr-2 custom-scrollbar">
                  {candidates.map((candidate, idx) => (
                    <div key={idx} className="p-6 rounded-2xl bg-white/5 border border-white/5 space-y-4">
                      <div className="flex items-center gap-4 border-b border-white/10 pb-4">
                        <div className="relative w-16 h-16 rounded-full bg-white/10 border border-white/20 overflow-hidden flex items-center justify-center group cursor-pointer">
                          {candidate.photoUrl ? (
                            <img src={candidate.photoUrl} alt="Candidate" className="w-full h-full object-cover" />
                          ) : (
                            <ImageIcon className="text-muted-foreground" size={24} />
                          )}
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Upload size={16} className="text-white" />
                          </div>
                          <input type="file" accept="image/*" onChange={(e) => handleCandidatePhotoUpload(idx, e)} className="absolute inset-0 opacity-0 cursor-pointer" />
                        </div>
                        <div>
                          <span className="text-sm font-bold text-primary">Candidate {idx + 1}</span>
                          <p className="text-[10px] text-muted-foreground">Upload a professional photo</p>
                        </div>
                      </div>
                      <div className="grid md:grid-cols-2 gap-4">
                        <input type="text" placeholder="Full Name" value={candidate.name} onChange={(e) => { const n = [...candidates]; n[idx].name = e.target.value; setCandidates(n); }} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-primary" />
                        <input type="text" placeholder="Position" value={candidate.position} onChange={(e) => { const n = [...candidates]; n[idx].position = e.target.value; setCandidates(n); }} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-primary" />
                        <input type="text" placeholder="Department" value={candidate.department} onChange={(e) => { const n = [...candidates]; n[idx].department = e.target.value; setCandidates(n); }} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-primary md:col-span-2" />
                      </div>
                      <textarea placeholder="Manifesto" value={candidate.manifesto} onChange={(e) => { const n = [...candidates]; n[idx].manifesto = e.target.value; setCandidates(n); }} rows={3} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-primary resize-none" />
                    </div>
                  ))}
                </div>
              )}

              {currentStep === 3 && (
                <div className="space-y-6">
                  <div className="border-2 border-dashed border-white/10 rounded-2xl p-8 hover:border-primary transition-all relative text-center bg-white/5">
                    <input type="file" accept=".csv, .xlsx" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                    <Upload size={24} className="mx-auto text-primary mb-2" />
                    <p className="text-sm font-semibold">Upload CSV or Excel</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Columns needed: Name, Email</p>
                  </div>
                  <div className="flex gap-3 bg-white/5 p-4 rounded-xl border border-white/5">
                    <input type="text" value={newVoterName} onChange={(e) => setNewVoterName(e.target.value)} placeholder="Voter Name" className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs" />
                    <input type="email" value={newVoterEmail} onChange={(e) => setNewVoterEmail(e.target.value)} placeholder="Voter Email" className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs" />
                    <button onClick={() => { if(newVoterName && newVoterEmail) { setVoters([...voters, {name: newVoterName, email: newVoterEmail}]); setNewVoterName(''); setNewVoterEmail(''); } }} className="bg-primary px-4 rounded-lg text-xs font-bold hover:bg-primary/90 transition-all"><Plus size={14} /></button>
                  </div>
                  <div className="text-xs text-muted-foreground font-semibold flex items-center justify-between">
                    <span>{voters.length} Eligible Voters Imported</span>
                    {voters.length > 0 && <button onClick={() => setVoters([])} className="text-red-400 hover:text-red-300">Clear All</button>}
                  </div>

                  {voters.length > 0 && (
                    <div className="max-h-[250px] overflow-y-auto custom-scrollbar rounded-xl border border-white/10">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-slate-900 backdrop-blur-sm z-10 border-b border-white/10">
                          <tr>
                            <th className="text-left px-4 py-2.5 font-bold text-muted-foreground uppercase tracking-wider">#</th>
                            <th className="text-left px-4 py-2.5 font-bold text-muted-foreground uppercase tracking-wider">Name</th>
                            <th className="text-left px-4 py-2.5 font-bold text-muted-foreground uppercase tracking-wider">Email</th>
                            <th className="px-4 py-2.5"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {voters.map((v, idx) => (
                            <tr key={idx} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                              <td className="px-4 py-2.5 text-muted-foreground">{idx + 1}</td>
                              <td className="px-4 py-2.5 font-medium text-white">{v.name}</td>
                              <td className="px-4 py-2.5 text-muted-foreground">{v.email}</td>
                              <td className="px-4 py-2.5">
                                <button
                                  onClick={() => setVoters(voters.filter((_, i) => i !== idx))}
                                  className="p-1 hover:bg-red-500/20 rounded-lg text-red-400 hover:text-red-300 transition-all"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {currentStep === 4 && (
                <div className="space-y-8">
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 col-span-3 md:col-span-1">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Organization</p>
                      <p className="text-sm font-bold truncate">{organizationName || 'N/A'}</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 col-span-3 md:col-span-2">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Election Title</p>
                      <p className="text-sm font-bold truncate">{title}</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4 text-center">
                      <p className="text-2xl font-bold text-primary">{candidates.filter(c => c.name).length}</p>
                      <p className="text-[10px] font-bold text-primary/80 uppercase">Candidates</p>
                    </div>
                    <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 text-center">
                      <p className="text-2xl font-bold text-green-500">{voters.length || expectedVoters || 0}</p>
                      <p className="text-[10px] font-bold text-green-500/80 uppercase">Voters</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center col-span-2">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Duration</p>
                      <p className="text-xs font-mono">{new Date(startDate || Date.now()).toLocaleString()} - {new Date(endDate || Date.now()).toLocaleString()}</p>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Candidate Preview</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {candidates.filter(c => c.name).map((c, i) => (
                        <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center gap-3">
                           {c.photoUrl ? (
                            <img src={c.photoUrl} alt={c.name} className="w-10 h-10 rounded-full object-cover border border-white/20" />
                           ) : (
                            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center font-bold text-xs">{c.name.charAt(0)}</div>
                           )}
                           <div>
                             <p className="text-xs font-bold truncate max-w-[100px]">{c.name}</p>
                             <p className="text-[10px] text-muted-foreground truncate max-w-[100px]">{c.position}</p>
                           </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-4 pt-8 border-t border-white/10 mt-8">
                {currentStep > 0 && <button onClick={() => setCurrentStep(currentStep - 1)} className="flex-1 bg-white/5 py-4 rounded-xl font-bold text-sm border border-white/10 hover:bg-white/10 transition-all">Back</button>}
                {currentStep < steps.length - 1 ? (
                  <button onClick={() => setCurrentStep(currentStep + 1)} className="flex-1 bg-primary py-4 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all">Continue</button>
                ) : (
                  <button onClick={handleCreateElection} disabled={loading} className="flex-1 bg-green-600 py-4 rounded-xl font-bold text-sm shadow-lg shadow-green-600/20 flex items-center justify-center gap-2 hover:bg-green-500 transition-all">
                    {loading ? <Loader2 className="animate-spin" /> : <>Launch Election <Sparkles size={16} /></>}
                  </button>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-10 space-y-8">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500/10 text-green-500 mb-2 border border-green-500/20 animate-bounce"><CheckCircle2 size={40} /></div>
              <h3 className="text-3xl font-bold text-white mb-2">Election Live!</h3>

              {/* Blockchain Deployment Progress */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5 max-w-md mx-auto space-y-3 text-left">
                <div className="flex items-center gap-3 text-sm">
                  <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                  <span className="text-white font-bold">Saved to database</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  {deployStep === 'chain' ? (
                    <Loader2 size={16} className="text-primary animate-spin shrink-0" />
                  ) : deployStep === 'candidates' || deployStep === 'done' ? (
                    <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                  ) : deployStep === 'failed' ? (
                    <AlertTriangle size={16} className="text-yellow-500 shrink-0" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border border-white/20 shrink-0" />
                  )}
                  <span className={clsx("font-bold", deployStep === 'failed' ? 'text-yellow-400' : 'text-white')}>
                    {deployStep === 'failed' ? 'Blockchain deploy skipped' : 'Deployed to blockchain'}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  {deployStep === 'candidates' || deployStep === 'voters' || deployStep === 'activate' ? (
                    <Loader2 size={16} className="text-primary animate-spin shrink-0" />
                  ) : deployStep === 'done' ? (
                    <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                  ) : deployStep === 'failed' ? (
                    <AlertTriangle size={16} className="text-yellow-500 shrink-0" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border border-white/20 shrink-0" />
                  )}
                  <span className={clsx("font-bold", deployStep === 'failed' ? 'text-yellow-400' : 'text-white')}>
                    {deployStep === 'failed' ? 'Candidates not registered on-chain' : 'Candidates registered on-chain'}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  {deployStep === 'activate' ? (
                    <Loader2 size={16} className="text-primary animate-spin shrink-0" />
                  ) : deployStep === 'done' ? (
                    <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                  ) : deployStep === 'failed' ? (
                    <AlertTriangle size={16} className="text-yellow-500 shrink-0" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border border-white/20 shrink-0" />
                  )}
                  <span className={clsx("font-bold", deployStep === 'failed' ? 'text-yellow-400' : 'text-white')}>
                    {deployStep === 'failed' ? 'Election activation skipped' : 'Election activated'}
                  </span>
                </div>
                {deployStep === 'done' && (
                  <div className="flex items-center gap-2 pt-1 text-xs text-green-400 font-bold">
                    <Link size={12} /> Blockchain-secured election
                  </div>
                )}
                {deployError && (
                  <p className="text-[10px] text-yellow-400 mt-1">{deployError}</p>
                )}
              </div>

              <div className="bg-primary/5 border border-primary/20 rounded-[24px] p-6 max-w-md mx-auto">
                <p className="text-[10px] text-primary font-bold uppercase mb-2">ELECTION ACCESS ID</p>
                <p className="text-xl font-mono font-bold text-white tracking-wide mb-3 select-all">{generatedElectionCode}</p>
                <button
                  onClick={copyElectionCode}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-bold hover:bg-primary/20 transition-all"
                >
                  {codeCopied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy ID</>}
                </button>
              </div>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">Share this Election ID with eligible voters so they can access the election through the Voter Portal.</p>
              <button onClick={onSuccess} className="px-8 py-4 bg-white text-black font-bold rounded-xl text-sm shadow-xl hover:bg-white/90 transition-all">Proceed to Dashboard</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
