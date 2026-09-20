require('dotenv').config();
const { Client } = require('pg');

// Mock staff roll for testing the staff portal. Replace with the real
// roster (or add via Admin) when it arrives.
const MOCK_STAFF = [
  ['STF/001', 'Mr. Adewale Johnson'],
  ['STF/002', 'Mrs. Funke Alabi'],
  ['STF/003', 'Mr. Kwabena Osei'],
  ['STF/004', 'Ms. Aisha Bello'],
  ['STF/005', 'Mr. Chukwuemeka Nwosu'],
  ['STF/006', 'Mrs. Grace Mensimah'],
  ['STF/007', 'Mr. Ibrahim Sule'],
  ['STF/008', 'Ms. Yvette Zinsou'],
];

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  for (const [code, name] of MOCK_STAFF) {
    await c.query(
      'INSERT INTO public.staff(code, name, has_voted) VALUES ($1, $2, false) ON CONFLICT (code) DO NOTHING',
      [code, name]
    );
  }
  const r = await c.query('SELECT code, name FROM public.staff ORDER BY code');
  console.log(`STAFF-OK count=${r.rows.length}`);
  for (const s of r.rows) console.log(`  ${s.code} | ${s.name}`);
  await c.end();
})().catch((e) => {
  console.error('STAFF-FAIL', e.message);
  process.exit(1);
});
