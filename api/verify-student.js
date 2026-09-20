import { getSql } from './_db.js';

// Secondary portal only: looks in secondary_students, so primary-only
// IDs and staff codes can never sign in here. Lets a student in when they
// still have at least one unvoted position, and tells the frontend which
// positions they already completed so voting can resume mid-ballot.
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method not allowed.' }));
    return;
  }
  try {
    const { studentId } = req.body || {};
    if (!studentId?.trim()) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Student ID is required.' }));
      return;
    }
    const sql = getSql();
    const sid = studentId.trim();
    const rows = await sql.query('SELECT id, name, has_voted FROM secondary_students WHERE id = $1', [sid]);
    const student = rows[0];
    if (!student) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Invalid Student ID. Please check and try again.' }));
      return;
    }

    const votedRows = await sql.query('SELECT category FROM votes WHERE student_id = $1', [sid]);
    const votedCategories = votedRows.map((r) => r.category);
    const allRows = await sql.query('SELECT DISTINCT category FROM candidates');
    const allCategories = allRows.map((r) => r.category);
    // Done only when every current position is covered. has_voted is just a
    // cached flag: set it when complete, clear it if a new position was
    // added after the student finished (so they can vote in the new one).
    const done = allCategories.length > 0 && allCategories.every((c) => votedCategories.includes(c));

    if (done) {
      if (!student.has_voted) {
        await sql.query('UPDATE secondary_students SET has_voted = true WHERE id = $1', [sid]);
      }
      res.statusCode = 409;
      res.end(JSON.stringify({ error: 'You have already voted!' }));
      return;
    }
    if (student.has_voted) {
      await sql.query('UPDATE secondary_students SET has_voted = false WHERE id = $1', [sid]);
    }

    res.statusCode = 200;
    res.end(JSON.stringify({ studentId: student.id, name: student.name, verified: true, votedCategories }));
  } catch {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Could not verify student. Please try again.' }));
  }
}
