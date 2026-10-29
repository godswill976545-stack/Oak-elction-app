-- ═══════════════════════════════════════════════════════════════════════════
--  Oak International School — Election Platform Schema (Cloudflare D1/SQLite)
--  Parity with neon_schema.sql: same 11 tables, same columns. Adaptations:
--    BOOLEAN  -> INTEGER (0/1)
--    TIMESTAMPTZ -> TEXT ISO-8601 (UTC) with strftime default
--    BYTEA media / data-URL attachment columns -> R2 object keys (photo_key…)
--  Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- Parties first: candidates.candidacy rows reference parties(name).
CREATE TABLE IF NOT EXISTS parties (
    name TEXT PRIMARY KEY,
    short_code TEXT NOT NULL,
    logo_url TEXT,
    logo_key TEXT,
    logo_mime TEXT,
    logo_updated_at INTEGER
);

INSERT INTO parties (name, short_code, logo_url, logo_key, logo_mime)
VALUES ('Democratic Union', 'A', NULL, NULL, NULL),
       ('Eagles of Freedom', 'B', NULL, NULL, NULL)
ON CONFLICT (name) DO NOTHING;

-- Candidates. photo_url is only for externally hosted images; uploaded photos
-- are R2 objects addressed by photo_key and served by /api/media.
CREATE TABLE IF NOT EXISTS candidates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    manifesto TEXT NOT NULL,
    photo_url TEXT NOT NULL DEFAULT '',
    primary_vote_count INTEGER DEFAULT 0 NOT NULL,
    secondary_vote_count INTEGER DEFAULT 0 NOT NULL,
    party TEXT REFERENCES parties (name),
    staff_vote_count INTEGER DEFAULT 0 NOT NULL,
    photo_key TEXT,
    photo_mime TEXT,
    application_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_candidates_category ON candidates (category);

-- Admin PIN hashes (SHA-256 hex, never plaintext). Seeded out of band via
-- scripts/set-admin-pin.mjs — this file intentionally ships no default PIN.
CREATE TABLE IF NOT EXISTS admin_secrets (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_pins (
    name TEXT PRIMARY KEY,
    pin_hash TEXT NOT NULL
);

-- Student rolls — one table per portal so the two elections never mix.
-- `class` holds the grade (1A-6C primary, 7A-12B secondary).
CREATE TABLE IF NOT EXISTS secondary_students (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    class TEXT,
    has_voted INTEGER DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS primary_students (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    class TEXT,
    has_voted INTEGER DEFAULT 0 NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_primary_students_class ON primary_students (class, name);
CREATE INDEX IF NOT EXISTS idx_secondary_students_class ON secondary_students (class, name);

-- Staff roll (staff portal voters; separate from students so IDs can't cross).
CREATE TABLE IF NOT EXISTS staff (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    department TEXT,
    has_voted INTEGER DEFAULT 0 NOT NULL
);

-- Per-category ballots (secondary portal). One row per (student, category):
-- lets a student vote in every position while blocking a second vote in the
-- same position. secondary_students.has_voted flips once ALL positions are
-- covered (see /api/vote-secondary).
CREATE TABLE IF NOT EXISTS votes (
    student_id TEXT NOT NULL REFERENCES secondary_students (id) ON DELETE CASCADE,
    candidate_id TEXT NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
    PRIMARY KEY (student_id, category)
);
CREATE INDEX IF NOT EXISTS idx_votes_student ON votes (student_id);

-- Primary portal ballots (students vote by name search). One row per
-- (student, category) for real voters, enforced by a PARTIAL unique index
-- that exempts DEMO-% students: they are demo voters allowed to vote an
-- unlimited number of times. primary_students.has_voted flips once ALL
-- positions are covered for real voters (see /api/students-search and
-- /api/vote-primary); demo voters never flip.
CREATE TABLE IF NOT EXISTS primary_votes (
    student_id TEXT NOT NULL REFERENCES primary_students (id) ON DELETE CASCADE,
    candidate_id TEXT NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_primary_votes_one_per_voter
    ON primary_votes (student_id, category) WHERE student_id NOT LIKE 'DEMO-%';
CREATE INDEX IF NOT EXISTS idx_primary_votes_student ON primary_votes (student_id);

-- Staff portal ballots (one per position per staff code).
CREATE TABLE IF NOT EXISTS staff_votes (
    staff_code TEXT NOT NULL REFERENCES staff (code) ON DELETE CASCADE,
    candidate_id TEXT NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
    PRIMARY KEY (staff_code, category)
);
CREATE INDEX IF NOT EXISTS idx_staff_votes_staff ON staff_votes (staff_code);

-- Prefect Council candidacy applications (digital candidacy form).
-- Attachments (photo/CV/results/signature) are R2 objects addressed by
-- *_key; the DB stores only keys, filenames and mimetypes. This keeps every
-- row far below D1's 2MB row cap.
CREATE TABLE IF NOT EXISTS candidacy_applications (
    id TEXT PRIMARY KEY,
    surname TEXT NOT NULL,
    given_names TEXT NOT NULL,
    gender TEXT NOT NULL,
    class TEXT NOT NULL,
    intended_post TEXT NOT NULL,
    held_post INTEGER DEFAULT 0 NOT NULL,
    held_position TEXT DEFAULT '' NOT NULL,
    ran_before INTEGER DEFAULT 0 NOT NULL,
    ran_position TEXT DEFAULT '' NOT NULL,
    disciplinary INTEGER DEFAULT 0 NOT NULL,
    disciplinary_details TEXT DEFAULT '' NOT NULL,
    motivation TEXT NOT NULL,
    achievements TEXT DEFAULT '' NOT NULL,
    attest_name TEXT NOT NULL,
    photo_key TEXT NOT NULL,
    cv_key TEXT NOT NULL,
    cv_filename TEXT NOT NULL,
    cv_mimetype TEXT NOT NULL,
    results_key TEXT NOT NULL,
    results_filename TEXT NOT NULL,
    results_mimetype TEXT NOT NULL,
    signature_key TEXT,
    signature_filename TEXT DEFAULT '',
    signature_mimetype TEXT DEFAULT 'application/octet-stream',
    party TEXT REFERENCES parties (name),
    status TEXT DEFAULT 'pending' NOT NULL,
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_candidacy_status ON candidacy_applications (status);
