require('dotenv').config();
const { Client } = require('pg');

// Usage: node scripts/remove-candidates.cjs <id-prefix>
// Deletes test candidates (and their vote rows) by id prefix.
const prefix = process.argv[2];
if (!prefix) {
  console.error('Usage: node scripts/remove-candidates.cjs <id-prefix>');
  process.exit(1);
}

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const votes = await c.query('DELETE FROM public.votes WHERE candidate_id LIKE $1 || $2 RETURNING candidate_id', [
    prefix,
    '%',
  ]);
  for (const r of votes.rows) {
    await c.query('UPDATE public.candidates SET secondary_vote_count = GREATEST(secondary_vote_count - 1, 0) WHERE id = $1', [
      r.candidate_id,
    ]);
  }
  const del = await c.query('DELETE FROM public.candidates WHERE id LIKE $1 || $2 RETURNING id', [prefix, '%']);
  console.log(`CLEANED ids=${JSON.stringify(del.rows.map((r) => r.id))}`);
  await c.end();
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
