require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const before = await c.query(
    'SELECT id, name, category, primary_vote_count, secondary_vote_count FROM public.candidates ORDER BY id'
  );
  console.log('BEFORE=' + JSON.stringify(before.rows));
  await c.query("DELETE FROM public.candidates WHERE id LIKE 'live-check-%'");
  const after = await c.query('SELECT count(*) AS n FROM public.candidates');
  console.log('PROBE-CLEANED remaining=' + after.rows[0].n);
  await c.end();
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
