// Cloudflare D1 client over the public REST API.
//
// D1 is only reachable from a Vercel function via this HTTP API (no TCP).
// Global budget is 1200 requests / 5 min per token, so the app mitigates with
// CDN caching on hot GETs and by keeping auth token checks D1-free. If the
// budget is ever hit, the escape hatch is a tiny proxy Worker that serves the
// same endpoints with an unlimited internal limit — only this file's base URL
// would change.
//
// Ergonomics mirror the old Neon client so handlers barely change:
//   sql.query(text, params)  -> rows (array of objects)
//   sql.batch([{text,params}]) -> rows[] per statement (one transaction)
//
// Note: D1 is SQLite. Handlers must use ? placeholders, LOWER() LIKE, and
// json_group_array instead of Postgres-isms; batch() is the only "transaction".

const BASE = 'https://api.cloudflare.com/client/v4';

function config() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.D1_DATABASE_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !databaseId || !token) {
    throw new Error(
      'D1 is not configured. Set CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID and CLOUDFLARE_API_TOKEN.'
    );
  }
  return { accountId, databaseId, token };
}

// D1 REST wraps failures in HTTP 4xx/5xx with { errors:[{code,message}] }.
// 1054 etc. are SQL errors — surface them as real errors, not silent nulls.
class D1Error extends Error {
  constructor(status, errors, sql) {
    const msg = errors?.[0]?.message || `D1 HTTP ${status}`;
    super(`D1 error: ${msg}`);
    this.status = status;
    this.d1Code = errors?.[0]?.code;
    this.sql = sql;
  }
}

async function post(path, body) {
  const { accountId, databaseId, token } = config();
  const res = await fetch(`${BASE}/accounts/${accountId}/d1/database/${databaseId}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    const err = new Error('Database rate limit reached. Please retry shortly.');
    err.rateLimited = true;
    throw err;
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new D1Error(res.status, json.errors, body.sql);
  }
  return json;
}

// One statement. Returns the result rows.
// D1 answers 404/409 for "no rows" on some statements? No — empty results are
// just empty arrays; those status codes come from the CDN, not D1, so nothing
// special here beyond surfacing real errors.
async function query(text, params = []) {
  const json = await post('/query', { sql: text, params });
  return json.result?.[0]?.results ?? [];
}

// Sequential statements in ONE transaction: later statements see earlier
// writes, and any failure rolls the whole batch back (D1 guarantees this).
// Returns the full per-statement results: [{ results, meta }] — handlers use
// meta.changes to detect "did the INSERT actually insert" (ON CONFLICT DO
// NOTHING reports 0 changes) without a second round trip.
async function batch(statements) {
  if (!Array.isArray(statements) || statements.length === 0) return [];
  const body = {
    batch: statements.map((s) =>
      typeof s === 'string' ? { sql: s, params: [] } : { sql: s.text ?? s.sql, params: s.params ?? [] }
    ),
  };
  // Batch statements ride the same /query route as single statements — the
  // body carries a `batch` array instead of `sql`/`params`. There is no
  // /batch route (it 404s), which is why every .batch() call used to throw.
  const json = await post('/query', body);
  return json.result ?? [];
}

// INSERT/UPDATE ... RETURNING convenience: returns the first row or null.
async function queryOne(text, params = []) {
  const rows = await query(text, params);
  return rows[0] ?? null;
}

let _sql = null;

// Lazily create the client so importing this module never throws when the
// env is unset (e.g. during `vite build`).
export function getSql() {
  if (_sql) return _sql;
  config(); // fail fast with a clear message when actually used
  _sql = { query, queryOne, batch };
  return _sql;
}
