import React, { useState } from 'react';
import { submitCandidacy } from '../supabaseClient';
import { ScrollText, CheckCircle2, ShieldAlert, UploadCloud, XCircle, FileText, Award } from 'lucide-react';
// eslint-disable-next-line no-unused-vars -- used in JSX as <motion.button>
import { motion } from 'framer-motion';

const POSITIONS = [
  'Head Boy',
  'Head Girl',
  'Social Prefect',
  'Sports Prefect (Male)',
  'Sports Prefect (Female)',
];

const MAX_RAW_FILE = 1 * 1024 * 1024;
const MAX_PHOTO_URL = 1_600_000;
const MAX_DOC_URL = 1_400_000;
const MAX_SIG_URL = 1_000_000;

// Downscale large photos/results images so the whole submission stays
// comfortably under serverless body limits. Returns a JPEG data-URL.
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
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image.'));
    };
    img.src = url;
  });

const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target.result);
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });

const emptyForm = {
  surname: '',
  given_names: '',
  gender: '',
  class: '',
  intended_post: '',
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

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const setBool = (k) => (v) => setForm((p) => ({ ...p, [k]: v }));

  const handlePhoto = async (file) => {
    if (!file) return;
    setError('');
    try {
      const url = await compressImage(file);
      if (url.length > MAX_PHOTO_URL) {
        setError('Photo is still too large after compression. Use a smaller image (under ~1MB).');
        return;
      }
      setPhoto({ name: file.name, url });
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDoc = async (file, kind) => {
    if (!file) return;
    setError('');
    if (file.size > MAX_RAW_FILE) {
      setError(`${kind === 'cv' ? 'CV' : 'Results file'} must be under 1MB so the submission fits hosting limits.`);
      return;
    }
    try {
      let url;
      let name = file.name;
      if (file.type.startsWith('image/')) {
        url = await compressImage(file);
        name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
      } else {
        url = await readAsDataUrl(file);
      }
      if (url.length > MAX_DOC_URL) {
        setError(`${kind === 'cv' ? 'CV' : 'Results file'} is too large. Keep it under ~1MB.`);
        return;
      }
      (kind === 'cv' ? setCv : setResults)({ name, url, type: file.type });
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSignature = async (file) => {
    if (!file) return;
    setError('');
    if (file.size > MAX_RAW_FILE) {
      setError('Signature file must be under 1MB.');
      return;
    }
    try {
      let url;
      let name = file.name;
      if (file.type.startsWith('image/')) {
        url = await compressImage(file, 800, 0.85);
        name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
      } else {
        url = await readAsDataUrl(file);
      }
      if (url.length > MAX_SIG_URL) {
        setError('Signature is too large. Upload an image under ~700KB.');
        return;
      }
      setSignature({ name, url, type: file.type });
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
    try {
      const res = await submitCandidacy({
        surname: form.surname,
        given_names: form.given_names,
        gender: form.gender,
        class: form.class,
        intended_post: form.intended_post,
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
        signature_file: signature ? signature.url : null,
        signature_filename: signature ? signature.name : null,
        signature_mimetype: signature ? signature.type : null,
        photo_url: photo.url,
        cv_file: cv.url,
        cv_filename: cv.name,
        cv_mimetype: cv.type,
        results_file: results.url,
        results_filename: results.name,
        results_mimetype: results.type,
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
        <div className="section-label" style={{ color: 'var(--gold-700)' }}>OIEC 2025</div>
        <h2>Prefect Council Candidacy Form</h2>
        <p>Complete every section and attach the required documents.</p>
      </header>

      {error && (
        <div className="alert alert-error" role="alert">
          <ShieldAlert size={18} /> {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex-col">
        <h3 className="cform-section">A. Identity</h3>
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
          <span className="form-label">Passport photo</span>
          {photo ? (
            <div className="upload-preview" style={{ maxWidth: 220 }}>
              <img src={photo.url} alt="Passport preview" />
              <button type="button" className="upload-preview-remove" onClick={() => setPhoto(null)} aria-label="Remove photo">
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
          <input id="cf-photo" type="file" accept="image/*" className="file-hidden" aria-label="Passport photo file"
            onChange={(e) => { handlePhoto(e.target.files[0]); e.target.value = null; }} />
        </div>

        <h3 className="cform-section">B. History</h3>
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

        <h3 className="cform-section">C. Essays</h3>
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

        <h3 className="cform-section">D. Attachments (NB)</h3>
        {[
          { key: 'cv', label: 'Updated CV', accept: '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document', file: cv, setFile: setCv, onPick: (f) => handleDoc(f, 'cv'), hint: 'PDF or Word, max 1MB' },
          { key: 'results', label: '10th grade results (English/French)', accept: '.pdf,.jpg,.jpeg,.png', file: results, setFile: setResults, onPick: (f) => handleDoc(f, 'results'), hint: 'PDF or image, max 1MB' },
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

        <h3 className="cform-section">E. Attestation</h3>
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
              <span className="upload-zone-hint">PNG, JPG or PDF — max 1MB</span>
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
