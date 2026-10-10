import { getSql } from './_db.js';
import { getObject } from './_b2.js';
import { isAdminRequest } from './_admin.js';

// Serves candidate photos and party logos as real image responses, proxied
// from the private R2 bucket.
//
// These used to ride along inside /api/candidates as base64 data-URLs, which
// made that single list endpoint return ~26MB. Every ballot opened by pulling
// all of it, and the poll then re-pulled it again seconds later.
//
// Here each image is fetched on its own, by the browser, exactly once: the
// cache headers are immutable because a photo for a given candidate id never
// changes, and the ETag lets a revalidation be a 304 instead of another body.
//   /api/media?candidate=<id>          (public: ballot photo)
//   /api/media?party=<name>            (public: party logo)
//   /api/media?candidacy=<id>&slot=x   (admin: sensitive attachment, token required)
const SLOTS = { photo: 'photo_key', cv: 'cv_key', results: 'results_key', signature: 'signature_key' };

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.end('Method not allowed.');
    return;
  }

  const candidate = req.query?.candidate;
  const party = req.query?.party;
  const candidacy = req.query?.candidacy;
  if (!candidate && !party && !candidacy) {
    res.statusCode = 400;
    res.end('Specify ?candidate=<id>, ?party=<name>, or ?candidacy=<id>&slot=<photo|cv|results|signature>.');
    return;
  }

  try {
    const sql = getSql();

    // Sensitive candidacy attachments: require a valid admin token.
    if (candidacy) {
      if (!(await isAdminRequest(req, sql))) {
        res.statusCode = 403;
        res.end('Admin authorization required.');
        return;
      }
      const slot = String(req.query?.slot || 'photo');
      const col = SLOTS[slot];
      if (!col) {
        res.statusCode = 400;
        res.end('Unknown slot.');
        return;
      }
      const rows = await sql.query(`SELECT ${col} AS k FROM candidacy_applications WHERE id = ?`, [
        String(candidacy),
      ]);
      const key = rows[0]?.k;
      if (!key) {
        res.statusCode = 404;
        res.end('Not found.');
        return;
      }
      const obj = await getObject(key);
      if (!obj) {
        res.statusCode = 404;
        res.end('Not found.');
        return;
      }
      res.setHeader('Cache-Control', 'private, no-store');
      res.statusCode = 200;
      res.setHeader('Content-Type', obj.contentType || 'application/octet-stream');
      res.setHeader('Content-Length', String(obj.body.length));
      res.end(req.method === 'HEAD' ? undefined : obj.body);
      return;
    }

    const row = candidate
      ? (
          await sql.query('SELECT photo_key, photo_mime FROM candidates WHERE id = ?', [
            String(candidate),
          ])
        )[0]
      : (
          await sql.query('SELECT logo_key, logo_mime FROM parties WHERE name = ?', [String(party)])
        )[0];

    const key = row && (candidate ? row.photo_key : row.logo_key);
    if (!key) {
      // 404 lets the UI fall back to its initials avatar.
      res.statusCode = 404;
      res.end('Not found.');
      return;
    }

    const obj = await getObject(key);
    if (!obj) {
      res.statusCode = 404;
      res.end('Not found.');
      return;
    }

    const mime = (candidate ? row.photo_mime : row.logo_mime) || obj.contentType || 'image/jpeg';

    if (obj.etag && req.headers['if-none-match'] === obj.etag) {
      res.statusCode = 304;
      res.setHeader('ETag', obj.etag);
      res.end();
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', String(obj.body.length));
    if (obj.etag) res.setHeader('ETag', obj.etag);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(req.method === 'HEAD' ? undefined : obj.body);
  } catch (e) {
    // 503 on B2/D1 outage (including D1 rate limit) so the UI can retry.
    const status = e?.rateLimited ? 503 : 500;
    res.statusCode = status;
    res.end('Could not load image.');
  }
}
