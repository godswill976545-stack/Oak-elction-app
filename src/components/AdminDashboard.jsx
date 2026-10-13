import React, { useState, useEffect } from 'react';
import { addCandidate, fetchParties, setPartyLogo, fetchStaff, addStaff, fetchCandidacies, fetchCandidacy, setCandidacyStatus } from '../supabaseClient';
import { ShieldCheck, PlusCircle, UploadCloud, CheckCircle, XCircle, Flag, Users, FileText, Download } from 'lucide-react';
// eslint-disable-next-line no-unused-vars -- used in JSX as <motion.button>
import { motion } from 'framer-motion';
import PartyBadge from './PartyBadge';

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

// B2 native REST has no presigned URLs, so candidacy attachments are served
// via an authenticated /api/media?candidacy=<id>&slot=<x> route. A plain
// <a href> cannot attach the admin token header, so we fetch the blob with
// the token and click a temporary <a download> — that saves the file instead
// of letting Chrome's PDF/image viewer open it in a tab.
const downloadAttachment = async (url, adminToken) => {
  const res = await fetch(url, { headers: { 'x-admin-token': adminToken } });
  if (!res.ok) throw new Error(`Download failed (${res.status}).`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  // The server names the file after the student's original upload; fall back
  // to the slot + blob extension if that header is ever missing.
  const header = /filename="?([^"]+)"?/i.exec(res.headers.get('content-disposition') || '');
  const slot = new URL(url, window.location.origin).searchParams.get('slot') || 'attachment';
  const ext = (blob.type.split('/')[1] || 'bin').split('+')[0];
  a.download = header?.[1] || `${slot}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
};

const AdminDashboard = ({ adminToken }) => {
  const [formData, setFormData] = useState({ name: '', category: 'Head Boy', manifesto: '', party: '' });
  const [photoPreview, setPhotoPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [parties, setParties] = useState([]);
  const [logoLoading, setLogoLoading] = useState(null);
  const [staffList, setStaffList] = useState([]);
  const [staffForm, setStaffForm] = useState({ code: '', name: '' });
  const [staffLoading, setStaffLoading] = useState(false);
  const [applications, setApplications] = useState([]);
  const [expandedApp, setExpandedApp] = useState(null);
  const [appDetail, setAppDetail] = useState(null);
  const [appLoading, setAppLoading] = useState(false);

  useEffect(() => {
    fetchParties().then(setParties).catch(() => {});
    fetchStaff(adminToken).then(setStaffList).catch(() => {});
    fetchCandidacies(adminToken).then(setApplications).catch(() => {});
  }, [adminToken]);

  const handleChange = (e) => setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('Image must be under 5MB.');
      return;
    }
    try {
      setPhotoPreview(await compressImage(file));
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const resetForm = () => {
    setFormData({ name: '', category: 'Head Boy', manifesto: '', party: '' });
    setPhotoPreview(null);
    const fi = document.getElementById('file-upload');
    if (fi) fi.value = null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.manifesto.trim() || !photoPreview) {
      setErrorMsg('All fields are required: Name, Manifesto, and Photo.');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      // The portrait is sent as a data-URL; the server uploads it to R2 and
      // stores only the object key (see api/candidates.js).
      await addCandidate({ ...formData, party: formData.party || null, photo_url: photoPreview }, adminToken);

      setSuccessMsg(`${formData.name} has been registered as a candidate.`);
      resetForm();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogoChange = async (partyName, file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('Logo image must be under 5MB.');
      return;
    }
    setLogoLoading(partyName);
    setErrorMsg('');
    try {
      const dataUrl = await compressImage(file, 512, 0.85);
      const updated = await setPartyLogo(partyName, dataUrl, adminToken);
      setParties((prev) => prev.map((p) => (p.name === updated.name ? updated : p)));
      setSuccessMsg(`${partyName} logo updated.`);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLogoLoading(null);
    }
  };

  const handleStaffSubmit = async (e) => {
    e.preventDefault();
    if (!staffForm.code.trim() || !staffForm.name.trim()) {
      setErrorMsg('Staff code and name are required.');
      return;
    }
    setStaffLoading(true);
    setErrorMsg('');
    try {
      const added = await addStaff(staffForm.code.trim(), staffForm.name.trim(), adminToken);
      setStaffList((prev) => [...prev, { ...added, has_voted: false }].sort((a, b) => a.name.localeCompare(b.name)));
      setStaffForm({ code: '', name: '' });
      setSuccessMsg(`${added.name} registered for staff voting.`);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setStaffLoading(false);
    }
  };

  const toggleApplication = async (id) => {
    if (expandedApp === id) {
      setExpandedApp(null);
      setAppDetail(null);
      return;
    }
    setExpandedApp(id);
    setAppDetail(null);
    setAppLoading(true);
    try {
      setAppDetail(await fetchCandidacy(id, adminToken));
    } catch (err) {
      setErrorMsg(err.message);
      setExpandedApp(null);
    } finally {
      setAppLoading(false);
    }
  };

  const handleAppStatus = async (id, status) => {
    setAppLoading(true);
    setErrorMsg('');
    try {
      const updated = await setCandidacyStatus(id, status, adminToken);
      setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, status: updated.status } : a)));
      setAppDetail((prev) => (prev && prev.id === id ? { ...prev, status: updated.status } : prev));
      setSuccessMsg(
        status === 'approved'
          ? `Application approved${updated.candidateId ? ' — candidate is now on the ballot.' : '.'}`
          : `Application ${status}.`
      );
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setAppLoading(false);
    }
  };

  return (
    <div className="admin-card">
      <header className="admin-header">
        <div className="icon-circle">
          <ShieldCheck size={36} />
        </div>
        <div className="section-label" style={{ color: 'var(--gold-700)' }}>Administration</div>
        <h2>Candidate Registry</h2>
        <p>Register candidates for the election. Photos are stored securely.</p>
      </header>

      {successMsg && (
        <div className="alert alert-success">
          <CheckCircle size={18} /> {successMsg}
        </div>
      )}

      {errorMsg && (
        <div className="alert alert-error">
          <XCircle size={18} /> {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex-col">
        <div className="form-group">
          <label className="form-label" htmlFor="candidate-name">Full Name</label>
          <input
            id="candidate-name"
            type="text"
            name="name"
            className="input"
            value={formData.name}
            onChange={handleChange}
            placeholder="e.g. Alexander Pierce"
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="candidate-category">Election Position</label>
          <select
            id="candidate-category"
            name="category"
            className="input form-select"
            value={formData.category}
            onChange={handleChange}
          >
            <option value="Head Boy">Head Boy</option>
            <option value="Head Girl">Head Girl</option>
            <option value="Social Prefect">Social Prefect</option>
            <option value="Sports Prefect (Male)">Sports Prefect (Male)</option>
            <option value="Sports Prefect (Female)">Sports Prefect (Female)</option>
            <option value="Food Prefect">Food Prefect</option>
            <option value="Health and Hygiene Prefect">Health and Hygiene Prefect</option>
            <option value="Assistant Food Prefect">Assistant Food Prefect</option>
            <option value="Crown's Captain">Crown's Captain</option>
            <option value="Root's Captain">Root's Captain</option>
            <option value="Trunk's Captain">Trunk's Captain</option>
            <option value="Acorn's Captain">Acorn's Captain</option>
            <option value="Timekeeper">Timekeeper</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="candidate-party">Political Party</label>
          <select
            id="candidate-party"
            name="party"
            className="input form-select"
            value={formData.party}
            onChange={handleChange}
          >
            <option value="">Independent / None</option>
            {parties.map((p) => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="candidate-manifesto">Manifesto</label>
          <textarea
            id="candidate-manifesto"
            name="manifesto"
            className="input"
            value={formData.manifesto}
            onChange={handleChange}
            placeholder="Describe the candidate's vision..."
            rows={4}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Photo</label>
          {photoPreview ? (
            <div className="upload-preview">
              <img src={photoPreview} alt="Preview" />
              <button
                type="button"
                className="upload-preview-remove"
                onClick={resetForm}
                aria-label="Remove photo"
              >
                <XCircle size={18} />
              </button>
            </div>
          ) : (
            <label htmlFor="file-upload" className="upload-zone">
              <div className="upload-zone-icon">
                <UploadCloud size={28} />
              </div>
              <span className="upload-zone-text">Upload Portrait</span>
              <span className="upload-zone-hint">JPG or PNG, max 5MB</span>
            </label>
          )}
          <input
            id="file-upload"
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="file-hidden"
            aria-label="Candidate photo file"
          />
        </div>

        <motion.button
          type="submit"
          className="btn btn-primary btn-block btn-lg"
          disabled={loading}
          whileTap={{ scale: 0.97 }}
          style={{ marginTop: 'var(--sp-2)' }}
        >
          {loading ? (
            <><span className="btn-spinner" /> Registering...</>
          ) : (
            <><PlusCircle size={20} /> Register Candidate</>
          )}
        </motion.button>
      </form>

      {/* Party Logos */}
      <div style={{ marginTop: 'var(--sp-10)', paddingTop: 'var(--sp-8)', borderTop: '2px solid var(--stone-100)' }}>
        <div className="form-group" style={{ marginBottom: 'var(--sp-5)' }}>
          <span className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
            <Flag size={14} /> Party Logos
          </span>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
            Until real logos arrive, A/B letter badges are used everywhere automatically.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          {parties.map((p) => (
            <div key={p.name} className="party-logo-row">
              <PartyBadge party={p.name} code={p.short_code} logoUrl={p.logo_url} size={48} />
              <span style={{ flex: 1, fontWeight: 700 }}>{p.name}</span>
              <label className="btn btn-sm btn-outline" style={{ cursor: 'pointer' }}>
                {logoLoading === p.name ? 'Uploading...' : p.logo_url ? 'Replace' : 'Upload'}
                <input
                  type="file"
                  accept="image/*"
                  className="file-hidden"
                  aria-label={`${p.name} logo file`}
                  disabled={logoLoading === p.name}
                  onChange={(e) => { handleLogoChange(p.name, e.target.files[0]); e.target.value = null; }}
                />
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Staff Roll */}
      <div style={{ marginTop: 'var(--sp-10)', paddingTop: 'var(--sp-8)', borderTop: '2px solid var(--stone-100)' }}>
        <div className="form-group" style={{ marginBottom: 'var(--sp-5)' }}>
          <span className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
            <Users size={14} /> Staff Voting Roll ({staffList.length})
          </span>
        </div>
        <form onSubmit={handleStaffSubmit} style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="input"
            placeholder="STF/001"
            value={staffForm.code}
            onChange={(e) => setStaffForm((prev) => ({ ...prev, code: e.target.value }))}
            aria-label="Staff code"
            style={{ flex: '1 1 120px' }}
          />
          <input
            type="text"
            className="input"
            placeholder="Full name"
            value={staffForm.name}
            onChange={(e) => setStaffForm((prev) => ({ ...prev, name: e.target.value }))}
            aria-label="Staff name"
            style={{ flex: '2 1 160px' }}
          />
          <button type="submit" className="btn btn-primary" disabled={staffLoading}>
            {staffLoading ? 'Adding...' : 'Add Staff'}
          </button>
        </form>
        {staffList.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', marginTop: 'var(--sp-4)' }}>
            {staffList.map((s) => (
              <span key={s.code} className={`staff-chip ${s.has_voted ? 'is-done' : ''}`}>
                {s.name} · {s.code}{s.has_voted ? ' ✓' : ''}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Candidacy Applications */}
      <div style={{ marginTop: 'var(--sp-10)', paddingTop: 'var(--sp-8)', borderTop: '2px solid var(--stone-100)' }}>
        <div className="form-group" style={{ marginBottom: 'var(--sp-5)' }}>
          <span className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
            <FileText size={14} /> Candidacy Applications ({applications.length})
          </span>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
            Submitted via the hidden candidacy form. Expand a row to review and download files.
          </p>
        </div>
        {applications.length === 0 && (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No applications yet.</p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
          {applications.map((a) => (
            <div key={a.id}>
              <button type="button" className="candidacy-row" onClick={() => toggleApplication(a.id)}
                aria-expanded={expandedApp === a.id}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 800 }}>{a.surname} {a.given_names}</span>
                  <span style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    {a.class} · {a.intended_post}{a.party ? ` · ${a.party}` : ''} · {new Date(a.created_at).toLocaleDateString()}
                  </span>
                </span>
                <span className={`candidacy-status is-${a.status}`}>{a.status}</span>
              </button>
              {expandedApp === a.id && (
                <div className="candidacy-detail">
                  {appLoading && <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>}
                  {appDetail && (
                    <>
                      <div>
                        <dt>Gender / Class</dt>
                        <dd>{appDetail.gender} · {appDetail.class}</dd>
                        <dt>Electoral party</dt>
                        <dd>{appDetail.party || 'Independent'}</dd>
                        <dt>Held a school post?</dt>
                        <dd>{appDetail.held_post ? `Yes — ${appDetail.held_position}` : 'No'}</dd>
                        <dt>Ran before and lost?</dt>
                        <dd>{appDetail.ran_before ? `Yes — ${appDetail.ran_position}` : 'No'}</dd>
                        <dt>Disciplinary cases?</dt>
                        <dd>{appDetail.disciplinary ? appDetail.disciplinary_details : 'No'}</dd>
                        <dt>Why this position?</dt>
                        <dd>{appDetail.motivation}</dd>
                        {appDetail.achievements && (<><dt>Achievements</dt><dd>{appDetail.achievements}</dd></>)}
                        <dt>Signed (attestation)</dt>
                        <dd>{appDetail.attest_name || 'E-signed (file below)'}</dd>
                      </div>
                      <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn-sm btn-outline" onClick={() => downloadAttachment(appDetail.photo_url, adminToken).catch((e) => setErrorMsg(e.message))}>
                          <Download size={14} /> Photo
                        </button>
                        <button type="button" className="btn btn-sm btn-outline" onClick={() => downloadAttachment(appDetail.cv_file, adminToken).catch((e) => setErrorMsg(e.message))}>
                          <Download size={14} /> CV
                        </button>
                        <button type="button" className="btn btn-sm btn-outline" onClick={() => downloadAttachment(appDetail.results_file, adminToken).catch((e) => setErrorMsg(e.message))}>
                          <Download size={14} /> Results
                        </button>
                        {appDetail.signature_file && (
                          <button type="button" className="btn btn-sm btn-outline" onClick={() => downloadAttachment(appDetail.signature_file, adminToken).catch((e) => setErrorMsg(e.message))}>
                            <Download size={14} /> Signature
                          </button>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn-sm btn-primary" disabled={appLoading}
                          onClick={() => handleAppStatus(a.id, 'approved')}>
                          Approve
                        </button>
                        <button type="button" className="btn btn-sm btn-outline" disabled={appLoading}
                          onClick={() => handleAppStatus(a.id, 'rejected')}>
                          Reject
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
