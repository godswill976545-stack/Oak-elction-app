import React, { useState } from 'react';
import Login from './components/Login';
import CandidateProfiles from './components/CandidateProfiles';
import LiveResults from './components/LiveResults';
import AdminDashboard from './components/AdminDashboard';
import { Landmark, Monitor, Inbox, BarChart2, ShieldCheck, ChevronRight, GraduationCap, Settings } from 'lucide-react';
// eslint-disable-next-line no-unused-vars -- used in JSX as <motion.button>
import { motion } from 'framer-motion';

const isLightView = (view) => view === 'menu' || view === 'admin';

function App() {
  const [systemMode, setSystemMode] = useState(null);
  const [currentView, setCurrentView] = useState('menu');
  const [loggedInStudent, setLoggedInStudent] = useState(null);
  const [pendingMode, setPendingMode] = useState(null);
  const [pinInput, setPinInput] = useState('');

  const handleSelectMode = (mode) => {
    if (mode === 'primary' || mode === 'admin') {
      setPendingMode(mode);
      return;
    }
    activateMode(mode);
  };

  const activateMode = (mode) => {
    setSystemMode(mode);
    if (mode === 'primary') setCurrentView('vote');
    else if (mode === 'secondary') setCurrentView('login');
    else if (mode === 'results') setCurrentView('results');
    else if (mode === 'admin') setCurrentView('admin');
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

  const handleLoginSuccess = (studentId) => {
    setLoggedInStudent(studentId);
    setCurrentView('vote');
  };

  const handleVoteComplete = () => {
    setLoggedInStudent(null);
    setCurrentView('login');
  };

  const goToMenu = () => {
    setSystemMode(null);
    setCurrentView('menu');
    setLoggedInStudent(null);
  };

  const light = isLightView(currentView);

  return (
    <div className={`app-container ${light ? 'theme-light' : 'theme-dark'}`}>
      {/* Header */}
      <header className="app-header">
        <div className="logo-container">
          {light ? (
            <GraduationCap size={28} className="school-logo-icon" style={{ color: 'var(--emerald-800)' }} />
          ) : (
            <img src="/oak-logo.png" alt="Oak International School" className="school-logo" />
          )}
          <h1 className="header-title">
            {light ? 'Oak International School' : 'OIEC Voting Platform'}
          </h1>
        </div>

        {loggedInStudent && currentView === 'vote' && systemMode === 'secondary' && (
          <span className="student-badge">
            ID: <span style={{ color: 'var(--gold-400)' }}>{loggedInStudent}</span>
          </span>
        )}

        {currentView !== 'menu' && !(currentView === 'vote' && systemMode === 'secondary') && (
          <button
            className={`btn btn-sm ${light ? 'btn-outline' : 'btn-white'}`}
            onClick={goToMenu}
            aria-label="Return to system menu"
          >
            <Settings size={16} />
            Menu
          </button>
        )}

        {light && currentView === 'menu' && (
          <nav className="header-nav" aria-label="Main navigation">
            <a href="#">Polls</a>
            <a href="#">Results</a>
            <a href="#">Profile</a>
          </nav>
        )}
      </header>

      {/* Main */}
      <main className="main-content">
        <div key={currentView + (pendingMode || '')} className="view-transition-wrapper">

          {/* Mode Selection */}
          {currentView === 'menu' && !pendingMode && (
            <div className="mode-card">
              <div className="icon-circle">
                <Landmark size={36} />
              </div>
              <div className="section-label">System Configuration</div>
              <h2>Select Mode</h2>

              <div className="mode-buttons">
                <motion.button
                  className="mode-btn mode-btn-green"
                  onClick={() => handleSelectMode('primary')}
                  whileTap={{ scale: 0.97 }}
                >
                  <span className="mode-btn-label">
                    <Monitor size={20} />
                    Primary Kiosk Mode
                  </span>
                  <ChevronRight size={18} opacity={0.5} />
                </motion.button>

                <motion.button
                  className="mode-btn mode-btn-green"
                  onClick={() => handleSelectMode('secondary')}
                  whileTap={{ scale: 0.97 }}
                >
                  <span className="mode-btn-label">
                    <Inbox size={20} />
                    Secondary Voting Portal
                  </span>
                  <ChevronRight size={18} opacity={0.5} />
                </motion.button>

                <motion.button
                  className="mode-btn mode-btn-gold"
                  onClick={() => handleSelectMode('results')}
                  whileTap={{ scale: 0.97 }}
                >
                  <span className="mode-btn-label">
                    <BarChart2 size={20} />
                    View Live Results
                  </span>
                  <ChevronRight size={18} opacity={0.5} />
                </motion.button>

                <motion.button
                  className="mode-btn mode-btn-white"
                  onClick={() => handleSelectMode('admin')}
                  whileTap={{ scale: 0.97 }}
                >
                  <span className="mode-btn-label">
                    <ShieldCheck size={20} />
                    Admin Dashboard
                  </span>
                  <ChevronRight size={18} opacity={0.5} />
                </motion.button>
              </div>

              <p className="mode-footer">
                Authorized access only. Mode selection will lock the
                <br />
                terminal until reset by an administrator.
              </p>
            </div>
          )}

          {/* PIN Verification */}
          {currentView === 'menu' && pendingMode && (
            <div className="mode-card">
              <div className="icon-circle" style={{ backgroundColor: 'var(--gold-100)', color: 'var(--gold-700)' }}>
                <ShieldCheck size={36} />
              </div>
              <div className="section-label">Security Clearance</div>
              <h2>Verification Required</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--sp-6)', fontSize: '0.95rem' }}>
                Enter the secure PIN to access{' '}
                <strong>{pendingMode === 'primary' ? 'Kiosk Mode' : 'Admin Dashboard'}</strong>.
              </p>

              <div className="flex-col">
                <input
                  type="password"
                  className="input input-pin"
                  placeholder="&#8226;&#8226;&#8226;&#8226;"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handlePinSubmit()}
                  autoFocus
                  aria-label="Admin PIN"
                />
                <motion.button
                  className="btn btn-primary btn-block"
                  onClick={handlePinSubmit}
                  whileTap={{ scale: 0.97 }}
                >
                  Unlock System
                </motion.button>
                <button
                  className="btn btn-outline btn-block"
                  onClick={() => { setPendingMode(null); setPinInput(''); }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {currentView === 'login' && <Login onLoginSuccess={handleLoginSuccess} />}
          {currentView === 'vote' && (
            <CandidateProfiles
              studentId={loggedInStudent}
              mode={systemMode}
              onVoteComplete={handleVoteComplete}
            />
          )}
          {currentView === 'results' && <LiveResults />}
          {currentView === 'admin' && <AdminDashboard />}
        </div>
      </main>

      {/* Footer */}
      {light ? (
        <footer className="app-footer">
          <div className="footer-left">
            <h3>Oak International School</h3>
            <p>&copy; {new Date().getFullYear()} All rights reserved.</p>
          </div>
          <div className="footer-nav">
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
            <a href="#">Help Center</a>
          </div>
        </footer>
      ) : (
        <footer style={{ textAlign: 'center', padding: 'var(--sp-8)', color: 'var(--text-on-dark-muted)', fontSize: '0.85rem' }}>
          &copy; {new Date().getFullYear()} Oak International School &mdash; Secure Voting Infrastructure.
        </footer>
      )}
    </div>
  );
}

export default App;
