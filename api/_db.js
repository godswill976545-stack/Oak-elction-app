import { neon } from '@neondatabase/serverless';

let _sql = null;

// Lazily create the Neon HTTP client so importing this module never throws
// when DATABASE_URL is unset (e.g. during `vite build`).
export function getSql() {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set on the server.');
  _sql = neon(url);
  return _sql;
}
