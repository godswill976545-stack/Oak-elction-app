import { getSql } from './_db.js';
import { isAdminRequest } from './_admin.js';
import { mediaUrl, splitDataUrl, candidatePhotoKey } from './_media.js';
import { putObject } from './_b2.js';

function send(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

// Photos live in R2 and are served by /api/media. The ballot screen used to
// receive every image inline as a base64 data-URL on each poll, which turned
// this response into ~26MB; now it is a few KB of URLs and the browser pulls
// each image once, cached. See _media.js and d1_schema.sql.
//
// The list is polled by every open ballot, so the response is edge-cached for
// 5s (covers bursts from a full school of kiosks; fresh enough that a new
// candidate shows up almost immediately).

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const sql = getSql();
      const rows = await sql.query(
        `SELECT c.id, c.name, c.category, c.manifesto, c.photo_key, c.photo_url, c.party,
                c.primary_vote_count, c.secondary_vote_count, c.staff_vote_count,
                p.short_code AS party_code, p.logo_key IS NOT NULL AS has_party_logo,
                p.logo_updated_at AS party_logo_v
         FROM candidates c LEFT JOIN parties p ON p.name = c.party
         ORDER BY c.category, c.name`
      );
      res.setHeader('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=20');
      return send(
        res,
        200,
        rows.map((r) => ({
          id: r.id,
          name: r.name,
          category: r.category,
          manifesto: r.manifesto,
          // Prefer the stored R2 object; fall back to an externally hosted URL.
          photo_url: r.photo_key ? mediaUrl('candidate', r.id) : r.photo_url || null,
          party: r.party,
          primary_vote_count: r.primary_vote_count,
          secondary_vote_count: r.secondary_vote_count,
          staff_vote_count: r.staff_vote_count,
          party_code: r.party_code,
          party_logo: r.has_party_logo
            ? `${mediaUrl('party', r.party)}&v=${r.party_logo_v || 0}`
            : null,
        }))
      );
    } catch {
      return send(res, 500, { error: 'Could not load candidates.' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { name, category, manifesto, photo_url, party, adminToken, adminPin } = req.body || {};
      const sql = getSql();
      if (!(await isAdminRequest({ headers: {}, body: { adminToken, adminPin } }, sql))) {
        return send(res, 403, { error: 'Admin authorization required.' });
      }
      if (!name?.trim() || !category?.trim() || !manifesto?.trim() || !photo_url) {
        return send(res, 400, { error: 'All fields are required: Name, Manifesto, and Photo.' });
      }
      let partyName = null;
      if (party) {
        const found = await sql.query('SELECT name FROM parties WHERE name = ?', [party]);
        if (found.length === 0) return send(res, 400, { error: 'Unknown political party.' });
        partyName = found[0].name;
      }

      // An inline data-URL is uploaded to R2 so it is served from /api/media
      // instead of being re-sent inside every list response.
      const media = splitDataUrl(photo_url);
      const id = `${name.trim().toLowerCase().replace(/\s+/g, '-')}-${Date.now().toString(36)}`;
      let photoKey = null;
      if (media) {
        photoKey = candidatePhotoKey(id, media.mime);
        await putObject(photoKey, media.bytes, media.mime);
      }
      await sql.query(
        `INSERT INTO candidates
           (id, name, category, manifesto, photo_url, photo_key, photo_mime, party,
            primary_vote_count, secondary_vote_count, staff_vote_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0)`,
        [
          id,
          name.trim(),
          category,
          manifesto.trim(),
          media ? '' : photo_url || '',
          photoKey,
          media ? media.mime : null,
          partyName,
        ]
      );
      return send(res, 201, {
        id,
        name: name.trim(),
        category,
        manifesto: manifesto.trim(),
        photo_url: photoKey ? mediaUrl('candidate', id) : photo_url || null,
        party: partyName,
      });
    } catch {
      return send(res, 500, { error: 'Could not register candidate.' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return send(res, 405, { error: 'Method not allowed.' });
}
