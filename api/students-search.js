import { getSql } from './_db.js';

// Name search for the primary portal (primary_students only). Returns
// matching students with their primary-ballot progress so the UI can flag
// finished voters and resume partial ballots.
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method not allowed.' }));
    return;
  }
  try {
    const q = (req.query?.q || '').trim();
    if (q.length < 2) {
      res.statusCode = 200;
      res.end(JSON.stringify([]));
      return;
    }
    const sql = getSql();
    const students = await sql.query(
      'SELECT id, name, has_voted FROM primary_students WHERE name ILIKE $1 ORDER BY name LIMIT 20',
      [`%${q}%`]
    );
    const catRows = await sql.query('SELECT DISTINCT category FROM candidates');
    const allCategories = catRows.map((r) => r.category);
    const out = await Promise.all(
      students.map(async (s) => {
        const votedRows = await sql.query('SELECT category FROM primary_votes WHERE student_id = $1', [s.id]);
        const votedCategories = votedRows.map((r) => r.category);
        const complete =
          allCategories.length > 0 && allCategories.every((c) => votedCategories.includes(c));
        if (complete && !s.has_voted) {
          await sql.query('UPDATE primary_students SET has_voted = true WHERE id = $1', [s.id]);
        }
        return { id: s.id, name: s.name, complete, votedCategories };
      })
    );
    res.statusCode = 200;
    res.end(JSON.stringify(out));
  } catch {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Search failed. Please try again.' }));
  }
}
