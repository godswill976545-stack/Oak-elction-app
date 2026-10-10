import { getSql } from './_db.js';
import { isAdminPinValid, issueAdminToken } from './_admin.js';
import { rateLimiter, clientIp } from './_rate.js';

// Rate limit: 5 failed attempts per IP per 10 minutes -> 429, then the IP
// cools down. Shared limiter (see _rate.js). On success we clear the record
// so a legitimate admin is not locked out by earlier typos.
const limiter = rateLimiter({ max: 5, windowMs: 10 * 60 * 1000 });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
  try {
    const ip = clientIp(req);
    if (!limiter.allow(ip)) {
      await delay(1500);
      return send(res, 429, { error: 'Too many attempts. Try again later.' });
    }
    const { pin } = req.body || {};
    const sql = getSql();
    const ok = await isAdminPinValid(pin, sql);
    if (!ok) {
      limiter.fail(ip);
      // Same 200 + ok:false as before: the PIN screen treats it as "wrong
      // PIN" without leaking whether the account exists.
      return send(res, 200, { ok: false });
    }
    limiter.reset(ip);
    // Signed session token; the browser stores it and sends x-admin-token on
    // every later privileged call. No D1 round trip to verify it.
    return send(res, 200, { ok: true, token: issueAdminToken() });
  } catch (e) {
    if (process.env.DEBUG_AUTH) console.error('verify-pin threw:', e && e.stack || e);
    return send(res, 500, { error: 'Could not verify PIN. Please try again.' });
  }
}
