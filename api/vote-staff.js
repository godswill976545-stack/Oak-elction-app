import { getSql } from './_db.js';

// Staff portal voting: one vote per (staff code, category), tallied in the
// separate staff_vote_count column so staff and student counts never mix.
//
// One D1 batch = one transaction (see vote-primary.js for the changes()
// chaining trick that replaces Postgres data-modifying CTEs).
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

    const out = await sql.batch([
      {
        sql: `SELECT
                (SELECT COUNT(*) FROM staff WHERE code = ?) AS staff_found,
                (SELECT COUNT(*) FROM candidates WHERE id = ?) AS candidate_found,
                (SELECT category FROM candidates WHERE id = ?) AS category`,
        params: [code, candidateId, candidateId],
      },
      {
        sql: `INSERT INTO staff_votes (staff_code, candidate_id, category)
              SELECT ?, c.id, c.category
              FROM candidates c
              WHERE c.id = ?
                AND EXISTS (SELECT 1 FROM staff WHERE code = ?)
              ON CONFLICT (staff_code, category) DO NOTHING`,
        params: [code, candidateId, code],
      },
      {
        sql: `UPDATE candidates SET staff_vote_count = staff_vote_count + 1
              WHERE id = ? AND (SELECT changes()) > 0`,
        params: [candidateId],
      },
      {
        sql: `UPDATE staff SET has_voted = 1
              WHERE code = ?
                AND (SELECT changes()) > 0
                AND (SELECT COUNT(*) FROM candidates) > 0
                AND NOT EXISTS (
                  SELECT 1 FROM candidates c
                  WHERE NOT EXISTS (
                    SELECT 1 FROM staff_votes v
                    WHERE v.staff_code = ? AND v.category = c.category
                  )
                )`,
        params: [code, code],
      },
    ]);

    const diag = out[0]?.results?.[0] || {};
    const inserted = out[1]?.meta?.changes || 0;
    const flagged = out[3]?.meta?.changes || 0;

    if (diag.staff_found === 0) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Staff not found.' }));
      return;
    }
    if (diag.candidate_found === 0) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Candidate not found.' }));
      return;
    }
    if (inserted === 0) {
      res.statusCode = 409;
      res.end(JSON.stringify({ error: `This code already voted for ${diag.category}.` }));
      return;
    }

    res.statusCode = 200;
    res.end(JSON.stringify({ success: true, ballotComplete: flagged > 0 }));
  } catch {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Could not record vote. Please try again.' }));
  }
}
