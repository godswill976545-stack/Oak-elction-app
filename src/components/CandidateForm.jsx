import React, { useState, useEffect } from 'react';
import { submitCandidacy, fetchParties, requestUploadUrl } from '../supabaseClient';
import { ScrollText, CheckCircle2, ShieldAlert, UploadCloud, XCircle, FileText, Award } from 'lucide-react';
// eslint-disable-next-line no-unused-vars -- used in JSX as <motion.button>
import { motion } from 'framer-motion';

const POSITIONS = [
  'Head Boy',
  'Head Girl',
  'Social Prefect',
  'Sports Prefect (Male)',
  'Sports Prefect (Female)',
  'Food Prefect',
  'Health and Hygiene Prefect',
  'Assistant Food Prefect',
  "Crown's Captain",
  "Root's Captain",
  "Trunk's Captain",
  "Acorn's Captain",
];

// Files go straight to B2 (see the upload-url action + _media.js), so the only
// limit is B2's presigned cap: 4.5MB, enforced here and again on the server.
const MAX_FILE_BYTES = 4_500_000;
const MAX_FILE_LABEL = '4.5MB';

// Downscale large photos/results images so ballots stay light. Returns a
// JPEG blob (not a data-URL — the blob is what gets PUT to B2).
const compressImage = (file, maxDim = 1600, quality = 0.82) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not read that image.'))), 'image/jpeg', quality);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image.'));
    };
    img.src = url;
  });

// Upload one blob straight to B2 via a presigned URL, then return the
// staging key the server will re-key on submit.
const sha1Hex = async (blob) => {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-1', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

const uploadToB2 = async (blob, slot, mime) => {
  const info = await requestUploadUrl(slot, mime);
  const res = await fetch(info.uploadUrl, {
    method: info.method,
    headers: { ...info.headers, 'X-Bz-Content-Sha1': await sha1Hex(blob) },
    body: blob,
  });
  if (!res.ok) {
    throw new Error('An upload failed. Please check your connection and try again.');
  }
  return info.key;
};

const emptyForm = {
  surname: '',
  given_names: '',
  gender: '',
  class: '',
  intended_post: '',
  party: '',
  held_post: null,
  held_position: '',
  ran_before: null,
  ran_position: '',
  disciplinary: null,
  disciplinary_details: '',
  motivation: '',
  achievements: '',
  attest_name: '',
};

const YesNo = ({ label, value, onChange }) => (
  <div className="form-group">
    <span className="form-label">{label}</span>
    <div className="yesno-row" role="radiogroup" aria-label={label}>
      {[true, false].map((opt) => (
        <button
          key={String(opt)}
          type="button"
          role="radio"
          aria-checked={value === opt}
          className={`yesno-btn ${value === opt ? 'is-on' : ''}`}
          onClick={() => onChange(opt)}
        >
          {opt ? 'Yes' : 'No'}
        </button>
      ))}
    </div>
  </div>
);

const CandidateForm = () => {
  const [form, setForm] = useState(emptyForm);
  const [photo, setPhoto] = useState(null);
  const [cv, setCv] = useState(null);
  const [results, setResults] = useState(null);
  const [signature, setSignature] = useState(null);
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reference, setReference] = useState(null);
  const [parties, setParties] = useState([]);

  useEffect(() => {
    fetchParties().then(setParties).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const setBool = (k) => (v) => setForm((p) => ({ ...p, [k]: v }));

  // Pick-time work is validation + downscale only; the actual upload to B2
  // happens at submit so a student who abandons the form never leaves files
  // behind, and a slow upload doesn't block them from filling the rest.
  const handlePhoto = async (file) => {
    if (!file) return;
    setError('');
    if (file.size > MAX_FILE_BYTES) {
      setError(`Photo must be under ${MAX_FILE_LABEL}.`);
      return;
    }
    try {
      const blob = await compressImage(file);
      setPhoto({ name: file.name, blob, mime: 'image/jpeg', preview: URL.createObjectURL(blob) });
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDoc = async (file, kind) => {
    if (!file) return;
    setError('');
    if (file.size > MAX_FILE_BYTES) {
      setError(`${kind === 'cv' ? 'CV' : 'Results file'} must be under ${MAX_FILE_LABEL}.`);
      return;
    }
    try {
      const setter = kind === 'cv' ? setCv : setResults;
      if (file.type.startsWith('image/')) {
        setter({ name: file.name.replace(/\.[^.]+$/, '') + '.jpg', blob: await compressImage(file), mime: 'image/jpeg' });
      } else {
        setter({ name: file.name, blob: file, mime: file.type || 'application/pdf' });
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSignature = async (file) => {
    if (!file) return;
    setError('');
    if (file.size > MAX_FILE_BYTES) {
      setError(`Signature file must be under ${MAX_FILE_LABEL}.`);
      return;
    }
    try {
      if (file.type.startsWith('image/')) {
        setSignature({ name: file.name.replace(/\.[^.]+$/, '') + '.jpg', blob: await compressImage(file, 800, 0.85), mime: 'image/jpeg' });
      } else {
        // The picker offers image/* and .pdf; fall back to PDF when the
        // browser reports no type (matches the only non-image option).
        setSignature({ name: file.name, blob: file, mime: file.type || 'application/pdf' });
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    const missing = [];
    if (!form.surname.trim()) missing.push('Surname');
    if (!form.given_names.trim()) missing.push('Given names');
    if (!form.gender) missing.push('Gender');
    if (!form.class.trim()) missing.push('Class');
    if (!form.intended_post) missing.push('Intended post');
    if (form.held_post === null) missing.push('Held a post?');
    if (form.held_post && !form.held_position.trim()) missing.push('Position held');
    if (form.ran_before === null) missing.push('Ran before?');
    if (form.ran_before && !form.ran_position.trim()) missing.push('Position contested');
    if (form.disciplinary === null) missing.push('Disciplinary cases?');
    if (form.disciplinary && !form.disciplinary_details.trim()) missing.push('Disciplinary details');
    if (!form.motivation.trim()) missing.push('Motivation');
    if (!photo) missing.push('Passport photo');
    if (!cv) missing.push('CV');
    if (!results) missing.push('Exam results');
    if (!attested) missing.push('Attestation checkbox');
    if (!signature) missing.push('Signature (uploaded e-signature)');
    if (missing.length > 0) {
      setError(`Please complete: ${missing.join(', ')}.`);
      return;
    }
    setBusy(true);
    setError('Uploading your files…');
    try {
      // Files go straight to B2 (not through the server, which is capped at
      // 4.5MB per request). Only the staging keys ride in the JSON below.
      const [photoKey, cvKey, resultsKey, signatureKey] = await Promise.all([
        uploadToB2(photo.blob, 'photo', photo.mime),
        uploadToB2(cv.blob, 'cv', cv.mime),
        uploadToB2(results.blob, 'results', results.mime),
        uploadToB2(signature.blob, 'signature', signature.mime),
      ]);
      setError('Submitting your application…');
      const res = await submitCandidacy({
        surname: form.surname,
        given_names: form.given_names,
        gender: form.gender,
        class: form.class,
        intended_post: form.intended_post,
        party: form.party || null,
        held_post: form.held_post,
        held_position: form.held_position,
        ran_before: form.ran_before,
        ran_position: form.ran_position,
        disciplinary: form.disciplinary,
        disciplinary_details: form.disciplinary_details,
        motivation: form.motivation,
        achievements: form.achievements,
        attest_name: '',
        attested: true,
        photo_key: photoKey,
        cv_key: cvKey,
        cv_filename: cv.name,
        results_key: resultsKey,
        results_filename: results.name,
        signature_key: signatureKey,
        signature_filename: signature.name,
      });
      setReference(res.id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (reference) {
    return (
      <div className="admin-card" style={{ textAlign: 'center' }}>
        <div className="admin-header">
          <div className="icon-circle">
            <CheckCircle2 size={36} />
          </div>
          <div className="section-label" style={{ color: 'var(--gold-700)' }}>Received</div>
          <h2>Application Submitted</h2>
          <p>
            Your candidacy form has been received. Keep this reference number:
          </p>
          <p style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--emerald-800)', letterSpacing: '0.04em' }}>
            {reference}
          </p>
          <p>The electoral committee will review it and be in touch.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-card" style={{ maxWidth: 640 }}>
      <header className="admin-header">
        <div className="icon-circle">
          <ScrollText size={36} />
        </div>
        <div className="section-label" style={{ color: 'var(--gold-700)' }}>OIEC 26</div>
        <h2>Prefect Council Candidacy Form</h2>
        <p>Complete every section and attach the required documents.</p>
      </header>

      {error && (
        <div className="alert alert-error" role="alert">
          <ShieldAlert size={18} /> {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex-col">
        <h3 className="cform-section">Identity</h3>
        <div className="cform-grid">
          <div className="form-group">
            <label className="form-label" htmlFor="cf-surname">Surname</label>
            <input id="cf-surname" className="input" value={form.surname} onChange={set('surname')} autoComplete="family-name" />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="cf-given">Given names</label>
            <input id="cf-given" className="input" value={form.given_names} onChange={set('given_names')} autoComplete="given-name" />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="cf-gender">Gender</label>
            <select id="cf-gender" className="input form-select" value={form.gender} onChange={set('gender')}>
              <option value="">Select…</option>
              <option value="Female">Female</option>
              <option value="Male">Male</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="cf-class">Class</label>
            <input id="cf-class" className="input" placeholder="e.g. SS2A" value={form.class} onChange={set('class')} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="cf-post">Intended post</label>
          <select id="cf-post" className="input form-select" value={form.intended_post} onChange={set('intended_post')}>
            <option value="">Select a position…</option>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="cf-party">Electoral party</label>
          <select id="cf-party" className="input form-select" value={form.party} onChange={set('party')}>
            <option value="">Independent / None</option>
            {parties.map((p) => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <span className="form-label">Campaign photo</span>
          {photo ? (
            <div className="upload-preview" style={{ maxWidth: 220 }}>
              <img src={photo.preview} alt="Passport preview" />
              <button type="button" className="upload-preview-remove" onClick={() => { URL.revokeObjectURL(photo.preview); setPhoto(null); }} aria-label="Remove photo">
                <XCircle size={18} />
              </button>
            </div>
            ) : (
            <label htmlFor="cf-photo" className="upload-zone">
              <div className="upload-zone-icon"><UploadCloud size={28} /></div>
              <span className="upload-zone-text">Upload campaign photo</span>
              <span className="upload-zone-hint">JPG or PNG — compressed automatically</span>
            </label>
          )}
          <input id="cf-photo" type="file" accept="image/*" className="file-hidden" aria-label="Campaign photo file"
            onChange={(e) => { handlePhoto(e.target.files[0]); e.target.value = null; }} />
        </div>

        <h3 className="cform-section">History</h3>
        <YesNo label="Have you held a post in school?" value={form.held_post} onChange={setBool('held_post')} />
        {form.held_post && (
          <div className="form-group">
            <label className="form-label" htmlFor="cf-held">What position?</label>
            <input id="cf-held" className="input" value={form.held_position} onChange={set('held_position')} />
          </div>
        )}
        <YesNo label="Have you run for a position and not won?" value={form.ran_before} onChange={setBool('ran_before')} />
        {form.ran_before && (
          <div className="form-group">
            <label className="form-label" htmlFor="cf-ran">State the position</label>
            <input id="cf-ran" className="input" value={form.ran_position} onChange={set('ran_position')} />
          </div>
        )}
        <YesNo label="Have you had any disciplinary cases before?" value={form.disciplinary} onChange={setBool('disciplinary')} />
        {form.disciplinary && (
          <div className="form-group">
            <label className="form-label" htmlFor="cf-disc">Honestly describe the situation</label>
            <textarea id="cf-disc" className="input" rows={4} value={form.disciplinary_details} onChange={set('disciplinary_details')} />
          </div>
        )}

        <div className="form-group">
          <label className="form-label" htmlFor="cf-motivation">Why do you wish to run for that position?</label>
          <textarea id="cf-motivation" className="input" rows={5} value={form.motivation} onChange={set('motivation')} maxLength={2000} />
          <span className="cform-count">{form.motivation.length}/2000</span>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="cf-achieve">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Award size={14} /> Special achievements (optional)</span>
          </label>
          <textarea id="cf-achieve" className="input" rows={4} value={form.achievements} onChange={set('achievements')} maxLength={1000} />
          <span className="cform-count">{form.achievements.length}/1000</span>
        </div>

        <h3 className="cform-section">Attachments</h3>
        {[
          { key: 'cv', label: 'Updated CV', accept: '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document', file: cv, setFile: setCv, onPick: (f) => handleDoc(f, 'cv'), hint: `PDF or Word, max ${MAX_FILE_LABEL}` },
          { key: 'results', label: '10th grade results (English/French)', accept: '.pdf,.jpg,.jpeg,.png', file: results, setFile: setResults, onPick: (f) => handleDoc(f, 'results'), hint: `PDF or image, max ${MAX_FILE_LABEL}` },
        ].map((d) => (
          <div className="form-group" key={d.key}>
            <span className="form-label">{d.label}</span>
            {d.file ? (
              <div className="cform-file">
                <FileText size={18} />
                <span className="cform-file-name">{d.file.name}</span>
                <button type="button" className="upload-preview-remove" style={{ position: 'static' }} onClick={() => d.setFile(null)} aria-label={`Remove ${d.label}`}>
                  <XCircle size={18} />
                </button>
              </div>
            ) : (
              <label htmlFor={`cf-${d.key}`} className="upload-zone" style={{ padding: 'var(--sp-6)' }}>
                <span className="upload-zone-text">Upload {d.label.toLowerCase()}</span>
                <span className="upload-zone-hint">{d.hint}</span>
              </label>
            )}
            <input id={`cf-${d.key}`} type="file" accept={d.accept} className="file-hidden" aria-label={`${d.label} file`}
              onChange={(e) => { d.onPick(e.target.files[0]); e.target.value = null; }} />
          </div>
        ))}

        <h3 className="cform-section">Attestation</h3>
        <label className="cform-attest">
          <input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} />
          <span>I attest that all the above statements are certified and true.</span>
        </label>
        <div className="form-group">
          <span className="form-label">Signature (upload e-signature)</span>
          {signature ? (
            <div className="cform-file">
              <FileText size={18} />
              <span className="cform-file-name">{signature.name}</span>
              <button type="button" className="upload-preview-remove" style={{ position: 'static' }} onClick={() => setSignature(null)} aria-label="Remove signature">
                <XCircle size={18} />
              </button>
            </div>
          ) : (
            <label htmlFor="cf-sign" className="upload-zone" style={{ padding: 'var(--sp-6)' }}>
              <div className="upload-zone-icon"><UploadCloud size={20} /></div>
              <span className="upload-zone-text">Upload your e-signature</span>
              <span className="upload-zone-hint">{`PNG, JPG or PDF — max ${MAX_FILE_LABEL}`}</span>
            </label>
          )}
          <input id="cf-sign" type="file" accept="image/*,.pdf" className="file-hidden" aria-label="Signature file"
            onChange={(e) => { handleSignature(e.target.files[0]); e.target.value = null; }} />
        </div>

        <motion.button type="submit" className="btn btn-primary btn-block btn-lg" disabled={busy} whileTap={{ scale: 0.97 }}>
          {busy ? (<><span className="btn-spinner" /> Submitting...</>) : 'Submit Application'}
        </motion.button>
      </form>
    </div>
  );
};

export default CandidateForm;
