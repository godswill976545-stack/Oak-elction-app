import { getSql } from './_db.js';

// Secondary portal: one vote per (student, category), enforced by the
// partial unique index on votes (see d1_schema.sql). DEMO-% students are
// demo voters with UNLIMITED voting — the index exempts them and has_voted
// never flips. secondary_students.has_voted flips only once every position
// is covered for real voters, so they can finish remaining categories
// across sessions.
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
    const { studentId, candidateId } = req.body || {};
    if (!studentId?.trim() || !candidateId) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Student ID and candidate are required.' }));
      return;
    }
    const sql = getSql();
    const sid = studentId.trim();

    const out = await sql.batch([
      {
        sql: `SELECT
                (SELECT COUNT(*) FROM secondary_students WHERE id = ?) AS student_found,
                (SELECT COUNT(*) FROM candidates WHERE id = ?) AS candidate_found,
                (SELECT category FROM candidates WHERE id = ?) AS category`,
        params: [sid, candidateId, candidateId],
      },
      {
        sql: `INSERT INTO votes (student_id, candidate_id, category)
              SELECT ?, c.id, c.category
              FROM candidates c
              WHERE c.id = ?
                AND EXISTS (SELECT 1 FROM secondary_students WHERE id = ?)
              ON CONFLICT (student_id, category) WHERE student_id NOT LIKE 'DEMO-%' DO NOTHING`,
        params: [sid, candidateId, sid],
      },
      {
        sql: `UPDATE candidates SET secondary_vote_count = secondary_vote_count + 1
              WHERE id = ? AND (SELECT changes()) > 0`,
        params: [candidateId],
      },
      {
        sql: `UPDATE secondary_students SET has_voted = 1
              WHERE id = ?
                AND id NOT LIKE 'DEMO-%'
                AND (SELECT changes()) > 0
                AND (SELECT COUNT(*) FROM candidates) > 0
                AND NOT EXISTS (
                  SELECT 1 FROM candidates c
                  WHERE NOT EXISTS (
                    SELECT 1 FROM votes v
                    WHERE v.student_id = ? AND v.category = c.category
                  )
                )`,
        params: [sid, sid],
      },
    ]);

    const diag = out[0]?.results?.[0] || {};
    const inserted = out[1]?.meta?.changes || 0;
    const flagged = out[3]?.meta?.changes || 0;

    if (diag.student_found === 0) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Student not found.' }));
      return;
    }
    if (diag.candidate_found === 0) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Candidate not found.' }));
      return;
    }
    if (inserted === 0) {
      res.statusCode = 409;
      res.end(JSON.stringify({ error: `You already voted for ${diag.category}.` }));
      return;
    }

    res.statusCode = 200;
    res.end(JSON.stringify({ success: true, ballotComplete: flagged > 0 }));
  } catch {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Could not record vote. Please try again.' }));
  }
}
