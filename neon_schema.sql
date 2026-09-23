-- ═══════════════════════════════════════════════════════════════════════════
--  Oak International School — Election Platform Schema (Neon / Postgres)
--  Run this in the Neon SQL editor. Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Student rolls — one table per portal so the two elections never mix.
--    Secondary portal voters live here; primary portal voters in primary_students.
CREATE TABLE IF NOT EXISTS public.secondary_students (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    has_voted BOOLEAN DEFAULT FALSE NOT NULL
);

CREATE TABLE IF NOT EXISTS public.primary_students (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    has_voted BOOLEAN DEFAULT FALSE NOT NULL
);

-- 2. Candidates (photo_url holds a data-URL or https URL; Neon has no storage bucket)
CREATE TABLE IF NOT EXISTS public.candidates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    manifesto TEXT NOT NULL,
    photo_url TEXT NOT NULL,
    primary_vote_count INT DEFAULT 0 NOT NULL,
    secondary_vote_count INT DEFAULT 0 NOT NULL
);

-- 3. Admin PIN hashes (SHA-256 hex, never plaintext). Default PIN "5793".
-- One row per admin: any matching PIN unlocks Primary Voting / Admin Dashboard
-- and authorizes privileged API mutations (see api/_admin.js).
CREATE TABLE IF NOT EXISTS public.admin_secrets (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT INTO public.admin_secrets (key, value)
VALUES ('admin_pin_hash', '399bd91a2b1e5ebdb54a7aec97bc3f30c1c2a19a758556febf86ebe87bcfcd16')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.admin_pins (
    name TEXT PRIMARY KEY,
    pin_hash TEXT NOT NULL
);

-- Seed the multi-PIN table from the legacy single PIN (idempotent).
INSERT INTO public.admin_pins (name, pin_hash)
SELECT 'default', value FROM public.admin_secrets WHERE key = 'admin_pin_hash'
ON CONFLICT (name) DO NOTHING;

-- To add another admin PIN, run (replace with the new PIN's SHA-256 hex):
--   INSERT INTO public.admin_pins (name, pin_hash) VALUES ('admin-7', '<sha256-hex>');
-- To revoke one: DELETE FROM public.admin_pins WHERE name = 'admin-7';
-- Generate a hash locally with:
--   node -e "console.log(require('crypto').createHash('sha256').update('YourNewPin').digest('hex'))"

-- 4. Helpful indexes
CREATE INDEX IF NOT EXISTS idx_candidates_category ON public.candidates (category);

-- 5. Per-category ballots (secondary portal).
-- One row per (student, category): lets a student vote in every position
-- while blocking a second vote in the same position. secondary_students.has_voted
-- is only flipped once ALL positions are covered (see /api/vote-secondary).
CREATE TABLE IF NOT EXISTS public.votes (
    student_id TEXT NOT NULL REFERENCES public.secondary_students (id) ON DELETE CASCADE,
    candidate_id TEXT NOT NULL REFERENCES public.candidates (id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    PRIMARY KEY (student_id, category)
);
CREATE INDEX IF NOT EXISTS idx_votes_student ON public.votes (student_id);

-- 6. Political parties (logos set later via Admin; NULL = A/B letter badge).
CREATE TABLE IF NOT EXISTS public.parties (
    name TEXT PRIMARY KEY,
    short_code TEXT NOT NULL,
    logo_url TEXT
);

INSERT INTO public.parties (name, short_code, logo_url)
VALUES ('Democratic Union', 'A', NULL), ('Eagles', 'B', NULL)
ON CONFLICT (name) DO NOTHING;

-- 7. Candidate party + staff tally.
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS party TEXT;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS staff_vote_count INT DEFAULT 0 NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'candidates_party_fkey') THEN
        ALTER TABLE public.candidates
            ADD CONSTRAINT candidates_party_fkey FOREIGN KEY (party) REFERENCES public.parties (name);
    END IF;
END
$$;

-- 8. Staff roll (staff portal voters; separate from students so IDs can't cross).
CREATE TABLE IF NOT EXISTS public.staff (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    has_voted BOOLEAN DEFAULT FALSE NOT NULL
);

-- 9. Primary portal ballots (students vote by name search; one per position).
-- Tracks against primary_students; primary_students.has_voted flips once
-- every position is covered (see /api/vote-primary).
CREATE TABLE IF NOT EXISTS public.primary_votes (
    student_id TEXT NOT NULL REFERENCES public.primary_students (id) ON DELETE CASCADE,
    candidate_id TEXT NOT NULL REFERENCES public.candidates (id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    PRIMARY KEY (student_id, category)
);
CREATE INDEX IF NOT EXISTS idx_primary_votes_student ON public.primary_votes (student_id);

-- 10. Staff portal ballots (one per position per staff code).
CREATE TABLE IF NOT EXISTS public.staff_votes (
    staff_code TEXT NOT NULL REFERENCES public.staff (code) ON DELETE CASCADE,
    candidate_id TEXT NOT NULL REFERENCES public.candidates (id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    PRIMARY KEY (staff_code, category)
);
CREATE INDEX IF NOT EXISTS idx_staff_votes_staff ON public.staff_votes (staff_code);

-- 11. Prefect Council candidacy applications (digital candidacy form).
-- Files (photo/CV/results) are stored as data-URLs; see /api/candidacy limits.
CREATE TABLE IF NOT EXISTS public.candidacy_applications (
    id TEXT PRIMARY KEY,
    surname TEXT NOT NULL,
    given_names TEXT NOT NULL,
    gender TEXT NOT NULL,
    class TEXT NOT NULL,
    intended_post TEXT NOT NULL,
    held_post BOOLEAN DEFAULT FALSE NOT NULL,
    held_position TEXT DEFAULT '' NOT NULL,
    ran_before BOOLEAN DEFAULT FALSE NOT NULL,
    ran_position TEXT DEFAULT '' NOT NULL,
    disciplinary BOOLEAN DEFAULT FALSE NOT NULL,
    disciplinary_details TEXT DEFAULT '' NOT NULL,
    motivation TEXT NOT NULL,
    achievements TEXT DEFAULT '' NOT NULL,
    attest_name TEXT NOT NULL,
    photo_url TEXT NOT NULL,
    cv_file TEXT NOT NULL,
    cv_filename TEXT NOT NULL,
    cv_mimetype TEXT NOT NULL,
    results_file TEXT NOT NULL,
    results_filename TEXT NOT NULL,
    results_mimetype TEXT NOT NULL,
    signature_file TEXT,
    signature_filename TEXT DEFAULT '',
    signature_mimetype TEXT DEFAULT 'application/octet-stream',
    party TEXT,
    status TEXT DEFAULT 'pending' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_candidacy_status ON public.candidacy_applications (status);

-- Backfill for DBs created before signature columns existed.
ALTER TABLE public.candidacy_applications ADD COLUMN IF NOT EXISTS signature_file TEXT;
ALTER TABLE public.candidacy_applications ADD COLUMN IF NOT EXISTS signature_filename TEXT DEFAULT '';
ALTER TABLE public.candidacy_applications ADD COLUMN IF NOT EXISTS signature_mimetype TEXT DEFAULT 'application/octet-stream';
ALTER TABLE public.candidacy_applications ADD COLUMN IF NOT EXISTS party TEXT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'candidacy_party_fkey') THEN
        ALTER TABLE public.candidacy_applications
            ADD CONSTRAINT candidacy_party_fkey FOREIGN KEY (party) REFERENCES public.parties (name);
    END IF;
END
$$;
