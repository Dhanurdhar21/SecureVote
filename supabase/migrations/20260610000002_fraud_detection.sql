-- Migration: Add election_id to fraud_alerts and update policies

-- 1. Add election_id column
ALTER TABLE public.fraud_alerts 
ADD COLUMN IF NOT EXISTS election_id UUID REFERENCES public.elections(id) ON DELETE CASCADE;

-- 2. Drop existing policies to recreate them cleanly
DROP POLICY IF EXISTS "Admins can view fraud alerts" ON public.fraud_alerts;
DROP POLICY IF EXISTS "System can insert fraud alerts" ON public.fraud_alerts;
DROP POLICY IF EXISTS "Anyone can insert fraud alerts" ON public.fraud_alerts;

-- 3. Ensure RLS is enabled
ALTER TABLE public.fraud_alerts ENABLE ROW LEVEL SECURITY;

-- 4. Create policy for Admins to view only alerts for elections they created
CREATE POLICY "Admins can view fraud alerts for their elections" 
ON public.fraud_alerts 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.elections 
    WHERE id = fraud_alerts.election_id 
    AND created_by = auth.uid()
  )
);

-- 5. Create policy allowing insertion of fraud alerts by anyone (needed for unauthenticated login attempts)
CREATE POLICY "Anyone can insert fraud alerts" 
ON public.fraud_alerts 
FOR INSERT 
WITH CHECK (true);
