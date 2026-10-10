-- ═══════════════════════════════════════════════════════════════════════════
--  Oak International School — Election Platform Schema (Neon / Postgres)
--  Run this in the Neon SQL editor. Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Student rolls — one table per portal so the two elections never mix.
--    Secondary portal voters live here; primary portal voters in primary_students.
--    `class` holds the grade (1A-6C primary, 7A-12B secondary) so rolls read
--    in grade order; both tables are CLUSTERED on (class, name).
CREATE TABLE IF NOT EXISTS public.secondary_students (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    class TEXT,
    has_voted BOOLEAN DEFAULT FALSE NOT NULL
);

CREATE TABLE IF NOT EXISTS public.primary_students (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    class TEXT,
    has_voted BOOLEAN DEFAULT FALSE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_primary_students_class ON primary_students (lpad(class, 3, '0'), name);
CREATE INDEX IF NOT EXISTS idx_secondary_students_class ON secondary_students (lpad(class, 3, '0'), name);

-- The primary portal searches names with ILIKE '%term%', which no btree index
-- can serve — it scans the whole roll on every keystroke. A trigram GIN index
-- turns that into an index lookup. pg_trgm is a stock extension on Neon.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_primary_students_name_trgm
    ON primary_students USING GIN (name gin_trgm_ops);

-- 2. Candidates. Media lives in `photo`/`party.logo` as BYTEA and is served by
--    /api/media with immutable cache headers.
--    photo_url is retained only for externally hosted images (an https URL).
--    It previously held base64 data-URLs inline, which made /api/candidates
--    return ~26MB and re-send it on every poll — see the BYTEA block at the end.
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
VALUES ('Democratic Union', 'A', NULL), ('Eagles of Freedom', 'B', NULL)
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

-- ─── Media moved out of the JSON payloads ────────────────────────────────────
-- Candidate photos and party logos were stored as base64 data-URLs in TEXT
-- columns and returned inline by /api/candidates. With 25 candidates that made
-- a single list response ~26MB, which the ballot screen then re-downloaded on
-- every poll — minutes of loading on a school network.
--
-- Binary now lives in BYTEA and is served by /api/media, which sends
-- immutable cache headers so the browser fetches each image exactly once.
-- The original TEXT columns are left in place (data-URLs are blanked below
-- after decoding) so older code paths degrade instead of exploding.

ALTER TABLE public.candidates
    ADD COLUMN IF NOT EXISTS photo BYTEA,
    ADD COLUMN IF NOT EXISTS photo_mime TEXT;

ALTER TABLE public.parties
    ADD COLUMN IF NOT EXISTS logo BYTEA,
    ADD COLUMN IF NOT EXISTS logo_mime TEXT;

-- Decode any data-URL still sitting in the TEXT columns into BYTEA.
-- regexp_replace strips the "data:<mime>;base64," prefix and leaves the payload
-- untouched, including any line breaks; decode() ignores base64 whitespace.
UPDATE public.candidates
SET photo = decode(regexp_replace(photo_url, '^data:[^;,]+;base64,', ''), 'base64'),
    photo_mime = substring(photo_url from '^data:([^;,]+);base64,')
WHERE photo_url LIKE 'data:%' AND photo IS NULL;

UPDATE public.parties
SET logo = decode(regexp_replace(logo_url, '^data:[^;,]+;base64,', ''), 'base64'),
    logo_mime = substring(logo_url from '^data:([^;,]+);base64,')
WHERE logo_url LIKE 'data:%' AND logo IS NULL;

-- Blank the base64 blobs out of the TEXT columns so no list query can ever
-- drag 26MB again. /api/candidates serves the BYTEA copy instead.
UPDATE public.candidates SET photo_url = '' WHERE photo_url LIKE 'data:%' AND photo IS NOT NULL;
UPDATE public.parties SET logo_url = '' WHERE logo_url LIKE 'data:%' AND logo IS NOT NULL;

-- photo_url is NOT NULL; keep direct inserts that omit it working.
ALTER TABLE public.candidates ALTER COLUMN photo_url SET DEFAULT '';
