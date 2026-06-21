-- Allow admins to view votes for their own elections to generate live charts
-- Note: They can only see votes for elections they created.

DROP POLICY IF EXISTS "Admins can view votes for their elections" ON public.votes;

CREATE POLICY "Admins can view votes for their elections" 
ON public.votes 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.elections 
    WHERE id = votes.election_id 
    AND created_by = auth.uid()
  )
);
