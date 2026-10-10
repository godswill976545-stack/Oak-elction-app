import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

// Server-side admin gate. The browser PIN screen is only UX — every
// privileged mutation must pass isAdminRequest() because /api/* is reachable
// by anyone on the network. PINs are never stored; only their SHA-256 hashes
// live in admin_pins (one row per admin, see d1_schema.sql).
//
// Auth flow: POST /api/verify-pin checks the PIN (rate-limited) and returns a
// signed session token (v1.<payload>.<sig>, 12h). Every later request carries
// it in the x-admin-token header. Token verification is pure HMAC — no D1
// call — which keeps privileged reads inside the 1200-req/5min REST budget.

const PIN_CACHE_MS = 60_000;
let _pinCache = null;

const TOKEN_VERSION = 'v1';
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function sessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error('ADMIN_SESSION_SECRET is not set on the server.');
  }
  return secret;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

// Issue a signed token for an authenticated admin session.
export function issueAdminToken() {
  const payload = b64url(JSON.stringify({ v: TOKEN_VERSION, exp: Date.now() + TOKEN_TTL_MS }));
  const sig = createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  return `${TOKEN_VERSION}.${payload}.${sig}`;
}

// Pure-HMAC check: valid signature + unexpired. No D1 round trip.
export function isAdminTokenValid(token) {
  const s = typeof token === 'string' ? token : '';
  const parts = s.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return false;
  const [, payload, sig] = parts;

  const expected = createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.v === TOKEN_VERSION && typeof data.exp === 'number' && data.exp > Date.now();
  } catch {
    return false;
  }
}

async function loadPinHashes(sql) {
  if (_pinCache && Date.now() - _pinCache.at < PIN_CACHE_MS) return _pinCache.hashes;
  const hashes = [];
  try {
    const rows = await sql.query('SELECT pin_hash FROM admin_pins');
    for (const r of rows) if (r.pin_hash) hashes.push(r.pin_hash);
  } catch {
    // Table missing (very old DB): fall back to the legacy single PIN row.
    const rows = await sql.query("SELECT value FROM admin_secrets WHERE key = 'admin_pin_hash'");
    if (rows[0]?.value) hashes.push(rows[0].value);
  }
  // An empty admin_pins table must NOT silently succeed: if no hashes at all
  // (fresh DB, or someone emptied the table), fall through to admin_secrets
  // so a pre-seeded legacy PIN still works, and if that is empty too the
  // some() below returns false = lockout (correct fail-closed behavior).
  if (hashes.length === 0) {
    try {
      const rows = await sql.query("SELECT value FROM admin_secrets WHERE key = 'admin_pin_hash'");
      if (rows[0]?.value) hashes.push(rows[0].value);
    } catch {
      // ignore — locked out below
    }
  }
  _pinCache = { hashes, at: Date.now() };
  return hashes;
}

// Test-only: clear the PIN hash cache (used by scripts/set-admin-pin.mjs).
export function clearPinCache() {
  _pinCache = null;
}

export async function isAdminPinValid(pin, sql) {
  const s = typeof pin === 'string' ? pin : String(pin ?? '');
  if (!s) return false;
  const submitted = createHash('sha256').update(s).digest('hex');
  const hashes = await loadPinHashes(sql);
  return hashes.some(
    (expected) =>
      expected.length === submitted.length &&
      expected.length > 0 &&
      timingSafeEqual(Buffer.from(submitted), Buffer.from(expected))
  );
}

// GET endpoints can't carry a JSON body, so privileged reads pass the token
// in the x-admin-token header. During migration we also accept the legacy
// x-admin-pin header (still valid, just one more D1 call to check).
export async function isAdminRequest(req, sql) {
  const token = req.headers?.['x-admin-token'] ?? req.body?.adminToken ?? '';
  if (token && isAdminTokenValid(token)) return true;
  const pin = req.headers?.['x-admin-pin'] ?? req.body?.adminPin ?? '';
  if (pin) return isAdminPinValid(pin, sql);
  return false;
}

// For handlers that want to reject expired tokens with a distinct status so
// the UI can prompt for re-auth instead of a generic 403.
export function tokenExpired(req) {
  const token = req.headers?.['x-admin-token'] ?? req.body?.adminToken ?? '';
  if (!token) return false;
  return !isAdminTokenValid(token);
}
