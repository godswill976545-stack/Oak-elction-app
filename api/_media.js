// Shared helpers for candidate photos and party logos.
//
// Binary lives in a private R2 bucket; the DB stores only the object key.
// /api/media proxies candidate/party images (public-ish: they appear on the
// ballot) with immutable cache headers; candidacy attachments get short-lived
// presigned URLs from /api/candidacy instead (see _b2.js).

export const mediaUrl = (kind, key) => `/api/media?${kind}=${encodeURIComponent(key)}`;

// "data:image/jpeg;base64,<...>" -> { mime, bytes: Buffer } so callers can
// upload it to R2. Anything else (an https URL, empty, malformed) -> null,
// and the caller keeps the original string.
export function splitDataUrl(value) {
  if (typeof value !== 'string') return null;
  const m = /^data:([^;,]+);base64,(.*)$/.exec(value.trim());
  if (!m) return null;
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length === 0) return null;
  return { mime: m[1], bytes };
}

// R2 object keys. Content is addressed by owning entity id, so re-uploading
// a photo for the same candidate overwrites the same key (cache-busting via
// the new ETag; keys are not versioned on purpose — one photo per candidate).
export const candidatePhotoKey = (id, mime) => `candidates/${id}/photo.${extOf(mime)}`;
export const partyLogoKey = (name, mime) =>
  `parties/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/logo.${extOf(mime)}`;
export const candidacyKey = (id, slot, mime) =>
  `candidacy/${id}/${slot}.${extOf(mime)}`;

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' };
export function extFor(mime) {
  return EXT[mime] || 'bin';
}
const extOf = extFor;
