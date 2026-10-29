import { getSql } from './_db.js';

// Staff login looks ONLY in the staff table, so student IDs can never
// sign in here (and staff codes can never sign in to the student portals).
// One D1 batch = one transaction (see verify-student.js).
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

    const doneSql = `EXISTS (SELECT 1 FROM candidates)
      AND NOT EXISTS (
        SELECT 1 FROM candidates c
        WHERE NOT EXISTS (
          SELECT 1 FROM staff_votes v WHERE v.staff_code = ? AND v.category = c.category
        )
      )`;

    const out = await sql.batch([
      // 1. Resync the cached flag. Demo staff (STF/90%) are exempt — they
      //    vote unlimited times, so the flag stays 0 forever.
      {
        sql: `UPDATE staff SET has_voted = CASE WHEN ${doneSql} THEN 1 ELSE 0 END
              WHERE code = ? AND code NOT LIKE 'STF/90%' AND has_voted IS NOT (CASE WHEN ${doneSql} THEN 1 ELSE 0 END)`,
        params: [code, code, code],
      },
      {
        sql: `SELECT s.code, s.name, s.has_voted,
                     CASE WHEN ${doneSql} THEN 1 ELSE 0 END AS done,
                     COALESCE(
                       (SELECT json_group_array(v.category) FROM staff_votes v WHERE v.staff_code = s.code),
                       '[]'
                     ) AS voted_json
              FROM staff s WHERE s.code = ?`,
        params: [code, code],
      },
    ]);

    const row = out[1]?.results?.[0];
    if (!row) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Invalid staff code. Please check and try again.' }));
      return;
    }
    // Demo staff are always a fresh ballot: ignore accumulated done state
    // and hand over zero categories so every visit starts at 0/13.
    const isDemo = row.code.startsWith('STF/90');
    if (row.done && !isDemo) {
      res.statusCode = 409;
      res.end(JSON.stringify({ error: 'This staff code has already voted!' }));
      return;
    }

    res.statusCode = 200;
    res.end(
      JSON.stringify({
        staffCode: row.code,
        name: row.name,
        verified: true,
        votedCategories: isDemo ? [] : JSON.parse(row.voted_json || '[]'),
      })
    );
  } catch {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Could not verify staff code. Please try again.' }));
  }
}
