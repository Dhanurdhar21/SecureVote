-- Supabase Migration: Blockchain Audit & Verification System (Corrected)

-- 1. Add blockchain deployment tracking to elections table (safe updates)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'elections' AND column_name = 'contract_election_id') THEN
        ALTER TABLE public.elections ADD COLUMN contract_election_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'elections' AND column_name = 'is_on_chain') THEN
        ALTER TABLE public.elections ADD COLUMN is_on_chain BOOLEAN DEFAULT false;
    END IF;
END $$;

-- 2. Create vote_audit table for blockchain transaction tracking safely
CREATE TABLE IF NOT EXISTS public.vote_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    election_id UUID REFERENCES public.elections(id) ON DELETE CASCADE,
    candidate_id UUID REFERENCES public.candidates(id) ON DELETE CASCADE,
    wallet_address TEXT NOT NULL,
    vote_hash TEXT NOT NULL,
    transaction_hash TEXT NOT NULL UNIQUE,
    block_number BIGINT NOT NULL,
    chain_id INTEGER NOT NULL DEFAULT 11155111, -- Sepolia default
    created_at TIMESTAMPTZ DEFAULT now(),
    verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'failed'))
);

-- 3. Create indexes safely
CREATE INDEX IF NOT EXISTS idx_vote_audit_election_id ON public.vote_audit(election_id);
CREATE INDEX IF NOT EXISTS idx_vote_audit_wallet ON public.vote_audit(wallet_address);
CREATE INDEX IF NOT EXISTS idx_vote_audit_tx ON public.vote_audit(transaction_hash);

-- Enable RLS
ALTER TABLE public.vote_audit ENABLE ROW LEVEL SECURITY;

-- 4 & 5. Drop existing policies before creating to ensure idempotent migration
DROP POLICY IF EXISTS "Admins can view all vote audits" ON public.vote_audit;
DROP POLICY IF EXISTS "Voters can view their own audits" ON public.vote_audit;
DROP POLICY IF EXISTS "Authenticated users can insert audit records" ON public.vote_audit;

-- Admins can view all audits for elections they created
CREATE POLICY "Admins can view all vote audits"
ON public.vote_audit FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.elections 
        WHERE elections.id = vote_audit.election_id 
        AND elections.created_by = auth.uid()
    )
);

-- Voters can only view their own audits using email from profiles joined with voter_wallets
CREATE POLICY "Voters can view their own audits"
ON public.vote_audit FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.voter_wallets vw
        JOIN public.profiles p ON p.email = vw.voter_email
        WHERE vw.wallet_address = vote_audit.wallet_address
        AND p.id = auth.uid()
    )
);

-- Anyone authenticated can insert (they insert their own receipt after voting)
CREATE POLICY "Authenticated users can insert audit records"
ON public.vote_audit FOR INSERT
TO authenticated
WITH CHECK (true);

-- 7. Verification Query (for reference)
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'elections' AND column_name IN ('is_on_chain', 'contract_election_id');
-- SELECT count(*) FROM public.vote_audit;
