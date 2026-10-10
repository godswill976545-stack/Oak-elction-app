import { getSql } from './_db.js';
import { isAdminRequest } from './_admin.js';

// Name search for the primary portal (primary_students only). Returns
// matching students with their primary-ballot progress so the UI can flag
// finished voters and resume partial ballots.
//
// One D1 batch = one transaction: the has_voted backfill runs first, then the
// page is read, so completed voters show has_voted immediately. SQLite can't
// do data-modifying CTEs (Neon could do this in one statement), so it is two.
// Grade ordering uses CAST(class AS INTEGER) — SQLite reads the leading
// digits of '1A'..'12B' (Postgres needed lpad for the same effect).
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method not allowed.' }));
    return;
  }
  try {
    const sql = getSql();
    if (!(await isAdminRequest(req, sql))) {
      res.statusCode = 403;
      res.end(JSON.stringify({ error: 'Admin authorization required.' }));
      return;
    }
    const q = (req.query?.q || '').trim();
    if (q.length < 2) {
      res.statusCode = 200;
      res.end(JSON.stringify([]));
      return;
    }
    // Escape LIKE wildcards; ESCAPE '\' matches. LOWER() on both sides
    // replicates Postgres ILIKE on a case-sensitive SQLite column.
    const escaped = q.replace(/[\\%_]/g, (m) => `\\${m}`);
    const pattern = `%${escaped}%`;

    const completeSql = `EXISTS (SELECT 1 FROM candidates)
      AND NOT EXISTS (
        SELECT 1 FROM candidates c
        WHERE NOT EXISTS (
          SELECT 1 FROM primary_votes v WHERE v.student_id = s.id AND v.category = c.category
        )
      )`;

    const out = await sql.batch([
      // 1. Backfill has_voted for completed students matching this search.
      {
        sql: `UPDATE primary_students SET has_voted = 1
              WHERE has_voted = 0
                AND LOWER(name) LIKE LOWER(?) ESCAPE '\\'
                AND ${completeSql.replaceAll('s.id', 'primary_students.id')}`,
        // One placeholder (the name LIKE); the subquery inlines s.id via
        // replaceAll above, so it binds no params. A second binding here made
        // D1 reject the whole batch with "Wrong number of parameter bindings".
        params: [pattern],
      },
      // 2. Read the page (post-backfill).
      {
        sql: `SELECT s.id, s.name, s.class, s.has_voted,
                     CASE WHEN ${completeSql} THEN 1 ELSE 0 END AS complete,
                     COALESCE(
                       (SELECT json_group_array(v.category) FROM primary_votes v WHERE v.student_id = s.id),
                       '[]'
                     ) AS voted_json
              FROM primary_students s
              WHERE LOWER(s.name) LIKE LOWER(?) ESCAPE '\\'
              ORDER BY CAST(s.class AS INTEGER), s.class, s.name
              LIMIT 20`,
        params: [pattern],
      },
    ]);

    const rows = out[1]?.results ?? [];
    const results = rows.map((r) => ({
      id: r.id,
      name: r.name,
      class: r.class,
      // has_voted was just resynced in statement 1, so it already includes
      // this page's completions; OR in complete as belt-and-braces.
      has_voted: r.has_voted === 1 || r.complete === 1,
      complete: r.complete === 1,
      votedCategories: JSON.parse(r.voted_json || '[]'),
    }));
    res.setHeader('Cache-Control', 'no-store');
    res.statusCode = 200;
    res.end(JSON.stringify(results));
  } catch (e) {
    if (process.env.DEBUG_AUTH) console.error('students-search threw:', (e && e.stack) || e);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Search failed. Please try again.' }));
  }
}
