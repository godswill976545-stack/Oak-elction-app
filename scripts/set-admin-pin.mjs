// Set (or rotate) the admin PIN in D1. Replaces the tracked default PIN.
//
// Usage:
//   node scripts/set-admin-pin.mjs              # prompts via env ADMIN_NEW_PIN
//   ADMIN_NEW_PIN=4821 node scripts/set-admin-pin.mjs
//   node scripts/set-admin-pin.mjs --name ops-2 # add a second named PIN
//
// Writes SHA-256 hex into admin_pins (and the legacy admin_secrets row so
// old code paths keep working). Never prints the plaintext PIN.

import { createHash } from 'node:crypto';
import { getSql } from '../api/_db.js';
import { clearPinCache } from '../api/_admin.js';

const args = process.argv.slice(2);
const nameIdx = args.indexOf('--name');
const name = nameIdx >= 0 ? args[nameIdx + 1] : 'default';
const pin = process.env.ADMIN_NEW_PIN || args.find((a) => /^\d{4,8}$/.test(a));

if (!pin) {
  console.error('Provide the new PIN via ADMIN_NEW_PIN env or as a numeric argument.');
  process.exit(1);
}

const hash = createHash('sha256').update(String(pin)).digest('hex');
const sql = getSql();

await sql.query(
  `INSERT INTO admin_pins (name, pin_hash) VALUES (?, ?)
   ON CONFLICT (name) DO UPDATE SET pin_hash = excluded.pin_hash`,
  [name, hash]
);
// Keep the legacy single-secret row in sync when editing the default PIN so
// any code still reading admin_secrets sees the same hash.
if (name === 'default') {
  await sql.query(
    `INSERT INTO admin_secrets (key, value) VALUES ('admin_pin_hash', ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    [hash]
  );
}

clearPinCache();
console.log(`PIN hash for '${name}' updated. Plaintext was not stored or printed.`);
