import React, { useState, useEffect } from 'react';
import { verifyStaff } from '../supabaseClient';
import { ShieldAlert, LogIn, CheckCircle2, Briefcase } from 'lucide-react';
// eslint-disable-next-line no-unused-vars -- used in JSX as <motion.button>, <motion.div>, <AnimatePresence>
import { motion, AnimatePresence } from 'framer-motion';

// Staff portal login: staff codes only (student IDs are rejected because
// they don't exist in the staff table).
const StaffLogin = ({ onLoginSuccess }) => {
  const [staffCode, setStaffCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [welcomeData, setWelcomeData] = useState(null);

  useEffect(() => {
    if (!welcomeData) return;
    const timer = setTimeout(
      () => onLoginSuccess(welcomeData.staffCode, welcomeData.votedCategories || []),
      2500
    );
    return () => clearTimeout(timer);
  }, [welcomeData, onLoginSuccess]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!staffCode.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await verifyStaff(staffCode.trim());
      if (result.verified) {
        setWelcomeData({
          name: result.name,
          staffCode: result.staffCode,
          votedCategories: result.votedCategories || [],
        });
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
          <CheckCircle2 size={48} />
        </div>
        <p style={{ color: 'var(--text-on-dark-muted)', marginBottom: 'var(--sp-2)', fontSize: '0.95rem' }}>
          Staff Verified
        </p>
        <h2 style={{ fontSize: '2.25rem', marginBottom: 'var(--sp-4)' }}>
          Welcome, {welcomeData.name.split(' ')[0]}!
        </h2>
        <p style={{ color: 'var(--text-on-dark-muted)', fontSize: '1rem' }}>
          Preparing your secure staff ballot…
        </p>
        <div className="welcome-progress">
          <div className="welcome-progress-fill" />
        </div>
      </div>
    );
  }

  return (
    <div className="login-card">
      <div className="login-card-header">
        <div className="login-card-icon">
          <Briefcase size={32} />
        </div>
        <div>
          <h2>Staff Access</h2>
          <p className="subtitle">
            Enter your official staff code to access the staff ballot.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex-col" style={{ gap: 'var(--sp-4)' }}>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            className="input input-dark"
            placeholder="STF/XXXXX"
            value={staffCode}
            onChange={(e) => setStaffCode(e.target.value)}
            disabled={loading}
            aria-label="Staff code"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck="false"
            style={{ padding: 'var(--sp-5)' }}
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
            <><span className="btn-spinner" /> Verifying…</>
          ) : (
            <><LogIn size={20} /> Access Ballot</>
          )}
        </motion.button>

        {error && (
          <div className="error-msg" role="alert">
            <ShieldAlert size={16} />
            <span>{error}</span>
          </div>
        )}
      </form>
    </div>
  );
};

export default StaffLogin;
