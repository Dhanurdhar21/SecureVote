-- Migration: Complete Final Schema Sync
-- This migration brings the database into 100% alignment with the application code.

-- 1. Fix user_role ENUM to include 'voter'
DO $$ 
BEGIN
    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'voter';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role user_role DEFAULT 'voter',
  has_voted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure default role is 'voter' rather than 'student'
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'voter';

-- 3. Elections Table
CREATE TABLE IF NOT EXISTS public.elections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  expected_voters INTEGER DEFAULT 0,
  status TEXT DEFAULT 'upcoming',
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  organization_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.elections ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.elections ADD COLUMN IF NOT EXISTS organization_name TEXT;

-- 4. Candidates Table
CREATE TABLE IF NOT EXISTS public.candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id UUID REFERENCES public.elections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  photo_url TEXT,
  department TEXT,
  position TEXT,
  manifesto TEXT,
  vote_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Eligible Voters Table
CREATE TABLE IF NOT EXISTS public.eligible_voters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id UUID NOT NULL REFERENCES public.elections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  has_voted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(election_id, email)
);

-- 6. Voter Wallets Table
CREATE TABLE IF NOT EXISTS public.voter_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voter_email TEXT NOT NULL,
  election_id UUID NOT NULL REFERENCES public.elections(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(election_id, voter_email)
);

-- 7. Votes Table Sync
CREATE TABLE IF NOT EXISTS public.votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id UUID REFERENCES public.elections(id) ON DELETE CASCADE,
  candidate_id UUID REFERENCES public.candidates(id) ON DELETE CASCADE,
  voter_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  voted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(election_id, voter_id)
);

-- Handle existing legacy table structure gracefully:
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='votes' AND column_name='student_id') THEN
        ALTER TABLE public.votes RENAME COLUMN student_id TO voter_id;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='votes' AND column_name='timestamp') THEN
        ALTER TABLE public.votes RENAME COLUMN timestamp TO voted_at;
    END IF;
END $$;

ALTER TABLE public.votes DROP COLUMN IF EXISTS reference_number;

-- Ensure constraints match expected structure
ALTER TABLE public.votes DROP CONSTRAINT IF EXISTS votes_election_id_student_id_key;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'votes_election_id_voter_id_key'
    ) THEN
        ALTER TABLE public.votes ADD CONSTRAINT votes_election_id_voter_id_key UNIQUE(election_id, voter_id);
    END IF;
END $$;

-- 8. Fraud Alerts Table Sync
CREATE TABLE IF NOT EXISTS public.fraud_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  risk_score INTEGER CHECK (risk_score >= 0 AND risk_score <= 100),
  alert_level TEXT DEFAULT 'low',
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Handle existing legacy table structure:
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fraud_alerts' AND column_name='user_id') THEN
        ALTER TABLE public.fraud_alerts RENAME COLUMN user_id TO voter_id;
    END IF;
END $$;


-- 9. Storage Buckets Sync
INSERT INTO storage.buckets (id, name, public) 
VALUES ('candidate-photos', 'candidate-photos', true)
ON CONFLICT (id) DO NOTHING;

-- 10. Re-apply Comprehensive RLS Policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.elections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eligible_voters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voter_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_alerts ENABLE ROW LEVEL SECURITY;

-- Drop conflicting policies gracefully if they exist
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Elections are viewable by everyone" ON public.elections;
DROP POLICY IF EXISTS "Admins can manage elections" ON public.elections;
DROP POLICY IF EXISTS "Candidates are viewable by everyone" ON public.candidates;
DROP POLICY IF EXISTS "Admins can manage candidates" ON public.candidates;
DROP POLICY IF EXISTS "Users can view their own votes" ON public.votes;
DROP POLICY IF EXISTS "Students can cast votes" ON public.votes;
DROP POLICY IF EXISTS "Voters can cast votes" ON public.votes;
DROP POLICY IF EXISTS "Admins can view fraud alerts" ON public.fraud_alerts;
DROP POLICY IF EXISTS "Admins can manage eligible_voters" ON public.eligible_voters;
DROP POLICY IF EXISTS "Voters can read own eligibility" ON public.eligible_voters;
DROP POLICY IF EXISTS "Voters can update their own eligibility" ON public.eligible_voters;
DROP POLICY IF EXISTS "Voters can manage their own wallets" ON public.voter_wallets;
DROP POLICY IF EXISTS "Admins can view wallets" ON public.voter_wallets;

-- Recreate standard secure policies
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Elections are viewable by everyone" ON public.elections FOR SELECT USING (true);
CREATE POLICY "Admins can manage elections" ON public.elections ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Candidates are viewable by everyone" ON public.candidates FOR SELECT USING (true);
CREATE POLICY "Admins can manage candidates" ON public.candidates ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Admins can manage eligible_voters" ON public.eligible_voters FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Voters can read own eligibility" ON public.eligible_voters FOR SELECT USING (
  email = (SELECT email FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "Voters can update their own eligibility" ON public.eligible_voters FOR UPDATE USING (
  email = (SELECT email FROM public.profiles WHERE id = auth.uid())
);

CREATE POLICY "Voters can manage their own wallets" ON public.voter_wallets FOR ALL USING (
  voter_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "Admins can view wallets" ON public.voter_wallets FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Users can view their own votes" ON public.votes FOR SELECT USING (auth.uid() = voter_id);
CREATE POLICY "Voters can cast votes" ON public.votes FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'voter')
);

CREATE POLICY "Admins can view fraud alerts" ON public.fraud_alerts FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Trigger for profile creation: Re-sync to allow 'voter' role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', 
    COALESCE((new.raw_user_meta_data->>'role')::user_role, 'voter'))
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
