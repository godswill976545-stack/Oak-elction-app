require('dotenv').config();
const BASE = 'http://localhost:3001';

const payload = {
  surname: 'Testson',
  given_names: 'Test Testa',
  gender: 'Female',
  class: 'SS2A',
  intended_post: 'Head Girl',
  held_post: true,
  held_position: 'Class Captain',
  ran_before: false,
  ran_position: '',
  disciplinary: true,
  disciplinary_details: 'Late to assembly once, resolved.',
  motivation: 'I want to serve the school with integrity and energy.',
  achievements: 'Best in English 2024.',
  attest_name: 'Test Testa Testson',
  attested: true,
  photo_url: 'data:image/jpeg;base64,/9j/4AAQAAAA',
  cv_file: 'data:application/pdf;base64,JVBERi0xLjQK',
  cv_filename: 'cv.pdf',
  cv_mimetype: 'application/pdf',
  results_file: 'data:application/pdf;base64,JVBERi0xLjQK',
  results_filename: 'results.pdf',
  results_mimetype: 'application/pdf',
};

const post = async (body) => {
  const r = await fetch(`${BASE}/api/candidacy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`POST ${r.status}: ${d.error}`);
  return d;
};

(async () => {
  // Validation: missing fields must be rejected.
  const bad = await fetch(`${BASE}/api/candidacy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ surname: 'x' }),
  });
  console.log(`VALIDATION-REJECT status=${bad.status}`);

  const created = await post(payload);
  console.log(`SUBMIT-OK id=${created.id}`);

  const list = await (await fetch(`${BASE}/api/candidacy`)).json();
  console.log(`LIST-OK count=${list.length} first=${list[0].surname} status=${list[0].status}`);

  const detail = await (await fetch(`${BASE}/api/candidacy?id=${created.id}`)).json();
  console.log(`DETAIL-OK name=${detail.given_names} post=${detail.intended_post} cv=${detail.cv_filename}`);

  const flipped = await post({ action: 'status', id: created.id, status: 'approved' });
  console.log(`STATUS-OK ${flipped.status}`);

  // Roll back the test row.
  const { Client } = await import('pg');
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query('DELETE FROM public.candidacy_applications WHERE id = $1', [created.id]);
  const left = await c.query('SELECT count(*) AS n FROM public.candidacy_applications');
  console.log(`ROLLED-BACK remaining=${left.rows[0].n}`);
  await c.end();
})().catch((e) => {
  console.error('E2E-FAIL', e.message);
  process.exit(1);
});
