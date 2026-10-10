import { getSql } from './_db.js';
import { isAdminRequest } from './_admin.js';
import { splitDataUrl, partyLogoKey } from './_media.js';
import { putObject } from './_b2.js';

function send(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

// Parties directory. GET lists all; POST sets a party's logo
// (body: { name, logo_url }) once real logos arrive.
//
// Logos live in R2 and are served from /api/media rather than inlined as
// data-URLs — an inline logo is repeated across every candidate row in
// /api/candidates. Parties change rarely, so the list is edge-cached 10 min.
const shape = (r) => ({
  name: r.name,
  short_code: r.short_code,
  logo_url: r.logo_key ? `/api/media?party=${encodeURIComponent(r.name)}` : r.logo_url || null,
});

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const sql = getSql();
      const rows = await sql.query(
        'SELECT name, short_code, logo_url, logo_key FROM parties ORDER BY name'
      );
      res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=600');
      return send(res, 200, rows.map(shape));
    } catch {
      return send(res, 500, { error: 'Could not load parties.' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { name, logo_url, adminToken, adminPin } = req.body || {};
      const sql = getSql();
      if (!(await isAdminRequest({ headers: {}, body: { adminToken, adminPin } }, sql))) {
        return send(res, 403, { error: 'Admin authorization required.' });
      }
      if (!name?.trim()) return send(res, 400, { error: 'Party name is required.' });

      const media = splitDataUrl(logo_url);
      let logoKey = null;
      if (media) {
        logoKey = partyLogoKey(name.trim(), media.mime);
        await putObject(logoKey, media.bytes, media.mime);
      }
      const updated = await sql.query(
        `UPDATE parties SET logo_url = ?, logo_key = ?, logo_mime = ?
         WHERE name = ?
         RETURNING name, short_code, logo_url, logo_key`,
        [media ? '' : logo_url || null, logoKey, media ? media.mime : null, name.trim()]
      );
      if (updated.length === 0) return send(res, 404, { error: 'Unknown political party.' });
      return send(res, 200, shape(updated[0]));
    } catch {
      return send(res, 500, { error: 'Could not update party logo.' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return send(res, 405, { error: 'Method not allowed.' });
}
