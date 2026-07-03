import React, { useState, useEffect } from 'react';
import { checkSupabaseHealth } from '../supabaseClient';
import { WifiOff, RefreshCw, AlertTriangle } from 'lucide-react';

const ConnectionBanner = () => {
  const [status, setStatus] = useState('checking'); // checking | ok | error
  const [message, setMessage] = useState('');

  const runCheck = async () => {
    setStatus('checking');
    const result = await checkSupabaseHealth();
    if (result.ok) {
      setStatus('ok');
      setMessage('');
    } else {
      setStatus('error');
      setMessage(result.error);
    }
  };

  useEffect(() => {
    runCheck();
    // Re-check every 30 seconds while the app is open
    const interval = setInterval(runCheck, 30000);
    return () => clearInterval(interval);
  }, []);

  if (status === 'ok') return null;

  return (
    <>
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: status === 'checking' ? '#f59e0b' : '#ef4444',
        color: '#fff',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        fontWeight: 600,
        fontSize: '0.9rem',
        textAlign: 'center',
        flexWrap: 'wrap',
      }}
    >
      {status === 'checking' ? (
        <>
          <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} />
          Checking database connection…
        </>
      ) : (
        <>
          <AlertTriangle size={18} />
          <span style={{ maxWidth: '80%' }}>{message || 'Database unreachable'}</span>
          <button
            onClick={runCheck}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: '1px solid rgba(255,255,255,0.4)',
              color: '#fff',
              borderRadius: '8px',
              padding: '4px 10px',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              marginLeft: '8px',
            }}
          >
            Retry
          </button>
        </>
      )}
    </div>
    <div style={{ height: '48px' }} />
    </>
  );
};

export default ConnectionBanner;
