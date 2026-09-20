require('dotenv').config();
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
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  for (const [id, name] of STUDENTS) {
    for (const table of ['primary_students', 'secondary_students']) {
      await c.query(
        `INSERT INTO public.${table}(id, name, has_voted) VALUES ($1, $2, false) ON CONFLICT (id) DO NOTHING`,
        [id, name]
      );
    }
  }
  const r = await c.query(
    'SELECT (SELECT count(*) FROM public.primary_students) AS p, (SELECT count(*) FROM public.secondary_students) AS s'
  );
  console.log(`SEED-OK primary=${r.rows[0].p} secondary=${r.rows[0].s}`);
  await c.end();
})().catch((e) => {
  console.error('SEED-FAIL', e.message);
  process.exit(1);
});
