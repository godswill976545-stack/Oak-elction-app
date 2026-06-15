import React, { useState } from 'react';
import { addCandidate, supabase } from '../supabaseClient';
import { ShieldCheck, PlusCircle, UploadCloud, CheckCircle, XCircle } from 'lucide-react';
// eslint-disable-next-line no-unused-vars -- used in JSX as <motion.button>
import { motion } from 'framer-motion';

const AdminDashboard = () => {
  const [formData, setFormData] = useState({ name: '', category: 'Head Boy', manifesto: '' });
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleChange = (e) => setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('Image must be under 5MB.');
      return;
    }
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const resetForm = () => {
    setFormData({ name: '', category: 'Head Boy', manifesto: '' });
    setPhotoFile(null);
    setPhotoPreview(null);
    const fi = document.getElementById('file-upload');
    if (fi) fi.value = null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.manifesto.trim() || !photoFile) {
      setErrorMsg('All fields are required: Name, Manifesto, and Photo.');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const fileExt = photoFile.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, photoFile);
      if (uploadError) throw new Error('Image upload failed: ' + uploadError.message);

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
      await addCandidate({ ...formData, photo_url: publicUrl });

      setSuccessMsg(`${formData.name} has been registered as a candidate.`);
      resetForm();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-card">
      <header className="admin-header">
        <div className="icon-circle">
          <ShieldCheck size={36} />
        </div>
        <div className="section-label" style={{ color: 'var(--gold-600)' }}>Administration</div>
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
            style={{ display: 'none' }}
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
    </div>
  );
};

export default AdminDashboard;
