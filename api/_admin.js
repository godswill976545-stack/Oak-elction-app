import { createHash, timingSafeEqual } from 'node:crypto';

// Server-side admin gate. The browser PIN screen is only UX — every
// privileged mutation must call isAdminPinValid() because /api/* is reachable
// by anyone on the network. PINs are never stored; only their SHA-256 hashes
// live in admin_pins (one row per admin, see neon_schema.sql).
export async function isAdminPinValid(pin, sql) {
  const s = typeof pin === 'string' ? pin : String(pin ?? '');
  if (!s) return false;
  const submitted = createHash('sha256').update(s).digest('hex');
  const hashes = [];
  try {
    const rows = await sql.query('SELECT pin_hash FROM admin_pins');
    for (const r of rows) if (r.pin_hash) hashes.push(r.pin_hash);
  } catch {
    // Table missing (very old DB): fall back to the legacy single PIN row.
    const rows = await sql.query("SELECT value FROM admin_secrets WHERE key = 'admin_pin_hash'");
    if (rows[0]?.value) hashes.push(rows[0].value);
  }
  return hashes.some(
    (expected) =>
      expected.length === submitted.length &&
      expected.length > 0 &&
      timingSafeEqual(Buffer.from(submitted), Buffer.from(expected))
  );
}
