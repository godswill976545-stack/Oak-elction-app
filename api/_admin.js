import { createHash, timingSafeEqual } from 'node:crypto';

// Server-side admin gate. The browser PIN screen is only UX — every
// privileged mutation must call requireAdmin() because /api/* is reachable
// by anyone on the network. The PIN itself is never stored; only its
// SHA-256 hash lives in admin_secrets (see neon_schema.sql).
export async function isAdminPinValid(pin, sql) {
  const s = typeof pin === 'string' ? pin : String(pin ?? '');
  if (!s) return false;
  const rows = await sql.query("SELECT value FROM admin_secrets WHERE key = 'admin_pin_hash'");
  const expected = rows[0]?.value || '';
  const submitted = createHash('sha256').update(s).digest('hex');
  return (
    expected.length === submitted.length &&
    expected.length > 0 &&
    timingSafeEqual(Buffer.from(submitted), Buffer.from(expected))
  );
}
