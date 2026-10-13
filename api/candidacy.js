import { getSql } from './_db.js';
import { isAdminRequest } from './_admin.js';
import {
  candidacyKey, isStagingKey, isValidUpload, extFor,
  stagingKey, stagingToken, MAX_UPLOAD_BYTES, SLOTS,
} from './_media.js';
import { putObject, getObject, deleteObject, getUploadUrl } from './_b2.js';
import { rateLimiter, clientIp } from './_rate.js';

function send(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

// Sensitive attachments are served through the authenticated
// /api/media?candidacy=<id>&slot=<x> proxy. The browser must send the admin
// token header on the fetch (see AdminDashboard).
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
  'Timekeeper',
];

const isBlank = (s) => typeof s !== 'string' || s.trim().length === 0;

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

// Minting presigned URLs is public (students submit) and needs no DB, so it
// branches off before getSql(). Separate limiter from the candidacy routes.
const uploadUrlLimiter = rateLimiter({ max: 40, windowMs: 10 * 60 * 1000 });

export default async function handler(req, res) {
  // Mints a short-lived B2 presigned upload URL for one file. The browser
  // cannot push a 4.5MB file through a Vercel function body (Hobby caps
  // request bodies at 4.5MB), so it uploads straight to B2 and submits only
  // the key here. The minted key is staging/<random> — never a real
  // candidacy/<id>/ path — so a client cannot overwrite a published photo
  // even though a B2 upload URL can write any name in the bucket. Routed via
  // /api/candidacy?action=upload-url because the Hobby plan caps a deployment
  // at 12 functions.
  if (req.method === 'POST' && req.query?.action === 'upload-url') {
    try {
      if (!uploadUrlLimiter.allow(clientIp(req))) {
        return send(res, 429, { error: 'Too many upload requests. Try again shortly.' });
      }
      const { slot, mime } = req.body || {};
      if (!isValidUpload(slot, mime)) {
        return send(res, 400, { error: 'Unsupported file type for that field.' });
      }
      const { uploadUrl, uploadAuthToken } = await getUploadUrl();
      const key = stagingKey(await stagingToken(), mime);
      return send(res, 200, {
        uploadUrl,
        uploadAuthToken,
        key,
        maxBytes: MAX_UPLOAD_BYTES,
        method: 'POST',
        headers: {
          Authorization: uploadAuthToken,
          'Content-Type': mime,
          'X-Bz-File-Name': key,
          // Client fills in X-Bz-Content-Sha1 (SubtleCrypto) before sending.
        },
      });
    } catch (e) {
      console.error('upload-url failed:', e?.message);
      return send(res, 500, { error: 'Could not start an upload. Please try again.' });
    }
  }

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

        // Re-rejecting an already-rejected application is a clean no-op.
        // Rejection is NOT terminal: the application's uploads are kept, so a
        // later re-approval can re-key the photo and republish the candidate.
        if (app.status === 'rejected' && b.status === 'rejected') {
          const existingRej = await sql.query(
            'SELECT id FROM candidates WHERE application_id = ? LIMIT 1',
            [app.id]
          );
          return send(res, 200, { id: app.id, status: 'rejected', candidateId: existingRej[0]?.id || null });
        }

        // Verify the photo BEFORE the status write. An orphaned row may never
        // have had one, so approving a candidate with no photo would put a
        // nameless face on the ballot. Checking first keeps the write and the
        // publish in step: otherwise a refusal below leaves the row marked
        // approved with no candidate published, which is exactly the
        // half-state this guards against. Covers first approval and re-approval.
        const src = b.status === 'approved' && app.photo_key
          ? await getObject(app.photo_key)
          : null;
        if (b.status === 'approved' && app.photo_key && !src) {
          return send(res, 409, {
            error: 'This application\'s uploaded photo is no longer available, so it cannot be approved.',
          });
        }

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
          // Keyed by application, never by name: two applicants who share a
          // name and a post must each get their own ballot row, and a reject
          // must only ever remove the candidate this application published.
          const existing = await sql.query(
            'SELECT id, party FROM candidates WHERE application_id = ? LIMIT 1',
            [app.id]
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
            // The photo is verified to exist above, so this re-keys it under
            // the candidate. Deleting an application later can never break
            // the ballot, because the candidate owns its own copy.
            let photoKey = null;
            let photoMime = null;
            if (src) {
              photoKey = `candidates/${candidateId}/photo.${extFor(src.contentType || 'image/jpeg')}`;
              photoMime = src.contentType || 'image/jpeg';
              await putObject(photoKey, src.body, photoMime);
            }
            await sql.query(
              `INSERT INTO candidates
                 (id, name, category, manifesto, photo_url, photo_key, photo_mime, party,
                  primary_vote_count, secondary_vote_count, staff_vote_count, application_id)
               VALUES (?, ?, ?, ?, '', ?, ?, ?, 0, 0, 0, ?)`,
              [candidateId, fullName, app.intended_post, manifesto || '—', photoKey, photoMime, app.party || null, app.id]
            );
          }
        }
        // Rejecting pulls the auto-published ballot row back off, but only
        // when it has zero votes everywhere — never delete votes cast.
        // The application's own uploads are KEPT: rejection is not terminal,
        // so a later re-approval must still be able to re-key the photo, and
        // the files remain as the audit record of the application.
        let candidateRemoved = false;
        if (b.status === 'rejected') {
          const rows = await sql.query(
            `SELECT id, photo_key FROM candidates WHERE application_id = ?
             AND COALESCE(primary_vote_count,0) = 0
             AND COALESCE(secondary_vote_count,0) = 0
             AND COALESCE(staff_vote_count,0) = 0 LIMIT 1`,
            [app.id]
          );
          if (rows.length > 0) {
            await sql.query('DELETE FROM candidates WHERE id = ?', [rows[0].id]);
            candidateRemoved = true;
            // Approving re-keyed the photo into candidates/<id>/photo.* —
            // once the row is gone that object is orphaned, so remove it.
            if (rows[0].photo_key) {
              try {
                await deleteObject(rows[0].photo_key);
              } catch (e) {
                console.error(`candidacy ${app.id}: failed to delete candidate photo ${rows[0].photo_key}: ${e?.message}`);
              }
            }
          }
        }
        const kept = candidateRemoved
          ? null
          : (await sql.query('SELECT id FROM candidates WHERE application_id = ? LIMIT 1', [app.id]))[0]?.id || null;
        return send(res, 200, {
          ...updated[0],
          candidateId: kept,
          candidateRemoved,
          ...(kept ? { message: 'This candidate has votes and stays on the ballot.' } : {}),
        });
      }

      // New submission from the digital candidacy form. Attachments are NOT
      // inlined (a 4.5MB file cannot ride inside a Vercel function body);
      // the browser uploaded each one straight to B2 via the upload-url
      // action above and submits only the staging key. See _media.js.
      const required = ['surname', 'given_names', 'gender', 'class', 'intended_post', 'motivation'];
      for (const f of required) {
        if (isBlank(b[f])) return send(res, 400, { error: `Missing required field: ${f}.` });
      }
      if (!b.attested) return send(res, 400, { error: 'The attestation must be confirmed.' });
      if (!POSITIONS.includes(b.intended_post)) {
        return send(res, 400, { error: 'Unknown intended post.' });
      }

      // Every attachment must be a staging key minted by the upload-url
      // action. A raw data-URL or a non-staging key is rejected — the whole
      // point is that the client can only reference files it uploaded to a
      // random staging/ path, never a real candidacy/ or candidates/ key.
      const files = [
        ['photo', b.photo_key, 'The passport photo is required.'],
        ['cv', b.cv_key, 'The CV is required.'],
        ['results', b.results_key, 'The exam results file is required.'],
        ['signature', b.signature_key, 'The e-signature is required.'],
      ];
      const resolved = {};
      for (const [slot, key, msg] of files) {
        if (!isStagingKey(key)) return send(res, 400, { error: msg });
        const obj = await getObject(key);
        if (!obj) {
          return send(res, 400, {
            error: 'One of your uploads did not finish. Please re-select the files and resubmit.',
          });
        }
        if (!isValidUpload(slot, obj.contentType)) {
          return send(res, 400, { error: `The ${slot} file type is not accepted.` });
        }
        resolved[slot] = { key, obj };
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

      // Re-key each staging object into candidacy/<id>/<slot>. — a path the
      // client could not have written directly (it only ever held a random
      // staging key). Delete the staging copy so it does not linger.
      const finalKey = {};
      for (const slot of ['photo', 'cv', 'results', 'signature']) {
        const { key, obj } = resolved[slot];
        finalKey[slot] = candidacyKey(id, slot, obj.contentType);
        await putObject(finalKey[slot], obj.body, obj.contentType);
        await deleteObject(key);
      }

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
          finalKey.photo,
          finalKey.cv, b.cv_filename || 'cv', resolved.cv.obj.contentType,
          finalKey.results, b.results_filename || 'results', resolved.results.obj.contentType,
          finalKey.signature, b.signature_filename || 'signature', resolved.signature.obj.contentType,
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
