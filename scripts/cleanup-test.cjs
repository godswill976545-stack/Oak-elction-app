require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query("DELETE FROM public.candidates WHERE id LIKE 'test-candidate-%'");
  await c.query("UPDATE public.secondary_students SET has_voted = false WHERE id = 'OIS/22/00458'");
  const r = await c.query('SELECT (SELECT count(*) FROM secondary_students) s, (SELECT count(*) FROM candidates) c');
  console.log('CLEAN-OK students=' + r.rows[0].s + ' candidates=' + r.rows[0].c);
  await c.end();
})().catch((e) => {
  console.error('CLEAN-FAIL', e.message);
  process.exit(1);
});
