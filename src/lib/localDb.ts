export interface MockElection {
  id: string;
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  expected_voters: number;
  status: 'upcoming' | 'active' | 'completed';
  created_by: string;
  organization_name?: string;
  created_at: string;
}

export interface MockCandidate {
  id: string;
  election_id: string;
  name: string;
  photo_url: string;
  department: string;
  position: string;
  manifesto: string;
  vote_count: number;
  created_at: string;
}

export interface MockProfile {
  id: string;
  email: string;
  full_name: string;
  role: string;
  created_at: string;
}

export interface MockEligibleVoter {
  id: string;
  election_id: string;
  name: string;
  email: string;
  has_voted: boolean;
  created_at: string;
}

export interface MockVoterWallet {
  id: string;
  voter_email: string;
  election_id: string;
  wallet_address: string;
  verified: boolean;
  created_at: string;
}

export interface MockVote {
  id: string;
  election_id: string;
  candidate_id: string;
  voter_id: string;
  voted_at: string;
}

const DEFAULT_ELECTIONS: MockElection[] = [];
const DEFAULT_CANDIDATES: MockCandidate[] = [];
const DEFAULT_ELIGIBLE_VOTERS: MockEligibleVoter[] = [];
const DEFAULT_PROFILES: MockProfile[] = [
  {
    id: 'p1',
    email: 'admin@securevote.ai',
    full_name: 'Admin User',
    role: 'admin',
    created_at: new Date().toISOString()
  }
];

const getStorageItem = <T>(key: string, defaultValue: T): T => {
  const item = localStorage.getItem(key);
  if (!item) {
    localStorage.setItem(key, JSON.stringify(defaultValue));
    return defaultValue;
  }
  try {
    return JSON.parse(item);
  } catch {
    return defaultValue;
  }
};

const setStorageItem = <T>(key: string, value: T): void => {
  localStorage.setItem(key, JSON.stringify(value));
};

export const localDb = {
  getElections: (): MockElection[] => {
    return getStorageItem('mock_elections', DEFAULT_ELECTIONS);
  },

  saveElection: (
    election: Omit<MockElection, 'id' | 'created_at'>, 
    candidates: Omit<MockCandidate, 'id' | 'election_id' | 'created_at' | 'vote_count'>[],
    eligibleVoters: Omit<MockEligibleVoter, 'id' | 'election_id' | 'created_at' | 'has_voted'>[]
  ): MockElection => {
    const elections = localDb.getElections();
    const newElection: MockElection = {
      ...election,
      id: `sim-election-${Math.random().toString(36).substr(2, 9)}`,
      created_at: new Date().toISOString()
    };
    elections.push(newElection);
    setStorageItem('mock_elections', elections);

    // Save candidates
    const allCandidates = getStorageItem<MockCandidate[]>('mock_candidates', DEFAULT_CANDIDATES);
    const newCandidates: MockCandidate[] = candidates.map(c => ({
      ...c,
      id: `c-${Math.random().toString(36).substr(2, 9)}`,
      election_id: newElection.id,
      vote_count: 0,
      created_at: new Date().toISOString()
    }));
    allCandidates.push(...newCandidates);
    setStorageItem('mock_candidates', allCandidates);

    // Save eligible voters
    const allVoters = getStorageItem<MockEligibleVoter[]>('mock_eligible_voters', DEFAULT_ELIGIBLE_VOTERS);
    const newVoters: MockEligibleVoter[] = eligibleVoters.map(v => ({
      ...v,
      id: `v-${Math.random().toString(36).substr(2, 9)}`,
      election_id: newElection.id,
      has_voted: false,
      created_at: new Date().toISOString()
    }));
    allVoters.push(...newVoters);
    setStorageItem('mock_eligible_voters', allVoters);

    return newElection;
  },

  getCandidates: (electionId: string): MockCandidate[] => {
    const candidates = getStorageItem('mock_candidates', DEFAULT_CANDIDATES);
    return candidates.filter(c => c.election_id === electionId);
  },

  getEligibleVoters: (electionId: string): MockEligibleVoter[] => {
    const voters = getStorageItem('mock_eligible_voters', DEFAULT_ELIGIBLE_VOTERS);
    return voters.filter(v => v.election_id === electionId);
  },

  verifyVoter: (electionId: string, email: string): MockEligibleVoter | null => {
    const voters = getStorageItem<MockEligibleVoter[]>('mock_eligible_voters', DEFAULT_ELIGIBLE_VOTERS);
    const voter = voters.find(v => v.election_id === electionId && v.email.toLowerCase() === email.toLowerCase());
    return voter || null;
  },

  saveVoterWallet: (wallet: Omit<MockVoterWallet, 'id' | 'created_at'>): MockVoterWallet => {
    const wallets = getStorageItem<MockVoterWallet[]>('mock_voter_wallets', []);
    const newWallet: MockVoterWallet = {
      ...wallet,
      id: `w-${Math.random().toString(36).substr(2, 9)}`,
      created_at: new Date().toISOString()
    };
    wallets.push(newWallet);
    setStorageItem('mock_voter_wallets', wallets);
    return newWallet;
  },

  verifyVoterWallet: (electionId: string, email: string): MockVoterWallet | null => {
    const wallets = getStorageItem<MockVoterWallet[]>('mock_voter_wallets', []);
    return wallets.find(w => w.election_id === electionId && w.voter_email.toLowerCase() === email.toLowerCase() && w.verified) || null;
  },

  castVote: (electionId: string, candidateId: string, voterEmail: string): boolean => {
    const elections = localDb.getElections();
    const election = elections.find(e => e.id === electionId);
    if (!election) return false;

    // Mark eligible voter as voted
    const voters = getStorageItem<MockEligibleVoter[]>('mock_eligible_voters', DEFAULT_ELIGIBLE_VOTERS);
    const voterIndex = voters.findIndex(v => v.election_id === electionId && v.email.toLowerCase() === voterEmail.toLowerCase());
    
    if (voterIndex !== -1) {
      voters[voterIndex].has_voted = true;
      setStorageItem('mock_eligible_voters', voters);
    }

    // Increment candidate vote count
    const candidates = getStorageItem<MockCandidate[]>('mock_candidates', DEFAULT_CANDIDATES);
    const candidateIndex = candidates.findIndex(c => c.id === candidateId);
    if (candidateIndex !== -1) {
      candidates[candidateIndex].vote_count = (candidates[candidateIndex].vote_count || 0) + 1;
      setStorageItem('mock_candidates', candidates);
    }

    // Add vote record
    const votes = getStorageItem<MockVote[]>('mock_votes', []);
    votes.push({
      id: `vote-${Math.random().toString(36).substr(2, 9)}`,
      election_id: electionId,
      candidate_id: candidateId,
      voter_id: voters[voterIndex]?.id || voterEmail,
      voted_at: new Date().toISOString()
    });
    setStorageItem('mock_votes', votes);

    return true;
  },

  getVotesCount: (electionId: string): number => {
    const votes = getStorageItem<MockVote[]>('mock_votes', []);
    return votes.filter(v => v.election_id === electionId).length;
  }
};
