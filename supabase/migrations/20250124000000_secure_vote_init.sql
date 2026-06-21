/*
# SecureVote AI Initial Schema
Initial setup for the election management and voting platform.

## Query Description:
This migration creates the core tables for the voting system. It includes profiles, elections, candidates, votes, and fraud alerts. It also sets up Row Level Security (RLS) with corrected syntax.

## Metadata:
- Schema-Category: Structural
- Impact-Level: High
- Requires-Backup: false
- Reversible: true

## Structure Details:
- profiles: User metadata and roles
- elections: Election configuration and dates
- candidates: Candidate profiles linked to elections
- votes: Immutable voting records
- fraud_alerts: Rule-based security logs

## Security Implications:
- RLS Status: Enabled on all tables
- Policy Changes: Yes
- Auth Requirements: Supabase Auth integrated
*/

-- Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'voter' CHECK (role IN ('admin', 'voter')),
  has_voted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create elections table
CREATE TABLE IF NOT EXISTS public.elections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  expected_voters INTEGER DEFAULT 0,
  status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'active', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create candidates table
CREATE TABLE IF NOT EXISTS public.candidates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  election_id UUID REFERENCES public.elections ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  photo_url TEXT,
  department TEXT,
  position TEXT,
  manifesto TEXT,
  vote_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create votes table
CREATE TABLE IF NOT EXISTS public.votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  election_id UUID REFERENCES public.elections ON DELETE CASCADE NOT NULL,
  candidate_id UUID REFERENCES public.candidates ON DELETE CASCADE NOT NULL,
  voter_id UUID REFERENCES public.profiles ON DELETE CASCADE NOT NULL,
  voted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(election_id, voter_id)
);

-- Create fraud_alerts table
CREATE TABLE IF NOT EXISTS public.fraud_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  voter_id UUID REFERENCES public.profiles ON DELETE SET NULL,
  reason TEXT NOT NULL,
  risk_score INTEGER CHECK (risk_score BETWEEN 0 AND 100),
  alert_level TEXT CHECK (alert_level IN ('low', 'medium', 'high', 'critical')),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.elections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_alerts ENABLE ROW LEVEL SECURITY;

-- Policies for Profiles
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Policies for Elections
CREATE POLICY "Elections are viewable by everyone" ON public.elections FOR SELECT USING (true);
CREATE POLICY "Admins can manage elections" ON public.elections FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Policies for Candidates
CREATE POLICY "Candidates are viewable by everyone" ON public.candidates FOR SELECT USING (true);
CREATE POLICY "Admins can manage candidates" ON public.candidates FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Policies for Votes
CREATE POLICY "Users can view their own votes" ON public.votes FOR SELECT USING (auth.uid() = voter_id);
CREATE POLICY "Voters can cast votes" ON public.votes FOR INSERT WITH CHECK (
  auth.uid() = voter_id AND
  EXISTS (SELECT 1 FROM public.elections WHERE id = election_id AND status = 'active')
);

-- Policies for Fraud Alerts
CREATE POLICY "Admins can view fraud alerts" ON public.fraud_alerts FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Trigger for profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
