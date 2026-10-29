import { getSql } from './_db.js';

// Primary portal: named students from primary_students, one vote per
// (student, category), recorded in primary_votes. primary_students.has_voted
// flips once every position is covered.
//
// DEMO-% students are demo voters with UNLIMITED voting: the partial unique
// index (see d1_schema.sql) excludes them, so every vote inserts and
// has_voted never flips. Live results still tick per vote.
//
// SQLite has no data-modifying CTEs, so the whole ballot write is ONE batch
// (D1 runs it as a single transaction; later statements see earlier writes).
// `changes()` lets later statements react to whether the INSERT actually
// inserted (ON CONFLICT DO NOTHING reports 0), so the batch stays static SQL.
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

    const out = await sql.batch([
      // 1. Diagnostics up front.
      {
        sql: `SELECT
                (SELECT COUNT(*) FROM primary_students WHERE id = ?) AS student_found,
                (SELECT COUNT(*) FROM candidates WHERE id = ?) AS candidate_found,
                (SELECT category FROM candidates WHERE id = ?) AS category`,
        params: [sid, candidateId, candidateId],
      },
      // 2. Insert the vote (no-op on conflict). The partial unique index only
      //    covers non-DEMO voters, so its conflict target filters on that
      //    same predicate — demo voters bypass it and insert every time.
      {
        sql: `INSERT INTO primary_votes (student_id, candidate_id, category)
              SELECT ?, c.id, c.category
              FROM candidates c
              WHERE c.id = ?
                AND EXISTS (SELECT 1 FROM primary_students WHERE id = ?)
              ON CONFLICT (student_id, category) WHERE student_id NOT LIKE 'DEMO-%' DO NOTHING`,
        params: [sid, candidateId, sid],
      },
      // 3. Bump the tally only if statement 2 inserted.
      {
        sql: `UPDATE candidates SET primary_vote_count = primary_vote_count + 1
              WHERE id = ? AND (SELECT changes()) > 0`,
        params: [candidateId],
      },
      // 4. Flip has_voted when the ballot is now complete. changes() here
      //    mirrors statement 3, which mirrors statement 2's insert. Demo
      //    voters never flip (they can keep voting forever).
      {
        sql: `UPDATE primary_students SET has_voted = 1
              WHERE id = ?
                AND id NOT LIKE 'DEMO-%'
                AND (SELECT changes()) > 0
                AND (SELECT COUNT(*) FROM candidates) > 0
                AND NOT EXISTS (
                  SELECT 1 FROM candidates c
                  WHERE NOT EXISTS (
                    SELECT 1 FROM primary_votes v
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
      res.end(JSON.stringify({ error: `This voter already voted for ${diag.category}.` }));
      return;
    }

    res.statusCode = 200;
    res.end(JSON.stringify({ success: true, ballotComplete: flagged > 0 }));
  } catch {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Could not record vote. Please try again.' }));
  }
}
