// Minimal Backblaze B2 native REST client (no SDK, no S3/SigV4).
//
// Two ways data reaches the bucket:
//   * Server-side (putObject/getObject) — used for candidate photos, party
//     logos, and for re-keying candidacy uploads into their final path.
//   * Direct browser upload — B2 native REST DOES support presigned *upload*
//     URLs (b2_get_upload_url). The client gets a short-lived, bucket-scoped
//     uploadUrl + uploadAuthToken and PUTs the file straight to B2, so large
//     files never pass through a serverless function (which is capped at
//     4.5MB by Vercel). The FILE NAME is chosen by the client via the
//     X-Bz-File-Name header, so an upload URL can write any key in the
//     bucket — the upload-url action therefore only mints random, unguessable
//     staging/ keys, and /api/candidacy re-keys them to a path the client
//     could never have written directly.
//   Downloads stay private: served through the authenticated
//   /api/media?candidacy=<id>&slot=<x> proxy instead of a direct link.
//
// Env: B2_KEY_ID (application key ID), B2_APP_KEY (application key),
//      B2_BUCKET_NAME. Optional: B2_API_URL (defaults to the value returned
//      by b2_authorize_account).

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// Authorize once and reuse the token + per-bucket upload URL until they
// expire. B2 auth tokens live ~24h; upload URLs are bucket-scoped and short.
let auth = null; // { apiUrl, downloadUrl, token, bucketId, bucketName, uploadUrl, uploadAuthToken }

function requireEnv() {
  const keyId = process.env.B2_KEY_ID;
  const appKey = process.env.B2_APP_KEY;
  const bucket = process.env.B2_BUCKET_NAME;
  if (!keyId || !appKey || !bucket) {
    throw new Error(
      'Backblaze B2 is not configured. Set B2_KEY_ID, B2_APP_KEY, B2_BUCKET_NAME.'
    );
  }
  return { keyId, appKey, bucket };
}

async function authorize() {
  const { keyId, appKey, bucket } = requireEnv();
  const base = process.env.B2_API_URL || 'https://api.backblazeb2.com';
  const res = await fetch(`${base}/b2api/v2/b2_authorize_account`, {
    headers: { Authorization: 'Basic ' + Buffer.from(`${keyId}:${appKey}`).toString('base64') },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`B2 authorize failed: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  // b2_authorize_account returns the bucket this key is scoped to in `allowed`.
  const allowed = Array.isArray(data.allowed) ? data.allowed[0] : data.allowed;
  auth = {
    apiUrl: data.apiUrl,
    downloadUrl: data.downloadUrl,
    token: data.authorizationToken,
    bucketName: allowed?.bucketName || bucket,
    bucketId: allowed?.bucketId || null,
    uploadUrl: null,
    uploadAuthToken: null,
  };
  return auth;
}

async function ensureAuth() {
  if (!auth) await authorize();
  return auth;
}

async function ensureUploadUrl() {
  const a = await ensureAuth();
  if (a.uploadUrl && a.uploadAuthToken) return a;
  if (!a.bucketId) throw new Error(`B2 key is not scoped to a bucket (bucket "${a.bucketName}" unknown).`);
  const res = await fetch(`${a.apiUrl}/b2api/v2/b2_get_upload_url`, {
    method: 'POST',
    headers: { ...JSON_HEADERS, Authorization: a.token },
    body: JSON.stringify({ bucketId: a.bucketId }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 401) {
      await authorize();
      return ensureUploadUrl();
    }
    throw new Error(`B2 get_upload_url failed: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  a.uploadUrl = data.uploadUrl;
  a.uploadAuthToken = data.authorizationToken;
  return a;
}

// Short-lived, bucket-scoped upload credential for DIRECT browser uploads.
// Contrary to the header comment above, B2 native REST does support presigned
// *uploads*: b2_get_upload_url hands back an uploadUrl + uploadAuthToken that
// authorise one file each, so the file can go browser -> B2 without ever
// passing through a serverless function (which would hit Vercel's 4.5MB body
// cap). Downloads remain proxied via /api/media.
//
// The client must send:
//   Authorization: <uploadAuthToken>
//   Content-Type: <file mime>
//   X-Bz-File-Name: <urlencoded key>
//   X-Bz-Content-Sha1: <hex sha1 of the body>
export async function getUploadUrl() {
  const a = await ensureUploadUrl();
  return { uploadUrl: a.uploadUrl, uploadAuthToken: a.uploadAuthToken };
}

// PUT an object. `body` is a Buffer. Throws on failure.
// B2 requires X-Bz-Content-Sha1 to be the SHA-1 of the body (not SHA-256).
export async function putObject(key, body, contentType) {
  const a = await ensureUploadUrl();
  const sha = await import('node:crypto').then((c) =>
    c.createHash('sha1').update(body).digest('hex')
  );
  const res = await fetch(a.uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: a.uploadAuthToken,
      'Content-Type': contentType || 'application/octet-stream',
      'X-Bz-File-Name': encodeURIComponent(key),
      'X-Bz-Content-Sha1': sha,
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`B2 upload ${key} failed: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return data; // { fileId, fileName, ... }
}

// Delete one object by name. B2 versions files, so this removes the current
// version and the file disappears from name lookups. Staging uploads are
// deleted after /api/candidacy re-keys them into candidacy/<id>/.
export async function deleteObject(key) {
  const a = await ensureAuth();
  // b2_delete_file_by_name needs the fileId of the current version; get it
  // from a name listing rather than a second round-trip API.
  const list = await fetch(
    `${a.apiUrl}/b2api/v2/b2_list_file_names` +
      `?bucketId=${encodeURIComponent(a.bucketId)}&fileName=${encodeURIComponent(key)}&maxFileCount=1`,
    { headers: { Authorization: a.token } }
  );
  if (!list.ok) return false; // already gone / never existed
  const files = (await list.json()).files || [];
  if (files.length === 0) return false;
  const del = await fetch(`${a.apiUrl}/b2api/v2/b2_delete_file_version`, {
    method: 'POST',
    headers: { ...JSON_HEADERS, Authorization: a.token },
    body: JSON.stringify({ fileName: files[0].fileName, fileId: files[0].fileId }),
  });
  return del.ok;
}

// GET an object -> { body: Buffer, contentType, etag } | null (404).
// Downloads via the canonical B2 download host by file name, so no fileId
// lookup round-trip is needed.
export async function getObject(key) {
  const a = await ensureAuth();
  const res = await fetch(
    `${a.downloadUrl}/file/${encodeURIComponent(a.bucketName)}/${encodeURIComponent(key)}`,
    { method: 'GET', headers: { Authorization: a.token } }
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`B2 download ${key} failed: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  return {
    body: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get('content-type'),
    etag: res.headers.get('x-bz-content-sha1') || res.headers.get('etag'),
  };
}

// B2 native REST has no presigned URLs. Candidacy attachments are served via
// the authenticated /api/media?candidacy=<id>&slot=<x> route instead, so this
// stub only exists to satisfy the old import surface. It throws so a stray
// call is loud rather than silently broken.
export function presignGet() {
  throw new Error(
    'presignGet is not supported on Backblaze B2 native REST. Use the /api/media?candidacy=<id>&slot=<x> proxy.'
  );
}
