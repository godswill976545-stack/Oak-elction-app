// One-off migration: copies everything from Supabase to Neon.
// - students: written to BOTH primary_students and secondary_students
//   (has_voted OR-merged so nobody can double-vote)
// - candidates: upsert by id incl. vote counts; photos downloaded from
//   Supabase storage and stored as data-URLs so Neon is self-contained
//   (falls back to the original URL if a download fails).
require('dotenv').config();
const { Client } = require('pg');

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.VITE_SUPABASE_ANON_KEY;

async function sb(table) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?select=*`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function toDataUrl(url) {
  if (!url || url.startsWith('data:')) return url;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`photo ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 6 * 1024 * 1024) throw new Error('photo too large');
  const mime = res.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

(async () => {
  const [sbStudents, sbCandidates] = await Promise.all([sb('students'), sb('candidates')]);
  console.log(`SUPABASE students=${sbStudents.length} candidates=${sbCandidates.length}`);

  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  let s = 0;
  for (const st of sbStudents) {
    for (const table of ['primary_students', 'secondary_students']) {
      await c.query(
        `INSERT INTO public.${table}(id, name, has_voted) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, has_voted = public.${table}.has_voted OR EXCLUDED.has_voted`,
        [st.id, st.name, !!st.has_voted]
      );
    }
    s++;
  }

  let ok = 0,
    fallback = 0;
  for (const cd of sbCandidates) {
    let photo = cd.photo_url;
    try {
      photo = await toDataUrl(cd.photo_url);
    } catch (e) {
      fallback++;
      console.log(`  photo fallback (${cd.id}): ${e.message}`);
    }
    await c.query(
      `INSERT INTO public.candidates(id, name, category, manifesto, photo_url, primary_vote_count, secondary_vote_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category,
         manifesto = EXCLUDED.manifesto, photo_url = EXCLUDED.photo_url,
         primary_vote_count = EXCLUDED.primary_vote_count, secondary_vote_count = EXCLUDED.secondary_vote_count`,
      [cd.id, cd.name, cd.category, cd.manifesto, photo, cd.primary_vote_count || 0, cd.secondary_vote_count || 0]
    );
    ok++;
  }

  const r = await c.query(
    'SELECT (SELECT count(*) FROM public.secondary_students) s, (SELECT count(*) FROM public.candidates) c, (SELECT count(*) FROM public.secondary_students WHERE has_voted) v'
  );
  console.log(`MIGRATED students=${s} candidates=${ok} (photo fallbacks=${fallback})`);
  console.log(`NEON now students=${r.rows[0].s} candidates=${r.rows[0].c} voted=${r.rows[0].v}`);
  await c.end();
})().catch((e) => {
  console.error('MIGRATE-FAIL', e.message);
  process.exit(1);
});
