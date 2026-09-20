import { createHash, timingSafeEqual } from 'node:crypto';
import { getSql } from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method not allowed.' }));
    return;
  }
  try {
    const { pin } = req.body || {};
    if (typeof pin !== 'string' || !pin) {
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: false }));
      return;
    }
    const sql = getSql();
    const rows = await sql.query("SELECT value FROM admin_secrets WHERE key = 'admin_pin_hash'");
    const expected = rows[0]?.value || '';
    const submitted = createHash('sha256').update(pin).digest('hex');
    const ok =
      expected.length === submitted.length &&
      expected.length > 0 &&
      timingSafeEqual(Buffer.from(submitted), Buffer.from(expected));
    res.statusCode = 200;
    res.end(JSON.stringify({ ok }));
  } catch {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Could not verify PIN. Please try again.' }));
  }
}
