import { getSql } from './_db.js';

// Secondary portal: one vote per (student, category), enforced by the
// PRIMARY KEY on public.votes. secondary_students.has_voted flips only once
// position is covered, so voters can finish remaining categories across sessions.
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

    const students = await sql.query('SELECT id FROM secondary_students WHERE id = $1', [sid]);
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

    // Atomic claim: only one request can insert this (student, category).
    const inserted = await sql.query(
      'INSERT INTO votes (student_id, candidate_id, category) VALUES ($1, $2, $3) ON CONFLICT (student_id, category) DO NOTHING RETURNING student_id',
      [sid, candidateId, category]
    );
    if (inserted.length === 0) {
      res.statusCode = 409;
      res.end(JSON.stringify({ error: `You already voted for ${category}.` }));
      return;
    }

    await sql.query('UPDATE candidates SET secondary_vote_count = secondary_vote_count + 1 WHERE id = $1', [
      candidateId,
    ]);

    // Close out the ballot once every position is covered.
    const remaining = await sql.query(
      `SELECT DISTINCT c.category FROM candidates c
       WHERE c.category NOT IN (SELECT v.category FROM votes v WHERE v.student_id = $1)`,
      [sid]
    );
    if (remaining.length === 0) {
      await sql.query('UPDATE secondary_students SET has_voted = true WHERE id = $1', [sid]);
    }

    res.statusCode = 200;
    res.end(JSON.stringify({ success: true }));
  } catch {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Could not record vote. Please try again.' }));
  }
}
