import { getSql } from './_db.js';

// Staff portal voting: one vote per (staff code, category), tallied in the
// separate staff_vote_count column so staff and student counts never mix.
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method not allowed.' }));
    return;
  }
  try {
    const { staffCode, candidateId } = req.body || {};
    if (!staffCode?.trim() || !candidateId) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Staff code and candidate are required.' }));
      return;
    }
    const sql = getSql();
    const code = staffCode.trim();

    const members = await sql.query('SELECT code FROM staff WHERE code = $1', [code]);
    if (members.length === 0) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Staff not found.' }));
      return;
    }

    const cands = await sql.query('SELECT id, category FROM candidates WHERE id = $1', [candidateId]);
    if (cands.length === 0) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Candidate not found.' }));
      return;
    }
    const category = cands[0].category;

    const inserted = await sql.query(
      'INSERT INTO staff_votes (staff_code, candidate_id, category) VALUES ($1, $2, $3) ON CONFLICT (staff_code, category) DO NOTHING RETURNING staff_code',
      [code, candidateId, category]
    );
    if (inserted.length === 0) {
      res.statusCode = 409;
      res.end(JSON.stringify({ error: `This code already voted for ${category}.` }));
      return;
    }

    await sql.query('UPDATE candidates SET staff_vote_count = staff_vote_count + 1 WHERE id = $1', [
      candidateId,
    ]);

    const remaining = await sql.query(
      `SELECT DISTINCT c.category FROM candidates c
       WHERE c.category NOT IN (SELECT v.category FROM staff_votes v WHERE v.staff_code = $1)`,
      [code]
    );
    if (remaining.length === 0) {
      await sql.query('UPDATE staff SET has_voted = true WHERE code = $1', [code]);
    }

    res.statusCode = 200;
    res.end(JSON.stringify({ success: true }));
  } catch {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Could not record vote. Please try again.' }));
  }
}
