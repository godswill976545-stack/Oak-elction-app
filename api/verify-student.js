import { getSql } from './_db.js';

// Secondary portal only: looks in secondary_students, so primary-only
// IDs and staff codes can never sign in here. Lets a student in when they
// still have at least one unvoted position, and tells the frontend which
// positions they already completed so voting can resume mid-ballot.
//
// One D1 batch (one transaction): resync has_voted both ways (also clears the
// flag when a position was added after the student finished), then read the
// state. SQLite can't do data-modifying CTEs, so this is two statements
// instead of Neon's one.
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

    // done := every current candidate category has a vote row. Computed in SQL
    // so the UPDATE and the SELECT below always agree.
    const doneSql = `EXISTS (SELECT 1 FROM candidates)
      AND NOT EXISTS (
        SELECT 1 FROM candidates c
        WHERE NOT EXISTS (
          SELECT 1 FROM votes v WHERE v.student_id = ? AND v.category = c.category
        )
      )`;

    const out = await sql.batch([
      // 1. Resync the cached flag (set when done, clear when a new position
      //    appeared after the student finished). DEMO-% voters are exempt —
      //    they vote unlimited times, so the flag stays 0 forever.
      {
        sql: `UPDATE secondary_students SET has_voted = CASE WHEN ${doneSql} THEN 1 ELSE 0 END
              WHERE id = ? AND id NOT LIKE 'DEMO-%' AND has_voted IS NOT (CASE WHEN ${doneSql} THEN 1 ELSE 0 END)`,
        params: [sid, sid, sid],
      },
      // 2. Read the post-sync state.
      {
        sql: `SELECT s.id, s.name, s.has_voted,
                     CASE WHEN ${doneSql} THEN 1 ELSE 0 END AS done,
                     COALESCE(
                       (SELECT json_group_array(v.category) FROM votes v WHERE v.student_id = s.id),
                       '[]'
                     ) AS voted_json
              FROM secondary_students s WHERE s.id = ?`,
        params: [sid, sid],
      },
    ]);

    const row = out[1]?.results?.[0];
    if (!row) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Invalid Student ID. Please check and try again.' }));
      return;
    }
    // Demo voters are always a fresh ballot: ignore any accumulated done
    // state and hand over zero categories so every visit starts at 0/13.
    const isDemo = row.id.startsWith('DEMO-');
    if (row.done && !isDemo) {
      res.statusCode = 409;
      res.end(JSON.stringify({ error: 'You have already voted!' }));
      return;
    }

    res.statusCode = 200;
    res.end(
      JSON.stringify({
        studentId: row.id,
        name: row.name,
        verified: true,
        votedCategories: isDemo ? [] : JSON.parse(row.voted_json || '[]'),
      })
    );
  } catch {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Could not verify student. Please try again.' }));
  }
}
