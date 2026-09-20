require('dotenv').config();
const { Client } = require('pg');

// Removes verification-test ballots. NEVER run against real voter IDs/codes.
const TEST_STUDENTS = ['OIS/STU/00002'];
const TEST_STAFF = ['STF/TEST01'];

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  for (const sid of TEST_STUDENTS) {
    const rows = await c.query('SELECT candidate_id FROM public.primary_votes WHERE student_id = $1', [sid]);
    for (const r of rows.rows) {
      await c.query(
        'UPDATE public.candidates SET primary_vote_count = GREATEST(primary_vote_count - 1, 0) WHERE id = $1',
        [r.candidate_id]
      );
    }
    await c.query('DELETE FROM public.primary_votes WHERE student_id = $1', [sid]);
    await c.query('UPDATE public.primary_students SET has_voted = false WHERE id = $1', [sid]);
    console.log(`ROLLED-BACK primary ballots for ${sid}: ${rows.rows.length}`);
  }

  for (const code of TEST_STAFF) {
    const rows = await c.query('SELECT candidate_id FROM public.staff_votes WHERE staff_code = $1', [code]);
    for (const r of rows.rows) {
      await c.query(
        'UPDATE public.candidates SET staff_vote_count = GREATEST(staff_vote_count - 1, 0) WHERE id = $1',
        [r.candidate_id]
      );
    }
    await c.query('DELETE FROM public.staff_votes WHERE staff_code = $1', [code]);
    await c.query('DELETE FROM public.staff WHERE code = $1', [code]);
    console.log(`REMOVED staff ${code} ballots=${rows.rows.length}`);
  }

  const t = await c.query(
    'SELECT (SELECT count(*) FROM public.primary_votes) p, (SELECT count(*) FROM public.staff_votes) s, (SELECT count(*) FROM public.staff) st'
  );
  console.log(`left primary_votes=${t.rows[0].p} staff_votes=${t.rows[0].s} staff=${t.rows[0].st}`);
  await c.end();
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
