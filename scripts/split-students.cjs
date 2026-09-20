require('dotenv').config();
const { Client } = require('pg');

// One-off split: shared `students` table -> `primary_students` +
// `secondary_students`. Copies every row (preserving each portal's voted
// flag), rewires the ballot FKs, then drops the old table. Safe to re-run:
// if `students` is already gone it only verifies.
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  await c.query(`
    CREATE TABLE IF NOT EXISTS public.primary_students (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      has_voted BOOLEAN DEFAULT FALSE NOT NULL
    );
    CREATE TABLE IF NOT EXISTS public.secondary_students (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      has_voted BOOLEAN DEFAULT FALSE NOT NULL
    );`);

  const legacy = await c.query(`SELECT to_regclass('public.students') AS t`);
  if (legacy.rows[0].t) {
    const src = await c.query(
      'SELECT count(*) AS n FROM public.students'
    );
    console.log(`legacy students=${src.rows[0].n} — copying...`);

    await c.query(`
      INSERT INTO public.secondary_students (id, name, has_voted)
      SELECT id, name, has_voted FROM public.students
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, has_voted = EXCLUDED.has_voted;
      INSERT INTO public.primary_students (id, name, has_voted)
      SELECT id, name, primary_has_voted FROM public.students
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, has_voted = EXCLUDED.has_voted;`);

    const chk = await c.query(`
      SELECT (SELECT count(*) FROM public.students) AS s,
             (SELECT count(*) FROM public.primary_students) AS p,
             (SELECT count(*) FROM public.secondary_students) AS sec`);
    const { s, p, sec } = chk.rows[0];
    console.log(`counts legacy=${s} primary=${p} secondary=${sec}`);
    if (Number(p) < Number(s) || Number(sec) < Number(s)) {
      throw new Error('Row counts do not match — aborting before drop.');
    }

    await c.query('ALTER TABLE public.votes DROP CONSTRAINT IF EXISTS votes_student_id_fkey');
    await c.query('ALTER TABLE public.primary_votes DROP CONSTRAINT IF EXISTS primary_votes_student_id_fkey');
    await c.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'votes_student_id_fkey') THEN
          ALTER TABLE public.votes ADD CONSTRAINT votes_student_id_fkey
            FOREIGN KEY (student_id) REFERENCES public.secondary_students (id) ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'primary_votes_student_id_fkey') THEN
          ALTER TABLE public.primary_votes ADD CONSTRAINT primary_votes_student_id_fkey
            FOREIGN KEY (student_id) REFERENCES public.primary_students (id) ON DELETE CASCADE;
        END IF;
      END $$;`);

    // Every ballot must still resolve after the rewire.
    const orph = await c.query(`
      SELECT (SELECT count(*) FROM public.votes v LEFT JOIN public.secondary_students s ON s.id = v.student_id WHERE s.id IS NULL) AS v,
             (SELECT count(*) FROM public.primary_votes p LEFT JOIN public.primary_students s ON s.id = p.student_id WHERE s.id IS NULL) AS pv`);
    console.log(`orphans secondary_votes=${orph.rows[0].v} primary_votes=${orph.rows[0].pv}`);
    if (Number(orph.rows[0].v) > 0 || Number(orph.rows[0].pv) > 0) {
      throw new Error('Orphan ballots found — aborting before drop.');
    }

    await c.query('DROP TABLE public.students');
    console.log('dropped legacy students table');
  } else {
    console.log('legacy students table already gone — verify only');
  }

  const fin = await c.query(`
    SELECT (SELECT count(*) FROM public.primary_students) AS p,
           (SELECT count(*) FROM public.secondary_students) AS sec,
           (SELECT count(*) FROM public.votes) AS v,
           (SELECT count(*) FROM public.primary_votes) AS pv`);
  console.log(`FINAL primary=${fin.rows[0].p} secondary=${fin.rows[0].sec} votes=${fin.rows[0].v} primary_votes=${fin.rows[0].pv}`);
  await c.end();
})().catch((e) => {
  console.error('SPLIT-FAIL', e.message);
  process.exit(1);
});
