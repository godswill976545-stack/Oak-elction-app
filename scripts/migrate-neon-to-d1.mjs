// Re-runnable Neon -> D1 (+ R2) migration. Safe to run multiple times:
// rows are upserted by primary key and media objects are overwritten in place.
//
// Usage:
//   DATABASE_URL=... (Neon, read-only use)
//   node scripts/migrate-neon-to-d1.mjs              # rows only
//   node scripts/migrate-neon-to-d1.mjs --with-media # also move BYTEA/data-URL media to R2
//   node scripts/migrate-neon-to-d1.mjs --verify     # row counts after migration
//
// Keep the Neon database online for ~1 week after cutover for rollback.

import { neon } from '@neondatabase/serverless';
import { getSql } from '../api/_db.js';
import { putObject } from '../api/_b2.js';
import { splitDataUrl, candidatePhotoKey, partyLogoKey } from '../api/_media.js';

const withMedia = process.argv.includes('--with-media');
const verify = process.argv.includes('--verify');

const neonUrl = process.env.DATABASE_URL;
if (!neonUrl) {
  console.error('DATABASE_URL (Neon) is required.');
  process.exit(1);
}

// @neondatabase/serverless v1.x only supports tagged-template calls
// (sql`SELECT ...`) or .query(text, params) — not sql(text, params). Wrap it
// so the rest of this script can keep using nsql(text) for plain statements.
const neonClient = neon(neonUrl);
const nsql = (text, params = []) => neonClient.query(text, params);
const d1 = getSql();

const hexToBuf = (v) => (v == null ? null : Buffer.from(v.replace(/^\\x/, ''), 'hex'));

async function copyTable(table, mapRow) {
  const rows = await nsql(`SELECT * FROM public.${table}`);
  if (rows.length === 0) {
    console.log(`${table}: 0 rows on Neon, skipped.`);
    return 0;
  }
  const mapped = mapRow ? rows.map(mapRow) : rows;
  const cols = Object.keys(mapped[0]);
  const placeholders = cols.map(() => '?').join(', ');
  // DO NOTHING (not DO UPDATE): D1 is a fresh DB, so existing rows mean this
  // run already copied them — keeps re-runs idempotent without PK juggling.
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})
               ON CONFLICT DO NOTHING`;
  // Batches of 50 keep each request well under D1 limits.
  for (let i = 0; i < mapped.length; i += 50) {
    const chunk = mapped.slice(i, i + 50);
    await d1.batch(chunk.map((r) => ({ sql, params: cols.map((c) => r[c] ?? null) })));
  }
  console.log(`${table}: ${rows.length} rows copied.`);
  return rows.length;
}

function candidacyRow(r) {
  // Neon stores data-URLs inline; D1 stores R2 keys (uploaded separately).
  return {
    id: r.id,
    surname: r.surname,
    given_names: r.given_names,
    gender: r.gender,
    class: r.class,
    intended_post: r.intended_post,
    held_post: r.held_post ? 1 : 0,
    held_position: r.held_position ?? '',
    ran_before: r.ran_before ? 1 : 0,
    ran_position: r.ran_position ?? '',
    disciplinary: r.disciplinary ? 1 : 0,
    disciplinary_details: r.disciplinary_details ?? '',
    motivation: r.motivation,
    achievements: r.achievements ?? '',
    attest_name: r.attest_name,
    photo_key: null, // set by --with-media pass below
    cv_key: null,
    cv_filename: r.cv_filename,
    cv_mimetype: r.cv_mimetype,
    results_key: null,
    results_filename: r.results_filename,
    results_mimetype: r.results_mimetype,
    signature_key: null,
    signature_filename: r.signature_filename ?? '',
    signature_mimetype: r.signature_mimetype ?? 'application/octet-stream',
    party: r.party,
    status: r.status,
    created_at: r.created_at,
  };
}

function boolCols() {
  return (r) => {
    const out = { ...r };
    for (const k of ['has_voted', 'held_post', 'ran_before', 'disciplinary']) {
      if (k in out) out[k] = out[k] ? 1 : 0;
    }
    if ('created_at' in out && out.created_at instanceof Date) {
      out.created_at = out.created_at.toISOString();
    }
    return out;
  };
}

async function migrateMedia() {
  // Candidate photos: BYTEA column (post-refactor) or data-URL in photo_url.
  const cands = await nsql(
    'SELECT id, photo, photo_mime, photo_url FROM public.candidates'
  );
  let n = 0;
  for (const c of cands) {
    let bytes = hexToBuf(c.photo);
    let mime = c.photo_mime;
    if (!bytes && c.photo_url?.startsWith('data:')) {
      const parsed = splitDataUrl(c.photo_url);
      if (parsed) {
        bytes = parsed.bytes;
        mime = parsed.mime;
      }
    }
    if (!bytes || bytes.length === 0) continue;
    const key = candidatePhotoKey(c.id, mime || 'image/jpeg');
    await putObject(key, bytes, mime || 'image/jpeg');
    await d1.query('UPDATE candidates SET photo_key = ?, photo_mime = ? WHERE id = ?', [
      key,
      mime || 'image/jpeg',
      c.id,
    ]);
    n++;
  }
  console.log(`candidates media: ${n} photos -> R2.`);

  const parties = await nsql('SELECT name, logo, logo_mime, logo_url FROM public.parties');
  let p = 0;
  for (const row of parties) {
    let bytes = hexToBuf(row.logo);
    let mime = row.logo_mime;
    if (!bytes && row.logo_url?.startsWith('data:')) {
      const parsed = splitDataUrl(row.logo_url);
      if (parsed) {
        bytes = parsed.bytes;
        mime = parsed.mime;
      }
    }
    if (!bytes || bytes.length === 0) continue;
    const key = partyLogoKey(row.name, mime || 'image/png');
    await putObject(key, bytes, mime || 'image/png');
    await d1.query('UPDATE parties SET logo_key = ?, logo_mime = ? WHERE name = ?', [
      key,
      mime || 'image/png',
      row.name,
    ]);
    p++;
  }
  console.log(`parties media: ${p} logos -> R2.`);

  // Candidacy attachments: data-URLs -> R2 keys.
  const apps = await nsql(
    `SELECT id, photo_url, cv_file, results_file, signature_file,
            cv_mimetype, results_mimetype, signature_mimetype
     FROM public.candidacy_applications`
  );
  let a = 0;
  for (const app of apps) {
    const photo = splitDataUrl(app.photo_url);
    const cv = splitDataUrl(app.cv_file);
    const results = splitDataUrl(app.results_file);
    const sig = splitDataUrl(app.signature_file);
    if (photo) {
      const key = `candidacy/${app.id}/photo.${ext(photo.mime)}`;
      await putObject(key, photo.bytes, photo.mime);
      await d1.query('UPDATE candidacy_applications SET photo_key = ? WHERE id = ?', [key, app.id]);
    }
    if (cv) {
      const key = `candidacy/${app.id}/cv.${ext(app.cv_mimetype || cv.mime)}`;
      await putObject(key, cv.bytes, cv.mime);
      await d1.query('UPDATE candidacy_applications SET cv_key = ? WHERE id = ?', [key, app.id]);
    }
    if (results) {
      const key = `candidacy/${app.id}/results.${ext(app.results_mimetype || results.mime)}`;
      await putObject(key, results.bytes, results.mime);
      await d1.query('UPDATE candidacy_applications SET results_key = ? WHERE id = ?', [key, app.id]);
    }
    if (sig) {
      const key = `candidacy/${app.id}/signature.${ext(app.signature_mimetype || sig.mime)}`;
      await putObject(key, sig.bytes, sig.mime);
      await d1.query('UPDATE candidacy_applications SET signature_key = ? WHERE id = ?', [key, app.id]);
    }
    if (photo || cv || results || sig) a++;
  }
  console.log(`candidacy media: ${a} applications -> R2.`);
}

function ext(mime) {
  return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' })[mime] || 'bin';
}

async function verifyCounts() {
  const tables = [
    'primary_students', 'secondary_students', 'staff', 'candidates', 'parties',
    'votes', 'primary_votes', 'staff_votes', 'candidacy_applications', 'admin_pins',
  ];
  for (const t of tables) {
    const [{ n: neonN }] = await nsql(`SELECT count(*)::int AS n FROM public.${t}`);
    const [d1Row] = await d1.query(`SELECT COUNT(*) AS n FROM ${t}`);
    const d1N = d1Row?.n ?? 0;
    const flag = neonN === d1N ? 'OK' : 'MISMATCH';
    console.log(`${t}: neon=${neonN} d1=${d1N} ${flag}`);
  }
}

async function main() {
  console.log('Migrating Neon -> D1...');
  // Order respects FKs: parents first.
  await copyTable('parties', (r) => ({
    name: r.name,
    short_code: r.short_code,
    logo_url: r.logo_url?.startsWith('data:') ? '' : r.logo_url,
    logo_key: null,
    logo_mime: null,
  }));
  await copyTable('admin_secrets');
  await copyTable('admin_pins');
  await copyTable('primary_students', boolCols());
  await copyTable('secondary_students', boolCols());
  await copyTable('staff', boolCols());
  await copyTable('candidates', (r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    manifesto: r.manifesto,
    photo_url: r.photo_url?.startsWith('data:') ? '' : r.photo_url,
    primary_vote_count: r.primary_vote_count,
    secondary_vote_count: r.secondary_vote_count,
    party: r.party,
    staff_vote_count: r.staff_vote_count,
    photo_key: null,
    photo_mime: null,
  }));
  await copyTable('votes', boolCols());
  await copyTable('primary_votes', boolCols());
  await copyTable('staff_votes', boolCols());
  await copyTable('candidacy_applications', candidacyRow);

  if (withMedia) await migrateMedia();
  if (verify) await verifyCounts();
  console.log('Done.');
}

main().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
