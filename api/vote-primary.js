import { getSql } from './_db.js';

// Primary portal: named students from primary_students, one vote per
// (student, category), recorded in primary_votes. primary_students.has_voted
// position is covered.
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
      res.end(JSON.stringify({ error: 'Student and candidate are required.' }));
      return;
    }
    const sql = getSql();
    const sid = studentId.trim();

    const students = await sql.query('SELECT id FROM primary_students WHERE id = $1', [sid]);
    if (students.length === 0) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Student not found.' }));
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
      'INSERT INTO primary_votes (student_id, candidate_id, category) VALUES ($1, $2, $3) ON CONFLICT (student_id, category) DO NOTHING RETURNING student_id',
      [sid, candidateId, category]
    );
    if (inserted.length === 0) {
      res.statusCode = 409;
      res.end(JSON.stringify({ error: `This voter already voted for ${category}.` }));
      return;
    }

    await sql.query('UPDATE candidates SET primary_vote_count = primary_vote_count + 1 WHERE id = $1', [
      candidateId,
    ]);

    const remaining = await sql.query(
      `SELECT DISTINCT c.category FROM candidates c
       WHERE c.category NOT IN (SELECT v.category FROM primary_votes v WHERE v.student_id = $1)`,
      [sid]
    );
    if (remaining.length === 0) {
      await sql.query('UPDATE primary_students SET has_voted = true WHERE id = $1', [sid]);
    }

    res.statusCode = 200;
    res.end(JSON.stringify({ success: true }));
  } catch {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Could not record vote. Please try again.' }));
  }
}
