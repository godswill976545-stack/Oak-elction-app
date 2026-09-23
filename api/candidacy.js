import { getSql } from './_db.js';
import { isAdminPinValid } from './_admin.js';

function send(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

const POSITIONS = [
  'Head Boy',
  'Head Girl',
  'Social Prefect',
  'Sports Prefect (Male)',
  'Sports Prefect (Female)',
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

export default async function handler(req, res) {
  const sql = getSql();

  // Detail view for admin review.
  if (req.method === 'GET' && req.query?.id) {
    try {
      const rows = await sql.query('SELECT * FROM candidacy_applications WHERE id = $1', [
        String(req.query.id),
      ]);
      if (rows.length === 0) return send(res, 404, { error: 'Application not found.' });
      return send(res, 200, rows[0]);
    } catch (e) {
      console.error('candidacy detail failed:', e?.message);
      return send(res, 500, { error: 'Could not load application.' });
    }
  }

  if (req.method === 'GET') {
    try {
      const rows = await sql.query(
        `SELECT id, surname, given_names, gender, class, intended_post, party, status, created_at
         FROM candidacy_applications ORDER BY created_at DESC`
      );
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
        if (!(await isAdminPinValid(b.adminPin, sql))) {
          return send(res, 403, { error: 'Admin authorization required.' });
        }
        const apps = await sql.query('SELECT * FROM candidacy_applications WHERE id = $1', [b.id]);
        if (apps.length === 0) return send(res, 404, { error: 'Application not found.' });
        const app = apps[0];

        const updated = await sql.query(
          'UPDATE candidacy_applications SET status = $2 WHERE id = $1 RETURNING id, status',
          [b.id, b.status]
        );

        // Approving publishes the applicant to the ballot so voters see them
        // immediately (LiveResults / voting portals poll /api/candidates).
        // Idempotent: re-approving reuses the existing candidate row.
        let candidateId = null;
        if (b.status === 'approved') {
          const fullName = `${(app.given_names || '').trim()} ${(app.surname || '').trim()}`.trim();
          const manifesto = [app.motivation, app.achievements ? `Achievements: ${app.achievements}` : null]
            .filter(Boolean).join('\n\n');
          const existing = await sql.query(
            'SELECT id, party FROM candidates WHERE name = $1 AND category = $2 LIMIT 1',
            [fullName, app.intended_post]
          );
          if (existing.length > 0) {
            candidateId = existing[0].id;
            // Backfill the party if the application names one and the
            // ballot row doesn't have it yet (e.g. approved before parties existed).
            if (app.party && existing[0].party !== app.party) {
              await sql.query('UPDATE candidates SET party = $2 WHERE id = $1', [candidateId, app.party]);
            }
          } else {
            candidateId = `${slug(fullName)}-${String(app.id).toLowerCase().replace(/[^a-z0-9]+/g, '').slice(-6)}${Date.now().toString(36)}`;
            await sql.query(
              'INSERT INTO candidates (id, name, category, manifesto, photo_url, party, primary_vote_count, secondary_vote_count, staff_vote_count) VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 0)',
              [candidateId, fullName, app.intended_post, manifesto || '—', app.photo_url, app.party || null]
            );
          }
        }
        // Rejecting pulls the auto-published ballot row back off, but only
        // when it has zero votes everywhere — never delete votes cast.
        if (b.status === 'rejected') {
          const fullName = `${(app.given_names || '').trim()} ${(app.surname || '').trim()}`.trim();
          const rows = await sql.query(
            `SELECT id FROM candidates WHERE name = $1 AND category = $2
             AND COALESCE(primary_vote_count,0) = 0
             AND COALESCE(secondary_vote_count,0) = 0
             AND COALESCE(staff_vote_count,0) = 0 LIMIT 1`,
            [fullName, app.intended_post]
          );
          if (rows.length > 0) {
            await sql.query('DELETE FROM candidates WHERE id = $1', [rows[0].id]);
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
        const found = await sql.query('SELECT name FROM parties WHERE name = $1', [b.party.trim()]);
        if (found.length === 0) return send(res, 400, { error: 'Unknown political party.' });
        partyName = found[0].name;
      }

      const id = `OIEC-26-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, '0')}`;
      await sql.query(
        `INSERT INTO candidacy_applications
         (id, surname, given_names, gender, class, intended_post,
          held_post, held_position, ran_before, ran_position,
          disciplinary, disciplinary_details, motivation, achievements, attest_name,
          photo_url, cv_file, cv_filename, cv_mimetype,
          results_file, results_filename, results_mimetype,
          signature_file, signature_filename, signature_mimetype, party, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,'pending')`,
        [
          id,
          b.surname.trim(), b.given_names.trim(), b.gender, b.class.trim(), b.intended_post,
          !!b.held_post, (b.held_position || '').trim(),
          !!b.ran_before, (b.ran_position || '').trim(),
          !!b.disciplinary, (b.disciplinary_details || '').trim(),
          b.motivation.trim(), (b.achievements || '').trim(), (b.attest_name || '').trim(),
          b.photo_url,
          b.cv_file, b.cv_filename, b.cv_mimetype || 'application/octet-stream',
          b.results_file, b.results_filename, b.results_mimetype || 'application/octet-stream',
          b.signature_file, b.signature_filename || 'signature', b.signature_mimetype || 'application/octet-stream',
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
