// Shared in-memory rate limiter for admin auth endpoints.
//
// Process-local (fine for a single kiosk / dev; on Vercel each instance has
// its own bucket, which still thwarts naive brute force). Extracted so
// /api/verify-pin, /api/staff and every other privileged mutation share one
// implementation instead of copy-pasting the Map dance.
//
// Usage:
//   const limiter = rateLimiter({ max: 5, windowMs: 10 * 60 * 1000 });
//   if (!limiter.allow(ip)) { ... 429 ... }
//   limiter.reset(ip); // on success

export function rateLimiter({ max = 5, windowMs = 10 * 60 * 1000 } = {}) {
  const attempts = new Map();

  return {
    // true = this request may proceed; false = caller is over the limit.
    allow(key) {
      const now = Date.now();
      const rec = attempts.get(key);
      if (!rec) return true;
      if (now - rec.first >= windowMs) {
        attempts.delete(key);
        return true;
      }
      return rec.count < max;
    },
    // Record one failed attempt. Call only AFTER allow() returned true.
    fail(key) {
      const now = Date.now();
      const rec = attempts.get(key);
      if (rec && now - rec.first < windowMs) rec.count += 1;
      else attempts.set(key, { count: 1, first: now });
    },
    // Clear the record (e.g. after a successful PIN check).
    reset(key) {
      attempts.delete(key);
    },
  };
}

// Extract the caller IP the same way everywhere.
export function clientIp(req) {
  return (
    req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

// Uniform 429 response used by every limited endpoint.
export function tooMany(res, send) {
  send(res, 429, { error: 'Too many attempts. Try again later.' });
}
