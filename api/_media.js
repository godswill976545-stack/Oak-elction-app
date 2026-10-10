// Shared helpers for candidate photos, party logos, and candidacy uploads.
//
// Binary lives in a private B2 bucket; the DB stores only the object key.
// /api/media proxies candidate/party images (public-ish: they appear on the
// ballot) with immutable cache headers. Candidacy attachments are private and
// served through the authenticated /api/media?candidacy=<id>&slot=<x> proxy.

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

// ---- Direct-to-B2 upload flow ------------------------------------------
//
// Vercel caps serverless request bodies at 4.5MB, so a 4.5MB file cannot be
  // inlined into the candidacy JSON. Instead the browser asks the upload-url
// for a presigned B2 upload, PUTs the file straight to B2, and submits only
// the resulting key. B2 upload URLs are bucket-scoped and the FILE NAME is
// chosen by the client, so the minted key is a random, unguessable
// staging/<token> path — a client can never aim an upload at a real
// candidacy/<id>/ or candidates/<id>/ key. On submit, /api/candidacy
// re-keys the staging object into candidacy/<id>/ (a path the client could
// not have written) and deletes the staging copy.

export const MAX_UPLOAD_BYTES = 4_500_000; // 4.5MB — B2 presigned cap is 5MB

export const SLOTS = ['photo', 'cv', 'results', 'signature'];

// Content types accepted per slot. These must cover every type the form's
// file picker offers (CandidateForm.jsx accept attributes) — a mismatch
// means the student fills in the whole form and gets rejected at submit.
// photo/signature images are compressed to JPEG client-side before upload;
// signature also takes a PDF because the form offers .pdf.
const SLOT_TYPES = {
  photo: ['image/jpeg', 'image/png', 'image/webp'],
  cv: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  results: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  signature: ['image/png', 'image/jpeg', 'application/pdf'],
};

export function isValidUpload(slot, mime) {
  if (!SLOTS.includes(slot)) return false;
  return (SLOT_TYPES[slot] || []).includes(mime);
}

// 128-bit random hex token; the unguessable part of a staging key.
export function stagingToken() {
  return import('node:crypto').then((c) => c.randomBytes(16).toString('hex'));
}

export const stagingKey = (token, mime) => `staging/${token}.${extOf(mime)}`;

// A key is "staging" if it lives under the staging/ prefix.
export const isStagingKey = (key) => typeof key === 'string' && key.startsWith('staging/');

const EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};
export function extFor(mime) {
  return EXT[mime] || 'bin';
}
const extOf = extFor;
