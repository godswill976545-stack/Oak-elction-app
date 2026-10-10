import { getSql } from './_db.js';
import { isAdminRequest } from './_admin.js';
import { splitDataUrl, candidacyKey, extFor } from './_media.js';
import { putObject, getObject } from './_b2.js';

function send(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

// B2 native REST has no presigned URLs, so sensitive attachments are served
// through the authenticated /api/media?candidacy=<id>&slot=<x> proxy. The
// browser must send the admin token header on the fetch (see AdminDashboard).
const mediaProxyUrl = (id, slot) => `/api/media?candidacy=${encodeURIComponent(id)}&slot=${slot}`;

const POSITIONS = [
  'Head Boy',
  'Head Girl',
  'Social Prefect',
  'Sports Prefect (Male)',
  'Sports Prefect (Female)',
  'Food Prefect',
  'Health and Hygiene Prefect',
  'Assistant Food Prefect',
  "Crown's Captain",
  "Root's Captain",
  "Trunk's Captain",
  "Acorn's Captain",
];

// Vercel serverless functions cap request bodies at ~4.5MB, so per-file
// data-URL caps are sized so a full submission stays under that budget.
// (Local `server.js` allows 12MB — production is the constraint.)
const MAX_PHOTO_CHARS = 1_600_000;
const MAX_DOC_CHARS = 1_400_000;
const MAX_SIG_CHARS = 1_000_000;

const isBlank = (s) => typeof s !== 'string' || s.trim().length === 0;
const tooBig = (s, max) => typeof s !== 'string' || s.length === 0 || s.length > max;

const slug = (s) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'candidate';

// Row -> API shape: B2 keys become authenticated /api/media proxy URLs so the
// admin dashboard can preview/download (fetching with the admin token header).
// Keys are never sent to the browser.
function shapeDetail(row) {
  return {
    ...row,
    photo_url: row.photo_key ? mediaProxyUrl(row.id, 'photo') : null,
    cv_file: row.cv_key ? mediaProxyUrl(row.id, 'cv') : null,
    results_file: row.results_key ? mediaProxyUrl(row.id, 'results') : null,
    signature_file: row.signature_key ? mediaProxyUrl(row.id, 'signature') : null,
  };
}

export default async function handler(req, res) {
  const sql = getSql();

  // Detail view for admin review.
  if (req.method === 'GET' && req.query?.id) {
    try {
      if (!(await isAdminRequest(req, sql))) {
        return send(res, 403, { error: 'Admin authorization required.' });
      }
      const rows = await sql.query('SELECT * FROM candidacy_applications WHERE id = ?', [
        String(req.query.id),
      ]);
      if (rows.length === 0) return send(res, 404, { error: 'Application not found.' });
      res.setHeader('Cache-Control', 'no-store');
      return send(res, 200, shapeDetail(rows[0]));
    } catch (e) {
      console.error('candidacy detail failed:', e?.message);
      return send(res, 500, { error: 'Could not load application.' });
    }
  }

  if (req.method === 'GET') {
    try {
      if (!(await isAdminRequest(req, sql))) {
        return send(res, 403, { error: 'Admin authorization required.' });
      }
      const rows = await sql.query(
        `SELECT id, surname, given_names, gender, class, intended_post, party, status, created_at
         FROM candidacy_applications ORDER BY created_at DESC`
      );
      res.setHeader('Cache-Control', 'no-store');
      return send(res, 200, rows);
    } catch (e) {
      console.error('candidacy list failed:', e?.message);
      return send(res, 500, { error: 'Could not load applications.' });
    }
  }

  if (req.method === 'POST') {
    try {
      const b = req.body || {};

      // Status flip from the admin review list.
      if (b.action === 'status') {
        if (!['pending', 'approved', 'rejected'].includes(b.status)) {
          return send(res, 400, { error: 'Invalid status.' });
        }
        if (!(await isAdminRequest({ headers: {}, body: b }, sql))) {
          return send(res, 403, { error: 'Admin authorization required.' });
        }
        const apps = await sql.query('SELECT * FROM candidacy_applications WHERE id = ?', [b.id]);
        if (apps.length === 0) return send(res, 404, { error: 'Application not found.' });
        const app = apps[0];

        const updated = await sql.query(
          'UPDATE candidacy_applications SET status = ? WHERE id = ? RETURNING id, status',
          [b.status, b.id]
        );

        // Approving publishes the applicant to the ballot so voters see them
        // immediately (LiveResults / voting portals poll /api/candidates).
        // Idempotent: re-approving reuses the existing candidate row. The
        // application's R2 photo is re-keyed under the candidate so deleting
        // an application later would never break the ballot.
        let candidateId = null;
        if (b.status === 'approved') {
          const fullName = `${(app.given_names || '').trim()} ${(app.surname || '').trim()}`.trim();
          const manifesto = [app.motivation, app.achievements ? `Achievements: ${app.achievements}` : null]
            .filter(Boolean).join('\n\n');
          const existing = await sql.query(
            'SELECT id, party FROM candidates WHERE name = ? AND category = ? LIMIT 1',
            [fullName, app.intended_post]
          );
          if (existing.length > 0) {
            candidateId = existing[0].id;
            // Backfill the party if the application names one and the
            // ballot row doesn't have it yet (e.g. approved before parties existed).
            if (app.party && existing[0].party !== app.party) {
              await sql.query('UPDATE candidates SET party = ? WHERE id = ?', [app.party, candidateId]);
            }
          } else {
            candidateId = `${slug(fullName)}-${String(app.id).toLowerCase().replace(/[^a-z0-9]+/g, '').slice(-6)}${Date.now().toString(36)}`;
            let photoKey = null;
            let photoMime = null;
            if (app.photo_key) {
              const src = await getObject(app.photo_key);
              if (src) {
                photoKey = `candidates/${candidateId}/photo.${extFor(src.contentType || 'image/jpeg')}`;
                photoMime = src.contentType || 'image/jpeg';
                await putObject(photoKey, src.body, photoMime);
              }
            }
            await sql.query(
              `INSERT INTO candidates
                 (id, name, category, manifesto, photo_url, photo_key, photo_mime, party,
                  primary_vote_count, secondary_vote_count, staff_vote_count)
               VALUES (?, ?, ?, ?, '', ?, ?, ?, 0, 0, 0)`,
              [candidateId, fullName, app.intended_post, manifesto || '—', photoKey, photoMime, app.party || null]
            );
          }
        }
        // Rejecting pulls the auto-published ballot row back off, but only
        // when it has zero votes everywhere — never delete votes cast.
        if (b.status === 'rejected') {
          const fullName = `${(app.given_names || '').trim()} ${(app.surname || '').trim()}`.trim();
          const rows = await sql.query(
            `SELECT id FROM candidates WHERE name = ? AND category = ?
             AND COALESCE(primary_vote_count,0) = 0
             AND COALESCE(secondary_vote_count,0) = 0
             AND COALESCE(staff_vote_count,0) = 0 LIMIT 1`,
            [fullName, app.intended_post]
          );
          if (rows.length > 0) {
            await sql.query('DELETE FROM candidates WHERE id = ?', [rows[0].id]);
          }
        }
        return send(res, 200, { ...updated[0], candidateId });
      }

      // New submission from the digital candidacy form (file-only signature).
      const required = ['surname', 'given_names', 'gender', 'class', 'intended_post', 'motivation', 'photo_url'];
      for (const f of required) {
        if (isBlank(b[f])) return send(res, 400, { error: `Missing required field: ${f}.` });
      }
      if (!b.attested) return send(res, 400, { error: 'The attestation must be confirmed.' });
      if (tooBig(b.signature_file, MAX_SIG_CHARS)) {
        return send(res, 413, { error: 'The e-signature is missing or too large. Upload an image under ~700KB.' });
      }
      if (tooBig(b.photo_url, MAX_PHOTO_CHARS)) {
        return send(res, 413, { error: 'The photo is too large. Use a smaller image (under ~1MB).' });
      }
      for (const f of ['cv_file', 'results_file']) {
        if (tooBig(b[f], MAX_DOC_CHARS)) {
          return send(res, 413, { error: 'A document is missing or too large. Keep CV and results under ~1MB each.' });
        }
      }
      if (!POSITIONS.includes(b.intended_post)) {
        return send(res, 400, { error: 'Unknown intended post.' });
      }
      if (!b.cv_filename || !b.results_filename) {
        return send(res, 400, { error: 'CV and results files are required.' });
      }
      // Electoral party is optional (Independent when omitted), but when
      // given it must be a real party so approve() can publish it to the ballot.
      let partyName = null;
      if (typeof b.party === 'string' && b.party.trim()) {
        const found = await sql.query('SELECT name FROM parties WHERE name = ?', [b.party.trim()]);
        if (found.length === 0) return send(res, 400, { error: 'Unknown political party.' });
        partyName = found[0].name;
      }

      const id = `OIEC-26-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, '0')}`;

      // Upload all attachments to R2 first — if any upload fails nothing is
      // inserted and the student can retry cleanly.
      const photo = splitDataUrl(b.photo_url);
      const cv = splitDataUrl(b.cv_file);
      const results = splitDataUrl(b.results_file);
      const signature = splitDataUrl(b.signature_file);
      if (!photo || !cv || !results) {
        return send(res, 400, { error: 'One of the uploads was malformed. Please re-select the files.' });
      }
      const photoKey = candidacyKey(id, 'photo', photo.mime);
      const cvKey = candidacyKey(id, 'cv', cv.mime);
      const resultsKey = candidacyKey(id, 'results', results.mime);
      const signatureKey = signature ? candidacyKey(id, 'signature', signature.mime) : null;
      await putObject(photoKey, photo.bytes, photo.mime);
      await putObject(cvKey, cv.bytes, cv.mime);
      await putObject(resultsKey, results.bytes, results.mime);
      if (signature) await putObject(signatureKey, signature.bytes, signature.mime);

      await sql.query(
        `INSERT INTO candidacy_applications
         (id, surname, given_names, gender, class, intended_post,
          held_post, held_position, ran_before, ran_position,
          disciplinary, disciplinary_details, motivation, achievements, attest_name,
          photo_key, cv_key, cv_filename, cv_mimetype,
          results_key, results_filename, results_mimetype,
          signature_key, signature_filename, signature_mimetype, party, status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending')`,
        [
          id,
          b.surname.trim(), b.given_names.trim(), b.gender, b.class.trim(), b.intended_post,
          b.held_post ? 1 : 0, (b.held_position || '').trim(),
          b.ran_before ? 1 : 0, (b.ran_position || '').trim(),
          b.disciplinary ? 1 : 0, (b.disciplinary_details || '').trim(),
          b.motivation.trim(), (b.achievements || '').trim(), (b.attest_name || '').trim(),
          photoKey,
          cvKey, b.cv_filename, b.cv_mimetype || 'application/octet-stream',
          resultsKey, b.results_filename, b.results_mimetype || 'application/octet-stream',
          signatureKey, b.signature_filename || 'signature', signature ? signature.mime : 'application/octet-stream',
          partyName,
        ]
      );
      return send(res, 201, { id });
    } catch (e) {
      console.error('candidacy POST failed:', e?.message);
      return send(res, 500, { error: 'Could not save application. Please try again.' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return send(res, 405, { error: 'Method not allowed.' });
}
