-- Create function to sync all election statuses
CREATE OR REPLACE FUNCTION public.sync_election_statuses()
RETURNS void AS $$
BEGIN
  UPDATE public.elections
  SET status = CASE
    WHEN now() < start_date THEN 'upcoming'
    WHEN now() >= start_date AND now() <= end_date THEN 'active'
    WHEN now() > end_date THEN 'completed'
  END
  WHERE status IS DISTINCT FROM CASE
    WHEN now() < start_date THEN 'upcoming'
    WHEN now() >= start_date AND now() <= end_date THEN 'active'
    WHEN now() > end_date THEN 'completed'
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to handle initial insert or updates to dates
CREATE OR REPLACE FUNCTION public.set_initial_election_status()
RETURNS TRIGGER AS $$
BEGIN
  NEW.status = CASE
    WHEN now() < NEW.start_date THEN 'upcoming'
    WHEN now() >= NEW.start_date AND now() <= NEW.end_date THEN 'active'
    WHEN now() > NEW.end_date THEN 'completed'
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on elections table
DROP TRIGGER IF EXISTS trg_set_initial_election_status ON public.elections;
CREATE TRIGGER trg_set_initial_election_status
BEFORE INSERT OR UPDATE OF start_date, end_date ON public.elections
FOR EACH ROW
EXECUTE FUNCTION public.set_initial_election_status();

-- Update votes table RLS to use dates instead of status column
DROP POLICY IF EXISTS "Voters can cast votes" ON public.votes;
CREATE POLICY "Voters can cast votes" ON public.votes FOR INSERT WITH CHECK (
  auth.uid() = voter_id AND
  EXISTS (
    SELECT 1 FROM public.elections 
    WHERE id = election_id 
    AND now() >= start_date 
    AND now() <= end_date
  )
);
