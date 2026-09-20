-- ═══════════════════════════════════════════════════════════════════════════
--  Oak International School — Election Platform Schema
--  This script is idempotent: every statement is safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Students
CREATE TABLE IF NOT EXISTS public.students (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    has_voted BOOLEAN DEFAULT FALSE NOT NULL
);

-- 2. Candidates
CREATE TABLE IF NOT EXISTS public.candidates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    manifesto TEXT NOT NULL,
    photo_url TEXT NOT NULL,
    primary_vote_count INT DEFAULT 0 NOT NULL,
    secondary_vote_count INT DEFAULT 0 NOT NULL
);

-- 3. Realtime publication (no-op if already added)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'candidates'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.candidates;
    END IF;
END
$$;

-- 4. Storage bucket for candidate portraits
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 5. Storage policies (drop first to avoid "policy already exists" on re-run)
DROP POLICY IF EXISTS "Public View Settings"   ON storage.objects;
DROP POLICY IF EXISTS "Public Upload Settings" ON storage.objects;

CREATE POLICY "Public View Settings"
    ON storage.objects FOR SELECT
    USING ( bucket_id = 'avatars' );

CREATE POLICY "Public Upload Settings"
    ON storage.objects FOR INSERT
    WITH CHECK ( bucket_id = 'avatars' );

-- 6. RLS off for app tables (idempotent)
ALTER TABLE public.students   DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates DISABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Server-side admin PIN verification
-- ═══════════════════════════════════════════════════════════════════════════
-- Why a table (not a GUC):
--   On Supabase, ALTER DATABASE ... SET app.admin_pin = '...' returns
--   "42501 permission denied to set parameter" because the SQL editor role
--   isn't allowed to register custom GUCs, and the default DB is locked.
--   A controlled table works under the standard Supabase roles and keeps
--   the secret out of the client bundle.

-- 7a. The PIN is stored as a SHA-256 hash, never plaintext.
CREATE TABLE IF NOT EXISTS public.admin_secrets (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- RLS on: anon can only call the SECURITY DEFINER functions below,
-- never read the table directly.
ALTER TABLE public.admin_secrets ENABLE ROW LEVEL SECURITY;

-- 7b. Seed default PIN ("5793", matching the previous hardcoded value).
--     Replace with:  SELECT public.admin_set_pin('YourNewPin');
INSERT INTO public.admin_secrets (key, value)
VALUES ('admin_pin_hash', encode(digest('5793', 'sha256'), 'hex'))
ON CONFLICT (key) DO NOTHING;

-- 7c. Privileged helper to (re)set the PIN. Plaintext is hashed
--     immediately; the function never returns it.
CREATE OR REPLACE FUNCTION public.admin_set_pin(new_pin TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.admin_secrets (key, value)
    VALUES ('admin_pin_hash', encode(digest(new_pin, 'sha256'), 'hex'))
    ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value;
END;
$$;

-- 7d. Anonymous-callable verifier. Hashes the submitted PIN, compares
--     against the stored hash with a constant-time check.
CREATE OR REPLACE FUNCTION public.verify_admin_pin(submitted_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    expected_hash   TEXT;
    submitted_hash  TEXT;
BEGIN
    SELECT value INTO expected_hash
    FROM public.admin_secrets
    WHERE key = 'admin_pin_hash';

    -- Fail-closed: if the row is missing or empty, deny.
    IF expected_hash IS NULL OR expected_hash = '' THEN
        RETURN FALSE;
    END IF;

    submitted_hash := encode(digest(submitted_pin, 'sha256'), 'hex');

    -- Constant-time compare: same length + hashed equality of both
    -- orderings. Avoids early-exit timing leaks from a naive `=`.
    RETURN (
        length(submitted_hash) = length(expected_hash)
        AND encode(digest(submitted_hash || ':' || expected_hash, 'sha256'), 'hex')
          = encode(digest(expected_hash || ':' || submitted_hash, 'sha256'), 'hex')
    );
END;
$$;

-- 7e. Privileges. Idempotent (GRANT is safe to re-run).
GRANT EXECUTE ON FUNCTION public.verify_admin_pin(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_pin(TEXT)   TO postgres, service_role;
