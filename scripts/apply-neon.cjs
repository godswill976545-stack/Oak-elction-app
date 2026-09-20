// Applies neon_schema.sql + student roster using a connection string
// sourced from `neonctl connection-string` (NEON_URL env). Idempotent.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const STUDENTS = [
  ['OIS/22/00457', 'Chima Okoro'],
  ['OIS/22/00458', 'Sarah Mensah'],
  ['OIS/22/00459', 'David Adjovi'],
  ['OIS/22/00460', 'Amara Diop'],
  ['OIS/22/00461', 'Emmanuel Tunde'],
  ['OIS/22/00462', 'Blessings Kouassi'],
  ['OIS/22/00463', 'Michael Sowah'],
  ['OIS/22/00464', 'Fatima Bio'],
  ['OIS/22/00465', 'Joshua Gbede'],
  ['OIS/22/00466', 'Grace Zinsou'],
];

(async () => {
  if (!process.env.NEON_URL) throw new Error('NEON_URL is not set.');
  const c = new Client({ connectionString: process.env.NEON_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const schema = fs.readFileSync(path.join(__dirname, '..', 'neon_schema.sql'), 'utf8');
  await c.query(schema);
  console.log('SCHEMA-APPLIED');

  for (const [id, name] of STUDENTS) {
    for (const table of ['primary_students', 'secondary_students']) {
      await c.query(
        `INSERT INTO public.${table}(id, name, has_voted) VALUES ($1, $2, false) ON CONFLICT (id) DO NOTHING`,
        [id, name]
      );
    }
  }
  const r = await c.query(
    'SELECT (SELECT count(*) FROM public.primary_students) AS p, (SELECT count(*) FROM public.secondary_students) AS s, (SELECT count(*) FROM public.candidates) AS c, (SELECT count(*) FROM public.admin_secrets) AS a'
  );
  console.log(`NEON-STATE primary=${r.rows[0].p} secondary=${r.rows[0].s} candidates=${r.rows[0].c} secrets=${r.rows[0].a}`);
  await c.end();
})().catch((e) => {
  console.error('APPLY-FAIL', e.message);
  process.exit(1);
});
