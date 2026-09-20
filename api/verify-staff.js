import { getSql } from './_db.js';

// Staff login looks ONLY in the staff table, so student IDs can never
// sign in here (and staff codes can never sign in to the student portals).
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method not allowed.' }));
    return;
  }
  try {
    const { staffCode } = req.body || {};
    if (!staffCode?.trim()) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Staff code is required.' }));
      return;
    }
    const sql = getSql();
    const code = staffCode.trim();
    const rows = await sql.query('SELECT code, name, has_voted FROM staff WHERE code = $1', [code]);
    const member = rows[0];
    if (!member) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Invalid staff code. Please check and try again.' }));
      return;
    }

    const votedRows = await sql.query('SELECT category FROM staff_votes WHERE staff_code = $1', [code]);
    const votedCategories = votedRows.map((r) => r.category);
    const allRows = await sql.query('SELECT DISTINCT category FROM candidates');
    const allCategories = allRows.map((r) => r.category);
    const done = allCategories.length > 0 && allCategories.every((c) => votedCategories.includes(c));

    if (done) {
      if (!member.has_voted) {
        await sql.query('UPDATE staff SET has_voted = true WHERE code = $1', [code]);
      }
      res.statusCode = 409;
      res.end(JSON.stringify({ error: 'This staff code has already voted!' }));
      return;
    }
    if (member.has_voted) {
      await sql.query('UPDATE staff SET has_voted = false WHERE code = $1', [code]);
    }

    res.statusCode = 200;
    res.end(JSON.stringify({ staffCode: member.code, name: member.name, verified: true, votedCategories }));
  } catch {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Could not verify staff code. Please try again.' }));
  }
}
