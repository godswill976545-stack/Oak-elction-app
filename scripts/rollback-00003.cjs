require('dotenv').config();
const { Client } = require('pg');

// One-off rollback for the split-verification ballots (OIS/STU/00003).
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const sid = 'OIS/STU/00003';
  const sec = await c.query('SELECT candidate_id FROM public.votes WHERE student_id = $1', [sid]);
  for (const r of sec.rows) {
    await c.query('UPDATE public.candidates SET secondary_vote_count = GREATEST(secondary_vote_count - 1, 0) WHERE id = $1', [r.candidate_id]);
  }
  await c.query('DELETE FROM public.votes WHERE student_id = $1', [sid]);
  await c.query('UPDATE public.secondary_students SET has_voted = false WHERE id = $1', [sid]);
  const pri = await c.query('SELECT candidate_id FROM public.primary_votes WHERE student_id = $1', [sid]);
  for (const r of pri.rows) {
    await c.query('UPDATE public.candidates SET primary_vote_count = GREATEST(primary_vote_count - 1, 0) WHERE id = $1', [r.candidate_id]);
  }
  await c.query('DELETE FROM public.primary_votes WHERE student_id = $1', [sid]);
  await c.query('UPDATE public.primary_students SET has_voted = false WHERE id = $1', [sid]);
  console.log(`ROLLED-BACK ${sid} secondary=${sec.rows.length} primary=${pri.rows.length}`);
  const t = await c.query(
    'SELECT (SELECT count(*) FROM public.votes) v, (SELECT count(*) FROM public.primary_votes) pv'
  );
  console.log(`left votes=${t.rows[0].v} primary_votes=${t.rows[0].pv}`);
  await c.end();
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
