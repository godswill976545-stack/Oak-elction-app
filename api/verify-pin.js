import { getSql } from './_db.js';
import { isAdminPinValid } from './_admin.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method not allowed.' }));
    return;
  }
  try {
    const { pin } = req.body || {};
    const sql = getSql();
    const ok = await isAdminPinValid(pin, sql);
    res.statusCode = 200;
    res.end(JSON.stringify({ ok }));
  } catch {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Could not verify PIN. Please try again.' }));
  }
}
