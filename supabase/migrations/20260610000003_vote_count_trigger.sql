-- Create a secure function to increment candidate vote_count
CREATE OR REPLACE FUNCTION increment_candidate_votes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.candidates
  SET vote_count = vote_count + 1
  WHERE id = NEW.candidate_id;
  RETURN NEW;
END;
$$;

-- Create the trigger on the votes table
DROP TRIGGER IF EXISTS on_vote_inserted ON public.votes;
CREATE TRIGGER on_vote_inserted
AFTER INSERT ON public.votes
FOR EACH ROW
EXECUTE FUNCTION increment_candidate_votes();

-- Recount all existing votes to fix any missed counts
UPDATE public.candidates c
SET vote_count = (
  SELECT COUNT(*)
  FROM public.votes v
  WHERE v.candidate_id = c.id
);
