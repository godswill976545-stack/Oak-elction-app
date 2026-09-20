import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;

// ── Student roster ──────────────────────────────────────────────
const STUDENTS = [
  { id: 'OIS/22/00457', name: 'Chima Okoro', has_voted: false },
  { id: 'OIS/22/00458', name: 'Sarah Mensah', has_voted: false },
  { id: 'OIS/22/00459', name: 'David Adjovi', has_voted: false },
  { id: 'OIS/22/00460', name: 'Amara Diop', has_voted: false },
  { id: 'OIS/22/00461', name: 'Emmanuel Tunde', has_voted: false },
  { id: 'OIS/22/00462', name: 'Blessings Kouassi', has_voted: false },
  { id: 'OIS/22/00463', name: 'Michael Sowah', has_voted: false },
  { id: 'OIS/22/00464', name: 'Fatima Bio', has_voted: false },
  { id: 'OIS/22/00465', name: 'Joshua Gbede', has_voted: false },
  { id: 'OIS/22/00466', name: 'Grace Zinsou', has_voted: false },
];

async function reset() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Put it in .env first.');
    process.exit(1);
  }
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  console.log('Wiping all existing candidates...');
  await client.query('DELETE FROM candidates');

  console.log('Wiping all existing students (both portals)...');
  await client.query('DELETE FROM primary_students');
  await client.query('DELETE FROM secondary_students');

  console.log('Seeding student roster (both portals)...');
  for (const s of STUDENTS) {
    for (const table of ['primary_students', 'secondary_students']) {
      await client.query(`INSERT INTO ${table} (id, name, has_voted) VALUES ($1, $2, $3)`, [
        s.id,
        s.name,
        s.has_voted,
      ]);
    }
  }

  console.log(`Seeded ${STUDENTS.length} students.`);
  console.log('Database is clean and ready for the election!');
  await client.end();
  process.exit(0);
}

reset().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
