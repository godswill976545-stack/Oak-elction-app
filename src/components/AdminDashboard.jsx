import React, { useState } from 'react';
import { addCandidate, supabase } from '../supabaseClient';
import { ShieldCheck, PlusCircle, UploadCloud, CheckCircle, XCircle } from 'lucide-react';
import { motion } from 'framer-motion';

const AdminDashboard = () => {
  const [formData, setFormData] = useState({ name: '', category: 'Head Boy', manifesto: '' });
  const [photoFile,    setPhotoFile]    = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [successMsg,   setSuccessMsg]   = useState('');
  const [errorMsg,     setErrorMsg]     = useState('');

  const handleChange     = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
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
    if (!formData.name || !formData.manifesto || !photoFile) {
      setErrorMsg('Mandatory fields: Name, Manifesto, and Photo.');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      // 1. Upload high-res photo to Supabase 'avatars' storage bucket
      const fileExt = photoFile.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, photoFile);
      
      if (uploadError) throw new Error("Image upload failed: " + uploadError.message);

      // 2. Resolve public URL for display
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);

      // 3. Mount candidate directly to Postgres
      await addCandidate({ ...formData, photo_url: publicUrl });
      
      setSuccessMsg(`${formData.name} added to the candidate registry.`);
      resetForm();
    } catch (err) {
      setErrorMsg(`Registry error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const labelStyle = { 
    display: 'block', marginBottom: '10px', fontWeight: 700, 
    color: '#f97316', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '2px' 
  };

  return (
    <div style={{ width: '100%', maxWidth: '640px', margin: '0 auto' }}>
      <div className="mode-selection-card" style={{ maxWidth: '100%', padding: '48px' }}>
        
        <header style={{ marginBottom: '40px', textAlign: 'center' }}>
          <div className="icon-wrapper" style={{ backgroundColor: '#a7f3d0', color: '#065f46', margin: '0 auto 24px auto' }}>
            <ShieldCheck size={40} />
          </div>
          <div className="sys-config-label">ADMINISTRATION</div>
          <h2 className="main-title" style={{ marginBottom: '12px' }}>Candidate Registry</h2>
          <p className="subtitle" style={{ color: 'var(--text-muted)' }}>
            Securely register candidates. Photos are uploaded to Supabase Storage and registered in the database.
          </p>
        </header>

        {successMsg && (
          <div style={{
            background: 'rgba(5, 150, 105, 0.15)', color: 'var(--emerald-400)',
            padding: '16px 20px', borderRadius: '16px', marginBottom: '24px',
            fontWeight: 600, display: 'flex', alignItems: 'center', gap: '12px',
            border: '1px solid var(--emerald-600)', animation: 'slideScaleIn 0.4s ease both'
          }}>
            <CheckCircle size={20} /> {successMsg}
          </div>
        )}
        
        {errorMsg && (
          <div style={{
            background: 'rgba(251, 113, 133, 0.15)', color: '#fb7185',
            padding: '16px 20px', borderRadius: '16px', marginBottom: '24px',
            fontWeight: 600, display: 'flex', alignItems: 'center', gap: '12px',
            border: '1px solid rgba(251, 113, 133, 0.3)', animation: 'slideScaleIn 0.4s ease both'
          }}>
            <XCircle size={20} /> {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex-col" style={{ textAlign: 'left' }}>

          <div>
            <label style={labelStyle}>Full Identity Name</label>
            <input
              type="text" name="name" className="input-field"
              value={formData.name} onChange={handleChange}
              placeholder="e.g. Alexander Pierce"
              style={{ background: '#f8fafc', border: '2px solid #e2e8f0', color: '#1e293b', borderRadius: '16px', padding: '16px', outline: 'none' }}
            />
          </div>

          <div>
            <label style={labelStyle}>Election Position</label>
            <select
              name="category" className="input-field"
              value={formData.category} onChange={handleChange}
              style={{ 
                background: '#f8fafc', border: '2px solid #e2e8f0', color: '#1e293b', borderRadius: '16px', padding: '16px', outline: 'none',
                appearance: 'none', cursor: 'pointer' 
              }}
            >
              <option value="Head Boy">Head Boy</option>
              <option value="Head Girl">Head Girl</option>
              <option value="Social Prefect">Social Prefect</option>
              <option value="Sports Prefect (Male)">Sports Prefect (Male)</option>
              <option value="Sports Prefect (Female)">Sports Prefect (Female)</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Electoral Manifesto</label>
            <textarea
              name="manifesto" className="input-field"
              value={formData.manifesto} onChange={handleChange}
              placeholder="Describe the vision for this candidate..."
              rows={4} 
              style={{ 
                resize: 'none', background: '#f8fafc', border: '2px solid #e2e8f0', color: '#1e293b', borderRadius: '16px', padding: '16px', outline: 'none'
              }}
            />
          </div>

          <div>
            <label style={labelStyle}>Visual representation (Photo)</label>

            {photoPreview ? (
              <div style={{ position: 'relative', borderRadius: '20px', overflow: 'hidden', border: '2px solid var(--emerald-500)', boxShadow: '0 0 20px rgba(5, 150, 105, 0.3)' }}>
                <img
                  src={photoPreview} alt="Preview"
                  style={{ width: '100%', height: '240px', objectFit: 'cover', display: 'block' }}
                />
                <button
                  type="button" onClick={resetForm}
                  style={{
                    position: 'absolute', top: '12px', right: '12px',
                    background: 'rgba(0,0,0,0.7)', color: '#fff',
                    border: 'none', borderRadius: '50%',
                    width: '36px', height: '36px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: '0.2s', backdropFilter: 'blur(5px)'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#000'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.7)'}
                >
                  <XCircle size={20} />
                </button>
              </div>
            ) : (
              <label
                htmlFor="file-upload"
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', gap: '12px',
                  border: '2px dashed #cbd5e1', padding: '48px 32px',
                  borderRadius: '20px', background: '#f8fafc',
                  cursor: 'pointer', transition: 'all 0.2s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#059669'; e.currentTarget.style.background = '#ecfdf5'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.background = '#f8fafc'; }}
              >
                <div style={{ background: '#d1fae5', padding: '16px', borderRadius: '50%' }}>
                  <UploadCloud size={32} color="#059669" />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ color: '#0f172a', fontWeight: 600, margin: '0 0 4px 0' }}>Upload High-Res Portrait</p>
                  <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>Click to browse local files (JPG/PNG)</p>
                </div>
              </label>
            )}
            <input id="file-upload" type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
          </div>

          <motion.button 
            type="submit" 
            className="btn-select btn-green" 
            style={{ justifyContent: 'center', marginTop: '12px' }} 
            disabled={loading}
            whileHover={{ scale: 1.02, boxShadow: '0px 0px 15px rgba(5, 150, 105, 0.4)' }}
            whileTap={{ scale: 0.98 }}
          >
            {loading
              ? <><span className="btn-spinner" /> Encoding Data...</>
              : <><PlusCircle size={20} /> Register Candidate</>
            }
          </motion.button>

        </form>
      </div>
    </div>
  );
};

export default AdminDashboard;
