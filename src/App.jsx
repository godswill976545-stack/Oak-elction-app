import React, { useState, useEffect, useRef } from 'react';
import Login from './components/Login';
import CandidateProfiles from './components/CandidateProfiles';
import LiveResults from './components/LiveResults';
import AdminDashboard from './components/AdminDashboard';
import { Landmark, Monitor, Inbox, BarChart2, ShieldCheck, ChevronRight, GraduationCap } from 'lucide-react';
import { motion } from 'framer-motion';

function App() {
  const [systemMode, setSystemMode]       = useState(null);
  const [currentView, setCurrentView]     = useState('menu');
  const [loggedInStudent, setLoggedInStudent] = useState(null);
  const [pendingMode, setPendingMode]     = useState(null);
  const [pinInput, setPinInput]           = useState('');
  
  const handleSelectMode = (mode) => {
    if (mode === 'primary' || mode === 'admin') {
      setPendingMode(mode);
      return;
    }
    activateMode(mode);
  };

  const activateMode = (mode) => {
    setSystemMode(mode);
    if      (mode === 'primary')   setCurrentView('vote');
    else if (mode === 'secondary') setCurrentView('login');
    else if (mode === 'results')   setCurrentView('results');
    else if (mode === 'admin')     setCurrentView('admin');
    setPendingMode(null);
    setPinInput('');
  };

  const handlePinSubmit = () => {
    if (pinInput === '5793') {
      activateMode(pendingMode);
    } else {
      alert('Incorrect Admin PIN');
      setPinInput('');
    }
  };

  const handleLoginSuccess  = (studentId) => { setLoggedInStudent(studentId); setCurrentView('vote'); };
  const handleVoteComplete  = () => { setLoggedInStudent(null); setCurrentView('login'); };

  return (
    <div className={`app-container ${['menu', 'admin'].includes(currentView) ? 'theme-light' : 'theme-dark'}`}>
      {/* ── Background Mesh ── */}
      <div className="mesh-gradient" />

      {/* ── Header ── */}
      <header className={`app-header ${['menu', 'admin'].includes(currentView) ? 'header-light' : ''}`}>
        <div className="logo-container">
          {['menu', 'admin'].includes(currentView) ? (
            <GraduationCap size={32} className="school-logo-icon" />
          ) : (
            <img src="/oak-logo.png" alt="Oak International School Logo" className="school-logo" />
          )}
          <h1 className="header-title">{['menu', 'admin'].includes(currentView) ? 'Oak International School' : 'OIEC VOTING PLATFORM'}</h1>
        </div>

        {loggedInStudent && currentView === 'vote' && systemMode === 'secondary' && (
          <div style={{ fontWeight: 600, background: 'rgba(255,255,255,0.1)', padding: '8px 18px', borderRadius: '30px', border: '1px solid rgba(255,255,255,0.2)', color: '#fff' }}>
            STUDENT ID: <span style={{ color: 'var(--gold-400)' }}>{loggedInStudent}</span>
          </div>
        )}

        {currentView !== 'menu' && !(currentView === 'vote' && systemMode === 'secondary') ? (
          <button
            className={['menu', 'admin'].includes(currentView) ? "btn-select btn-white" : "btn-3d btn-sm"}
            style={['menu', 'admin'].includes(currentView) ? { padding: '10px 20px', width: 'auto', marginBottom: 0 } : { padding: '10px 20px', fontSize: '0.9rem' }}
            onClick={() => { setSystemMode(null); setCurrentView('menu'); setLoggedInStudent(null); }}
          >
            ⚙️ System Menu
          </button>
        ) : ['menu', 'admin'].includes(currentView) ? (
          <div className="header-nav">
            <a href="#">Polls</a>
            <a href="#">Results</a>
            <a href="#">Profile</a>
          </div>
        ) : null}
      </header>

      {/* ── Main View Container with Transition ── */}
      <main className="main-content">
        <div key={currentView + (pendingMode || '')} className="view-transition-wrapper">
          {/* Mode selection menu */}
          {currentView === 'menu' && !pendingMode && (
            <div className="mode-selection-card">
              <div className="icon-wrapper">
                <Landmark size={40} />
              </div>
              <div className="sys-config-label">SYSTEM CONFIGURATION</div>
              <h2 className="main-title">Select System Mode</h2>

              <div className="flex-col" style={{ gap: '16px' }}>
                <motion.button 
                  className="btn-select btn-green" 
                  onClick={() => handleSelectMode('primary')}
                  whileHover={{ scale: 1.02, boxShadow: '0px 0px 20px rgba(6, 95, 70, 0.4)' }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="btn-select-left">
                    <Monitor size={20} />
                    <span>Primary Kiosk Mode</span>
                  </div>
                  <ChevronRight size={20} opacity={0.7} />
                </motion.button>

                <motion.button 
                  className="btn-select btn-green" 
                  onClick={() => handleSelectMode('secondary')}
                  whileHover={{ scale: 1.02, boxShadow: '0px 0px 20px rgba(6, 95, 70, 0.4)' }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="btn-select-left">
                    <Inbox size={20} />
                    <span>Secondary Voting Portal</span>
                  </div>
                  <ChevronRight size={20} opacity={0.7} />
                </motion.button>

                <motion.button 
                  className="btn-select btn-yellow" 
                  onClick={() => handleSelectMode('results')}
                  whileHover={{ scale: 1.02, boxShadow: '0px 0px 20px rgba(245, 158, 11, 0.4)' }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="btn-select-left">
                    <BarChart2 size={20} />
                    <span>View Live Results</span>
                  </div>
                  <ChevronRight size={20} opacity={0.7} />
                </motion.button>

                <motion.button 
                  className="btn-select btn-white" 
                  onClick={() => handleSelectMode('admin')}
                  whileHover={{ scale: 1.02, boxShadow: '0px 0px 20px rgba(6, 95, 70, 0.15)' }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="btn-select-left">
                    <ShieldCheck size={20} />
                    <span>Admin Dashboard</span>
                  </div>
                  <ChevronRight size={20} opacity={0.7} />
                </motion.button>
              </div>

              <div className="card-footer-text">
                Authorized access only. Mode selection will lock the current<br/>
                terminal until reset by an administrator.
              </div>
            </div>
          )}

          {/* PIN verification screen */}
          {currentView === 'menu' && pendingMode && (
            <div className="mode-selection-card">
              <div className="icon-wrapper" style={{ backgroundColor: '#fef08a', color: '#854d0e' }}>
                <ShieldCheck size={40} />
              </div>
              <div className="sys-config-label">SECURITY CLEARANCE</div>
              <h2 className="main-title" style={{ marginBottom: '20px' }}>Verification Required</h2>
              <p className="subtitle" style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>
                Please enter the secure PIN to access <strong>{pendingMode === 'primary' ? 'Kiosk Mode' : 'Admin Dashboard'}</strong>.
              </p>
              <div className="flex-col">
                <input
                  type="password"
                  className="input-field"
                  placeholder="••••"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handlePinSubmit()}
                  style={{ 
                    textAlign: 'center', fontSize: '2.5rem', letterSpacing: '16px', 
                    background: '#f8fafc', border: '2px solid #e2e8f0', color: '#1e293b', borderRadius: '16px', padding: '16px', outline: 'none'
                  }}
                  autoFocus
                />
                <motion.button 
                  className="btn-select btn-green" 
                  onClick={handlePinSubmit} 
                  style={{ justifyContent: 'center', marginTop: '16px' }}
                  whileHover={{ scale: 1.02, boxShadow: '0px 0px 20px rgba(6, 95, 70, 0.4)' }}
                  whileTap={{ scale: 0.98 }}
                >
                  Unlock System
                </motion.button>
                <motion.button 
                  className="btn-select btn-white" 
                  onClick={() => { setPendingMode(null); setPinInput(''); }} 
                  style={{ justifyContent: 'center', border: 'none' }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Cancel
                </motion.button>
              </div>
            </div>
          )}

          {currentView === 'login'   && <Login onLoginSuccess={handleLoginSuccess} />}
          {currentView === 'vote'    && (
            <CandidateProfiles
              studentId={loggedInStudent}
              mode={systemMode}
              onVoteComplete={handleVoteComplete}
            />
          )}
          {currentView === 'results' && <LiveResults />}
          {currentView === 'admin'   && <AdminDashboard />}
        </div>
      </main>

      {['menu', 'admin'].includes(currentView) ? (
        <footer className="app-footer">
          <div className="footer-left">
            <h3>Oak International School</h3>
            <p>&copy; {new Date().getFullYear()} Oak International School. All rights reserved.</p>
          </div>
          <div className="footer-nav">
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
            <a href="#">Help Center</a>
          </div>
        </footer>
      ) : (
        <footer style={{ textAlign: 'center', padding: '32px', color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', zIndex: 1, position: 'relative' }}>
          &copy; {new Date().getFullYear()} Oak International School &mdash; High-Security Voting Infrastructure.
        </footer>
      )}
    </div>
  );
}

export default App;
