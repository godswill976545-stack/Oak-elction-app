require('dotenv').config();
const { Client } = require('pg');

// Extra mock students for primary name-search testing.
const EXTRA = [
  ['OIS/STU/00026', 'Abigail Mensima'],
  ['OIS/STU/00027', 'Daniel Okeke'],
  ['OIS/STU/00028', 'Esther Boateng'],
  ['OIS/STU/00029', 'Felix Njoroge'],
  ['OIS/STU/00030', 'Hannah Dlamini'],
  ['OIS/STU/00031', 'Isaac Kamara'],
  ['OIS/STU/00032', 'Joyce Wanjiku'],
  ['OIS/STU/00033', 'Kevin Otieno'],
  ['OIS/STU/00034', 'Lydia Agyemang'],
  ['OIS/STU/00035', 'Peter Mwangi'],
  ['OIS/STU/00036', 'Ruth Achebe'],
  ['OIS/STU/00037', 'Stephen Obaro'],
  ['OIS/STU/00038', 'Tina Essien'],
  ['OIS/STU/00039', 'Umar Danjuma'],
  ['OIS/STU/00040', 'Vera Okafor'],
];

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  for (const [id, name] of EXTRA) {
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
  console.log(`STUDENTS-OK primary=${r.rows[0].p} secondary=${r.rows[0].s}`);
  await c.end();
})().catch((e) => {
  console.error('STUDENTS-FAIL', e.message);
  process.exit(1);
});
