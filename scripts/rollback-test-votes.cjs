require('dotenv').config();
const { Client } = require('pg');

// Removes test ballots cast by mock students during verification so real
// tallies stay clean. NEVER run against real voter IDs.
const TEST_STUDENTS = ['OIS/STU/00001'];

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  for (const sid of TEST_STUDENTS) {
    const rows = await c.query('SELECT candidate_id FROM public.votes WHERE student_id = $1', [sid]);
    for (const r of rows.rows) {
      await c.query('UPDATE public.candidates SET secondary_vote_count = GREATEST(secondary_vote_count - 1, 0) WHERE id = $1', [r.candidate_id]);
    }
    await c.query('DELETE FROM public.votes WHERE student_id = $1', [sid]);
    await c.query('UPDATE public.secondary_students SET has_voted = false WHERE id = $1', [sid]);
    console.log(`ROLLED-BACK ${sid} ballots=${rows.rows.length}`);
  }
  const t = await c.query(
    'SELECT (SELECT count(*) FROM public.votes) v, (SELECT count(*) FROM public.secondary_students WHERE has_voted) s'
  );
  console.log(`votes=${t.rows[0].v} students_flagged=${t.rows[0].s}`);
  await c.end();
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
