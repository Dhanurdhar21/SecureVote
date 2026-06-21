-- ============================================================
-- Account Linking Migration
-- Ensures one canonical account per verified email address,
-- merging data from duplicate OAuth/Email accounts.
-- ============================================================

-- 1. Add canonical_id and linked_providers to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS canonical_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_providers TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_merged BOOLEAN DEFAULT FALSE;

-- 2. Core merge function: reassigns all data from duplicate → canonical
CREATE OR REPLACE FUNCTION public.merge_duplicate_account(
  p_duplicate_id UUID,
  p_canonical_id UUID
)
RETURNS VOID AS $$
BEGIN
  -- Skip if both IDs are the same
  IF p_duplicate_id = p_canonical_id THEN
    RETURN;
  END IF;

  -- Reassign elections created by the duplicate user
  UPDATE public.elections
    SET created_by = p_canonical_id
    WHERE created_by = p_duplicate_id;

  -- Reassign votes cast by the duplicate user
  UPDATE public.votes
    SET voter_id = p_canonical_id
    WHERE voter_id = p_duplicate_id
      AND NOT EXISTS (
        SELECT 1 FROM public.votes v2
        WHERE v2.election_id = votes.election_id
          AND v2.voter_id = p_canonical_id
      );

  -- Reassign fraud alert user references
  UPDATE public.fraud_alerts
    SET user_id = p_canonical_id
    WHERE user_id = p_duplicate_id;

  -- Merge linked providers from duplicate into canonical
  UPDATE public.profiles
    SET linked_providers = ARRAY(
      SELECT DISTINCT unnest(
        COALESCE(linked_providers, '{}') ||
        (SELECT COALESCE(linked_providers, '{}') FROM public.profiles WHERE id = p_duplicate_id)
      )
    )
    WHERE id = p_canonical_id;

  -- Mark duplicate profile as merged
  UPDATE public.profiles
    SET
      canonical_id  = p_canonical_id,
      is_merged     = TRUE
    WHERE id = p_duplicate_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Grant RPC access to authenticated users (called client-side via .rpc())
GRANT EXECUTE ON FUNCTION public.merge_duplicate_account(UUID, UUID) TO authenticated;

-- 4. Helper function: find canonical profile id by email
CREATE OR REPLACE FUNCTION public.get_canonical_profile_id(p_email TEXT)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id
  FROM public.profiles
  WHERE email = p_email
    AND (is_merged IS NULL OR is_merged = FALSE)
  ORDER BY created_at ASC   -- oldest account is canonical
  LIMIT 1;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_canonical_profile_id(TEXT) TO authenticated;

-- 5. Update the handle_new_user trigger to auto-detect duplicates
--    and mark the new account as needing a merge immediately.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_existing_id UUID;
  v_provider    TEXT;
BEGIN
  -- Determine the provider from raw_app_meta_data
  v_provider := COALESCE(new.raw_app_meta_data->>'provider', 'email');

  -- Check if a profile already exists with this email
  SELECT id INTO v_existing_id
  FROM public.profiles
  WHERE email = new.email
    AND id <> new.id
    AND (is_merged IS NULL OR is_merged = FALSE)
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- A canonical account already exists — create a thin profile for the
    -- new auth.users row and immediately mark it for client-side merge.
    INSERT INTO public.profiles (id, email, full_name, role, linked_providers, canonical_id, is_merged)
    VALUES (
      new.id,
      new.email,
      COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
      (SELECT role FROM public.profiles WHERE id = v_existing_id),
      ARRAY[v_provider],
      v_existing_id,
      FALSE  -- client will call merge_duplicate_account after login
    )
    ON CONFLICT (id) DO NOTHING;
  ELSE
    -- No duplicate — create a fresh profile as normal
    INSERT INTO public.profiles (id, email, full_name, role, linked_providers)
    VALUES (
      new.id,
      new.email,
      COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
      COALESCE((new.raw_user_meta_data->>'role')::TEXT, 'voter'),
      ARRAY[v_provider]
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-attach the trigger (it already exists, replace it)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. RLS: allow users to read their own profile even if is_merged=true
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
