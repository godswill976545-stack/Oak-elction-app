import { getSql } from './_db.js';

function send(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

// Staff roll management (Admin). GET lists staff with vote status;
// POST registers one ({ code, name }).
export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const sql = getSql();
      const rows = await sql.query('SELECT code, name, has_voted FROM staff ORDER BY name');
      return send(res, 200, rows);
    } catch {
      return send(res, 500, { error: 'Could not load staff.' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { code, name } = req.body || {};
      if (!code?.trim() || !name?.trim()) {
        return send(res, 400, { error: 'Staff code and name are required.' });
      }
      const sql = getSql();
      const done = await sql.query(
        'INSERT INTO staff (code, name, has_voted) VALUES ($1, $2, false) ON CONFLICT (code) DO NOTHING RETURNING code, name',
        [code.trim(), name.trim()]
      );
      if (done.length === 0) return send(res, 409, { error: 'That staff code already exists.' });
      return send(res, 201, done[0]);
    } catch {
      return send(res, 500, { error: 'Could not register staff.' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return send(res, 405, { error: 'Method not allowed.' });
}
