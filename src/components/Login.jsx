import React, { useState, useEffect } from 'react';
import { verifyStudent } from '../supabaseClient';
import { ShieldAlert, LogIn, CheckCircle2 } from 'lucide-react';
// eslint-disable-next-line no-unused-vars -- used in JSX as <motion.button>, <motion.div>, <AnimatePresence>
import { motion, AnimatePresence } from 'framer-motion';

const Login = ({ onLoginSuccess }) => {
  const [studentId, setStudentId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
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

  if (welcomeData) {
    return (
      <div className="login-card" style={{ padding: 'var(--sp-16) var(--sp-10)' }}>
        <div className="welcome-check">
          <CheckCircle2 size={40} />
        </div>
        <p style={{ color: 'var(--text-on-dark-muted)', marginBottom: 'var(--sp-2)', fontSize: '0.9rem' }}>
          Identity Verified
        </p>
        <h2 style={{ fontSize: '2rem', marginBottom: 'var(--sp-4)' }}>
          Welcome, {welcomeData.name.split(' ')[0]}!
        </h2>
        <p style={{ color: 'var(--text-on-dark-muted)', fontSize: '0.95rem' }}>
          Preparing your secure digital ballot...
        </p>
        <div className="welcome-progress">
          <div className="welcome-progress-fill" />
        </div>
      </div>
    );
  }

  return (
    <div className="login-card">
      <div style={{ fontSize: '2.5rem', marginBottom: 'var(--sp-5)' }}>&#128737;&#65039;</div>
      <h2>Voter Access</h2>
      <p className="subtitle">
        Enter your official Student ID to access the voting chamber.
      </p>

      <form onSubmit={handleSubmit} className="flex-col">
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            className="input input-dark"
            placeholder="OIS/ID/XXXXX"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            disabled={loading}
            aria-label="Student ID"
            style={{ fontSize: '1.1rem', padding: 'var(--sp-5)' }}
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
                  background: 'linear-gradient(90deg, transparent, rgba(16, 185, 129, 0.5), transparent)',
                  pointerEvents: 'none',
                  borderRadius: 'var(--radius-lg)',
                }}
              />
            )}
          </AnimatePresence>
        </div>

        <motion.button
          type="submit"
          className="btn btn-primary btn-block btn-lg"
          disabled={loading}
          whileTap={!loading ? { scale: 0.97 } : {}}
        >
          {loading ? (
            <><span className="btn-spinner" /> Scanning ID...</>
          ) : (
            <><LogIn size={20} /> Access Ballot</>
          )}
        </motion.button>

        {error && (
          <div className="error-msg">
            <ShieldAlert size={16} />
            <span>{error}</span>
          </div>
        )}
      </form>
    </div>
  );
};

export default Login;
