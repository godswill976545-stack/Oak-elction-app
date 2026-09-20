require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query(
    "INSERT INTO public.votes(student_id, candidate_id, category) VALUES ('OIS/STU/00019', 'emmanual-mtt7awjl', 'Head Boy') ON CONFLICT (student_id, category) DO NOTHING"
  );
  await c.query("UPDATE public.secondary_students SET has_voted = false WHERE id = 'OIS/STU/00019'");
  const r = await c.query('SELECT count(*) AS v FROM public.votes');
  console.log('BACKFILLED votes=' + r.rows[0].v);
  await c.end();
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
