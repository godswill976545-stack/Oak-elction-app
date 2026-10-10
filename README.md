# Pro Election App

School election app (primary + secondary portals) with admin dashboard. Runs on Vercel; data in Cloudflare D1 (SQLite) via the D1 REST API; media in a private Backblaze B2 bucket served through `/api/media`.

## Stack

- **Frontend:** React + Vite (in `src/`)
- **Backend:** Express-style handlers in `api/`, deployed as Vercel serverless functions
- **Database:** Cloudflare D1 over REST (`api/_db.js` — no DB driver dependency)
- **Media:** Private Backblaze B2 bucket, native REST client in `api/_b2.js` (no S3/SigV4, no SDK); URLs minted by `api/_media.js`, served by `api/media.js`
- **Auth:** Admin PIN → signed HMAC session token (`api/_admin.js`), verified stateless in-memory (`isAdminRequest`), rate-limited (`api/_rate.js`)

## Environment

Copy `.env.example` → `.env` and fill in. Known IDs are pre-filled; you must supply:

- `CLOUDFLARE_API_TOKEN` — API token with D1 edit (create in the Cloudflare dashboard; MCP OAuth cannot create tokens)
- `B2_KEY_ID` / `B2_APP_KEY` / `B2_BUCKET_NAME` — Backblaze B2 application key (scoped to the media bucket) and bucket name
- `ADMIN_SESSION_SECRET` — long random string (token signing)
- `DATABASE_URL` — Neon connection string, **only** needed to run the one-time migration

## Database

Schema lives in `d1_schema.sql` (source of truth). `neon_schema.sql` is kept only as the parity reference for the migration and will be deleted after cutover.

Apply / re-apply:

```
npx wrangler d1 execute pro-election-app --remote --file=d1_schema.sql
```

## Migration (one-time, from Neon)

Copies all rows Neon → D1 and (optionally) media Neon → B2. Re-runnable and idempotent:

```
node --env-file=.env scripts/migrate-neon-to-d1.mjs --with-media --verify
```

Keep Neon online for ~1 week after cutover, then tear down.

## Admin PIN

PINs are never stored; only SHA-256 hashes. Set or rotate the admin PIN (writes the hash into D1, falls back to `ADMIN_PIN_HASH` env if the table is empty):

```
npm run pin
```

## Local dev

```
npm install
npm run dev      # Vite frontend
npm run server   # API on :3001 (uses D1 + B2 from .env)
```

## Scripts

- `npm run build` — Vite production build
- `npm run lint` — ESLint
- `npm run pin` — set/rotate admin PIN
- `scripts/migrate-neon-to-d1.mjs` — Neon → D1/B2 migration
- `scripts/seed-roster.mjs` — import the real voter roll (contains pupil PII; gitignored, run locally only)

## Deployment

Push to `master` → Vercel picks up `api/` as serverless functions and serves the built frontend. CI (GitHub Actions) runs `npm ci`, `npm run lint`, and `npm run build` on `master`.

## API surface

`/api/candidates`, `/api/parties`, `/api/candidacy`, `/api/media`, `/api/verify-pin`, `/api/verify-student`, `/api/verify-staff`, `/api/students-search`, `/api/staff`, `/api/vote-primary`, `/api/vote-secondary`, `/api/vote-staff`.

Admin endpoints require the signed token (`x-admin-token` header; `x-admin-pin` still accepted during migration). Public GETs are cache-friendly (`s-maxage`); admin GETs are `no-store`.
