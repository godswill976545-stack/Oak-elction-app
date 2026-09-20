import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import StaffLogin from './components/StaffLogin';
import PrimarySearch from './components/PrimarySearch';
import CandidateProfiles from './components/CandidateProfiles';
import LiveResults from './components/LiveResults';
import AdminDashboard from './components/AdminDashboard';
import CandidateForm from './components/CandidateForm';
import { verifyAdminPin } from './supabaseClient';
import { Search, Inbox, Briefcase, BarChart2, ShieldCheck, ChevronRight, Settings, LogOut } from 'lucide-react';
// eslint-disable-next-line no-unused-vars -- used in JSX as <motion.button>, <MotionConfig>
import { motion, MotionConfig } from 'framer-motion';

const isLightView = (view) => view === 'menu' || view === 'admin' || view === 'candidate-form';

// Hidden standalone page (no links point here): <site>/candidate-form
const isCandidateFormPath = () =>
  typeof window !== 'undefined' && window.location.pathname.startsWith('/candidate-form');

function App() {
  // Deep-link straight into the hidden candidacy form when the URL asks for it.
  const [currentView, setCurrentView] = useState(() => (isCandidateFormPath() ? 'candidate-form' : 'menu'));
  const [loggedInStudent, setLoggedInStudent] = useState(null);
  const [initialVotes, setInitialVotes] = useState([]);
  const [loggedInStaff, setLoggedInStaff] = useState(null);
  const [initialStaffVotes, setInitialStaffVotes] = useState([]);
  const [pendingMode, setPendingMode] = useState(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinLoading, setPinLoading] = useState(false);

  const handleSelectMode = (mode) => {
    if (mode === 'primary' || mode === 'admin') {
      setPendingMode(mode);
      setPinInput('');
      setPinError('');
      return;
    }
    activateMode(mode);
  };

  const activateMode = (mode) => {
    if (mode === 'primary') setCurrentView('primary-search');
    else if (mode === 'secondary') setCurrentView('login');
    else if (mode === 'staff') setCurrentView('staff-login');
    else if (mode === 'results') setCurrentView('results');
    else if (mode === 'admin') setCurrentView('admin');
    setPendingMode(null);
    setPinInput('');
    setPinError('');
  };

  const handlePinSubmit = async () => {
    if (!pinInput.trim() || pinLoading) return;
    setPinLoading(true);
    setPinError('');
    try {
      const ok = await verifyAdminPin(pinInput);
      if (ok) {
        activateMode(pendingMode);
      } else {
        setPinError('Incorrect Admin PIN');
        setPinInput('');
      }
    } catch (err) {
      setPinError(err.message || 'Could not verify PIN.');
    } finally {
      setPinLoading(false);
    }
  };

  const handleLoginSuccess = (studentId, votedCategories = []) => {
    setLoggedInStudent(studentId);
    setInitialVotes(votedCategories);
    setCurrentView('vote');
  };

  const handleVoteComplete = () => {
    setLoggedInStudent(null);
    setInitialVotes([]);
    setCurrentView('login');
  };

  // End the current voter session without leaving the secondary mode.
  // Used as the explicit "Sign out" / "End session" affordance on the
  // shared terminal so the next student starts from a clean slate.
  const handleSignOut = () => {
    setLoggedInStudent(null);
    setInitialVotes([]);
    setCurrentView('login');
  };

  const handleStaffSuccess = (staffCode, votedCategories = []) => {
    setLoggedInStaff(staffCode);
    setInitialStaffVotes(votedCategories);
    setCurrentView('staff-vote');
  };

  const handleStaffComplete = () => {
    setLoggedInStaff(null);
    setInitialStaffVotes([]);
    setCurrentView('staff-login');
  };

  const handleStaffSignOut = () => {
    setLoggedInStaff(null);
    setInitialStaffVotes([]);
    setCurrentView('staff-login');
  };

  const goToMenu = () => {
    setCurrentView('menu');
    setLoggedInStudent(null);
    setInitialVotes([]);
    setLoggedInStaff(null);
    setInitialStaffVotes([]);
  };

  const light = isLightView(currentView);
  const inBallot = currentView === 'vote' || currentView === 'staff-vote';

  // Keep the browser chrome matched to the current theme.
  useEffect(() => {
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', light ? '#faf8f5' : '#022c22');
  }, [light]);

  return (
    <MotionConfig reducedMotion="user">
    <div className={`app-container ${light ? 'theme-light' : 'theme-dark'}`}>
      {/* Header */}
      <header className="app-header">
        <div className="logo-container">
          <img
            src="/school-logo.png"
            alt="Oak International School"
            className="school-logo"
          />
          <h1 className="header-title">
            {light ? 'Oak International School' : 'OIEC Voting Platform'}
          </h1>
        </div>

        {loggedInStudent && currentView === 'vote' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
            <span className="student-badge">
              ID: <span style={{ color: 'var(--gold-400)' }}>{loggedInStudent}</span>
            </span>
            <button
              className="btn btn-sm btn-outline"
              onClick={handleSignOut}
              aria-label="End current voter session and return to login"
            >
              <LogOut size={16} />
              End Session
            </button>
          </div>
        )}

        {loggedInStaff && currentView === 'staff-vote' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
            <span className="student-badge">
              Staff: <span style={{ color: 'var(--gold-400)' }}>{loggedInStaff}</span>
            </span>
            <button
              className="btn btn-sm btn-outline"
              onClick={handleStaffSignOut}
              aria-label="End current staff session and return to code entry"
            >
              <LogOut size={16} />
              End Session
            </button>
          </div>
        )}

        {currentView !== 'menu' && !inBallot && currentView !== 'candidate-form' && (
          <button
            className={`btn btn-sm ${light ? 'btn-outline' : 'btn-white'}`}
            onClick={goToMenu}
            aria-label="Return to system menu"
          >
            <Settings size={16} />
            Menu
          </button>
        )}


      </header>

      {/* Main */}
      <main className="main-content">
        <div key={currentView + (pendingMode || '')} className="view-transition-wrapper">

          {/* Mode Selection */}
          {currentView === 'menu' && !pendingMode && (
            <div className="mode-card">
              <div className="mode-logo">
                <img src="/school-logo.png" alt="Oak International School" />
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
                    <Search size={20} />
                    Primary Voting
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
                  className="mode-btn mode-btn-green"
                  onClick={() => handleSelectMode('staff')}
                  whileTap={{ scale: 0.97 }}
                >
                  <span className="mode-btn-label">
                    <Briefcase size={20} />
                    Staff Voting Portal
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
                <strong>{pendingMode === 'primary' ? 'Primary Voting' : 'Admin Dashboard'}</strong>.
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
                  aria-invalid={pinError ? 'true' : 'false'}
                  aria-describedby={pinError ? 'pin-error' : undefined}
                  disabled={pinLoading}
                />
                {pinError && (
                  <div
                    id="pin-error"
                    role="alert"
                    className="error-msg"
                    style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}
                  >
                    <ShieldCheck size={16} />
                    <span>{pinError}</span>
                  </div>
                )}
                <motion.button
                  className="btn btn-primary btn-block"
                  onClick={handlePinSubmit}
                  whileTap={!pinLoading ? { scale: 0.97 } : {}}
                  disabled={pinLoading}
                >
                  {pinLoading ? (
                    <><span className="btn-spinner" /> Verifying...</>
                  ) : (
                    'Unlock System'
                  )}
                </motion.button>
                <button
                  className="btn btn-outline btn-block"
                  onClick={() => { setPendingMode(null); setPinInput(''); setPinError(''); }}
                  disabled={pinLoading}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {currentView === 'primary-search' && <PrimarySearch />}
          {currentView === 'login' && <Login onLoginSuccess={handleLoginSuccess} />}
          {currentView === 'vote' && (
            <CandidateProfiles
              key={loggedInStudent || 'secondary'}
              voterId={loggedInStudent}
              portal="secondary"
              voterLabel={loggedInStudent}
              initialVotedCategories={initialVotes}
              onVoteComplete={handleVoteComplete}
            />
          )}
          {currentView === 'staff-login' && <StaffLogin onLoginSuccess={handleStaffSuccess} />}
          {currentView === 'staff-vote' && (
            <CandidateProfiles
              key={loggedInStaff || 'staff'}
              voterId={loggedInStaff}
              portal="staff"
              voterLabel={loggedInStaff}
              initialVotedCategories={initialStaffVotes}
              onVoteComplete={handleStaffComplete}
            />
          )}
          {currentView === 'results' && <LiveResults />}
          {currentView === 'admin' && <AdminDashboard />}
          {currentView === 'candidate-form' && <CandidateForm />}
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
    </MotionConfig>
  );
}

export default App;
