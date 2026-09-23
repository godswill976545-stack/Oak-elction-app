import { getSql } from './_db.js';
import { isAdminPinValid } from './_admin.js';

function send(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

// Parties directory. GET lists all; POST sets a party's logo
// (body: { name, logo_url }) once real logos arrive.
export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const sql = getSql();
      const rows = await sql.query('SELECT name, short_code, logo_url FROM parties ORDER BY name');
      return send(res, 200, rows);
    } catch {
      return send(res, 500, { error: 'Could not load parties.' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { name, logo_url, adminPin } = req.body || {};
      const sql = getSql();
      if (!(await isAdminPinValid(adminPin, sql))) {
        return send(res, 403, { error: 'Admin authorization required.' });
      }
      if (!name?.trim()) return send(res, 400, { error: 'Party name is required.' });
      const updated = await sql.query(
        'UPDATE parties SET logo_url = $2 WHERE name = $1 RETURNING name, short_code, logo_url',
        [name.trim(), logo_url || null]
      );
      if (updated.length === 0) return send(res, 404, { error: 'Unknown political party.' });
      return send(res, 200, updated[0]);
    } catch {
      return send(res, 500, { error: 'Could not update party logo.' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return send(res, 405, { error: 'Method not allowed.' });
}
