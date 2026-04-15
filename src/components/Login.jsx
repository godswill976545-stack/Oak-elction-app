import React, { useState, useEffect } from 'react';
import { verifyStudent } from '../supabaseClient';
import { ShieldAlert, LogIn, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const Login = ({ onLoginSuccess }) => {
  const [studentId,   setStudentId]   = useState('');
  const [error,       setError]       = useState('');
  const [loading,     setLoading]     = useState(false);
  const [welcomeData, setWelcomeData] = useState(null);

  useEffect(() => {
    if (!welcomeData) return;
    const timer = setTimeout(() => onLoginSuccess(welcomeData.studentId), 2500);
    return () => clearTimeout(timer);
  }, [welcomeData, onLoginSuccess]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!studentId.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await verifyStudent(studentId.trim());
      if (result.verified) {
        setWelcomeData({ name: result.name, studentId: result.studentId });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  /* ── Welcome screen ── */
  if (welcomeData) {
    return (
      <div className="glass-container text-center" style={{ padding: '64px 48px' }}>
        <CheckCircle2
          size={72}
          style={{ color: 'var(--gold-400)', marginBottom: '24px', animation: 'pulse 1.5s ease-in-out infinite' }}
        />
        <p className="subtitle" style={{ marginBottom: '8px', opacity: 0.8 }}>Identity Verified</p>
        <h2 style={{ fontSize: '2.5rem', marginBottom: '16px' }}>
          Welcome, {welcomeData.name.split(' ')[0]}!
        </h2>
        <p className="subtitle">
          Preparing your secure digital ballot...
        </p>
        <div style={{
          width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)',
          borderRadius: '10px', marginTop: '32px', overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.05)'
        }}>
          <div style={{
            height: '100%', background: 'linear-gradient(90deg, var(--emerald-500), var(--gold-400))',
            animation: 'progressBar 2.4s cubic-bezier(0.65, 0, 0.35, 1) forwards',
            borderRadius: '10px',
          }} />
        </div>
      </div>
    );
  }

  /* ── Login form ── */
  return (
    <div className="glass-container">
      <div style={{ fontSize: '3rem', marginBottom: '24px' }}>🛡️</div>
      <h2>Voter Access</h2>
      <p className="subtitle">
        Enter your official Student ID to access the interactive voting chamber.
      </p>

      <form onSubmit={handleSubmit} className="flex-col">
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '16px' }}>
          <input
            type="text"
            className="input-field"
            placeholder="OIS/ID/XXXXX"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            disabled={loading}
            style={{ 
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)', 
              color: '#fff', fontSize: '1.2rem', padding: '20px', width: '100%', marginBottom: 0 
            }}
          />
          <AnimatePresence>
            {loading && (
              <motion.div
                initial={{ left: '-100%' }}
                animate={{ left: '100%' }}
                transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  width: '80px',
                  background: 'linear-gradient(90deg, transparent, rgba(5, 150, 105, 0.6), transparent)',
                  zIndex: 10,
                  pointerEvents: 'none'
                }}
              />
            )}
          </AnimatePresence>
        </div>

        <motion.button 
          type="submit" 
          className="btn-3d btn-3d-emerald" 
          disabled={loading} 
          style={{ marginTop: '10px' }}
          whileHover={!loading ? { scale: 1.05, boxShadow: '0px 0px 15px rgba(5, 150, 105, 0.6)' } : {}}
          whileTap={!loading ? { scale: 0.95 } : {}}
        >
          {loading
            ? <><span className="btn-spinner" /> Scanning ID...</>
            : <><LogIn size={20} /> Access Ballot</>
          }
        </motion.button>

        {error && (
          <div style={{ 
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', 
            color: '#fb7185', background: 'rgba(251, 113, 133, 0.1)', padding: '12px', borderRadius: '12px',
            marginTop: '10px'
          }}>
            <ShieldAlert size={18} />
            <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{error}</span>
          </div>
        )}
      </form>
    </div>
  );
};

export default Login;
