-- Migration: Add eligible_voters and voter_wallets for MetaMask integration

-- 1. Add organization_name to elections if missing
ALTER TABLE public.elections 
ADD COLUMN IF NOT EXISTS organization_name TEXT;

-- 2. Create eligible_voters table
CREATE TABLE IF NOT EXISTS public.eligible_voters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id UUID NOT NULL REFERENCES public.elections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  has_voted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(election_id, email)
);

-- 3. Create voter_wallets table
CREATE TABLE IF NOT EXISTS public.voter_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voter_email TEXT NOT NULL,
  election_id UUID NOT NULL REFERENCES public.elections(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(election_id, voter_email)
);

-- 4. Enable RLS
ALTER TABLE public.eligible_voters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voter_wallets ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
-- Admins can manage eligible voters
CREATE POLICY "Admins can manage eligible_voters" ON public.eligible_voters 
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Voters can read their own eligibility
CREATE POLICY "Voters can read own eligibility" ON public.eligible_voters
FOR SELECT USING (
  email = (
    SELECT email FROM public.profiles 
    WHERE id = auth.uid()
  )
);

-- Voters can insert and read their own wallets
CREATE POLICY "Voters can manage their own wallets" ON public.voter_wallets
FOR ALL USING (
  voter_email = (
    SELECT email FROM public.profiles 
    WHERE id = auth.uid()
  )
);

-- Admins can read all wallets
CREATE POLICY "Admins can view wallets" ON public.voter_wallets
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- 6. Storage Bucket for Candidate Photos
INSERT INTO storage.buckets (id, name, public) 
VALUES ('candidate-photos', 'candidate-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies for candidate-photos
CREATE POLICY "Public read access to candidate photos" ON storage.objects
FOR SELECT USING (bucket_id = 'candidate-photos');

CREATE POLICY "Admins can upload candidate photos" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'candidate-photos' AND 
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Admins can update candidate photos" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'candidate-photos' AND 
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Admins can delete candidate photos" ON storage.objects
FOR DELETE USING (
  bucket_id = 'candidate-photos' AND 
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  )
);
