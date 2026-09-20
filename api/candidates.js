import { getSql } from './_db.js';

function send(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const sql = getSql();
      const rows = await sql.query(
        `SELECT c.id, c.name, c.category, c.manifesto, c.photo_url, c.party,
                c.primary_vote_count, c.secondary_vote_count, c.staff_vote_count,
                p.short_code AS party_code, p.logo_url AS party_logo
         FROM candidates c LEFT JOIN parties p ON p.name = c.party
         ORDER BY c.category, c.name`
      );
      return send(res, 200, rows);
    } catch {
      return send(res, 500, { error: 'Could not load candidates.' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { name, category, manifesto, photo_url, party } = req.body || {};
      if (!name?.trim() || !category?.trim() || !manifesto?.trim() || !photo_url) {
        return send(res, 400, { error: 'All fields are required: Name, Manifesto, and Photo.' });
      }
      const sql = getSql();
      let partyName = null;
      if (party) {
        const found = await sql.query('SELECT name FROM parties WHERE name = $1', [party]);
        if (found.length === 0) return send(res, 400, { error: 'Unknown political party.' });
        partyName = found[0].name;
      }
      const id = `${name.trim().toLowerCase().replace(/\s+/g, '-')}-${Date.now().toString(36)}`;
      await sql.query(
        'INSERT INTO candidates (id, name, category, manifesto, photo_url, party, primary_vote_count, secondary_vote_count, staff_vote_count) VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 0)',
        [id, name.trim(), category, manifesto.trim(), photo_url, partyName]
      );
      return send(res, 201, { id, name: name.trim(), category, manifesto: manifesto.trim(), photo_url, party: partyName });
    } catch {
      return send(res, 500, { error: 'Could not register candidate.' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return send(res, 405, { error: 'Method not allowed.' });
}
