import { getSql } from './_db.js';
import { isAdminRequest } from './_admin.js';

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
      if (!(await isAdminRequest(req, sql))) {
        return send(res, 403, { error: 'Admin authorization required.' });
      }
      const rows = await sql.query(
        'SELECT code, name, department, has_voted FROM staff ORDER BY name'
      );
      res.setHeader('Cache-Control', 'no-store');
      return send(
        res,
        200,
        rows.map((r) => ({
          code: r.code,
          name: r.name,
          department: r.department,
          has_voted: r.has_voted === 1,
        }))
      );
    } catch {
      return send(res, 500, { error: 'Could not load staff.' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { code, name, department, adminToken, adminPin } = req.body || {};
      const sql = getSql();
      if (!(await isAdminRequest({ headers: {}, body: { adminToken, adminPin } }, sql))) {
        return send(res, 403, { error: 'Admin authorization required.' });
      }
      if (!code?.trim() || !name?.trim()) {
        return send(res, 400, { error: 'Staff code and name are required.' });
      }
      const done = await sql.query(
        'INSERT INTO staff (code, name, department, has_voted) VALUES (?, ?, ?, 0) ON CONFLICT (code) DO NOTHING RETURNING code, name, department',
        [code.trim(), name.trim(), department?.trim() || null]
      );
      if (done.length === 0) return send(res, 409, { error: 'That staff code already exists.' });
      return send(res, 201, {
        code: done[0].code,
        name: done[0].name,
        department: done[0].department,
        has_voted: false,
      });
    } catch {
      return send(res, 500, { error: 'Could not register staff.' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return send(res, 405, { error: 'Method not allowed.' });
}
