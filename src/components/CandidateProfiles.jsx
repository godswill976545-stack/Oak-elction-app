import React, { useState, useEffect, useMemo } from 'react';
import { subscribeToCandidates, submitPrimaryVote, submitSecondaryVote } from '../supabaseClient';
import { Search, CheckCircle, AlertCircle } from 'lucide-react';
// eslint-disable-next-line no-unused-vars -- used in JSX as <motion.button>, <AnimatePresence>
import { motion, AnimatePresence } from 'framer-motion';
import StepIndicator from './StepIndicator';
import ConfirmDialog from './ConfirmDialog';

const CandidateProfiles = ({ studentId, mode, onVoteComplete }) => {
  const [candidates, setCandidates] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [votedCategories, setVotedCategories] = useState(new Set());
  const [showThankYou, setShowThankYou] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToCandidates((data) => setCandidates(data));
    return () => unsubscribe();
  }, []);

  const grouped = useMemo(() => {
    const map = {};
    candidates.forEach((c) => {
      const cat = c.category || 'Uncategorized';
      if (!map[cat]) map[cat] = [];
      map[cat].push(c);
    });
    return map;
  }, [candidates]);

  const categories = Object.keys(grouped);

  const filteredGrouped = useMemo(() => {
    const result = {};
    const q = searchQuery.toLowerCase();
    Object.entries(grouped).forEach(([cat, cands]) => {
      const filtered = cands.filter(
        (c) => c.name.toLowerCase().includes(q) || (c.manifesto && c.manifesto.toLowerCase().includes(q))
      );
      if (filtered.length > 0) result[cat] = filtered;
    });
    return result;
  }, [grouped, searchQuery]);

  const currentCategoryIndex = categories.findIndex((cat) => !votedCategories.has(cat));
  const currentCategory = currentCategoryIndex >= 0 ? categories[currentCategoryIndex] : null;
  const currentCandidates = currentCategory ? filteredGrouped[currentCategory] || [] : [];

  const handleVote = async () => {
    if (!selectedCandidate) return;
    setLoading(true);
    try {
      if (mode === 'primary') {
        await submitPrimaryVote(selectedCandidate.id);
      } else {
        await submitSecondaryVote(studentId, selectedCandidate.id);
      }

      const newVoted = new Set([...votedCategories, selectedCandidate.category]);
      setVotedCategories(newVoted);
      setSelectedCandidate(null);

      if (categories.every((cat) => newVoted.has(cat))) {
        setShowThankYou(true);
        if (mode === 'primary') {
          setTimeout(() => {
            setShowThankYou(false);
            setVotedCategories(new Set());
            setSearchQuery('');
          }, 4000);
        } else {
          setTimeout(() => onVoteComplete(), 3000);
        }
      }
    } catch (err) {
      alert(err.message);
      setSelectedCandidate(null);
    } finally {
      setLoading(false);
    }
  };

  /* Thank You Screen */
  if (showThankYou) {
    return (
      <div className="card card-dark" style={{ maxWidth: 500, margin: '0 auto', textAlign: 'center', padding: 'var(--sp-16) var(--sp-10)' }}>
        <div className="welcome-check" style={{ marginBottom: 'var(--sp-6)' }}>
          <CheckCircle size={40} />
        </div>
        <h2 style={{ fontSize: '2rem', marginBottom: 'var(--sp-4)' }}>Vote Registered!</h2>
        <p style={{ color: 'var(--text-on-dark-muted)', fontSize: '0.95rem', lineHeight: 1.5 }}>
          Thank you for exercising your right to vote. Your choices have been securely recorded.
        </p>
        <div className="welcome-progress" style={{ marginTop: 'var(--sp-8)' }}>
          <div
            className="welcome-progress-fill"
            style={{ animationDuration: mode === 'primary' ? '3.8s' : '2.8s' }}
          />
        </div>
        <p style={{ marginTop: 'var(--sp-5)', color: 'var(--text-on-dark-muted)', fontSize: '0.8rem' }}>
          {mode === 'primary' ? 'Clearing session for next voter...' : 'Finalizing portal session...'}
        </p>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', maxWidth: 960, margin: '0 auto' }}>
      {/* Progress */}
      <div className="vote-progress" style={{ marginBottom: 'var(--sp-8)' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 'var(--sp-2)', color: 'var(--gold-400)' }}>
            Electoral Progress
          </div>
          <div className="vote-progress-bar">
            <div
              className="vote-progress-fill"
              style={{ width: categories.length > 0 ? `${(votedCategories.size / categories.length) * 100}%` : '0%' }}
            />
          </div>
        </div>
        <span className="vote-progress-label">
          {votedCategories.size} / {categories.length}
        </span>
      </div>

      {/* Step Indicator */}
      {categories.length > 0 && (
        <StepIndicator total={categories.length} current={currentCategoryIndex >= 0 ? currentCategoryIndex : categories.length} />
      )}

      {/* Kiosk Banner */}
      {mode === 'primary' && (
        <div className="kiosk-banner" style={{ marginBottom: 'var(--sp-6)' }}>
          <AlertCircle size={18} />
          <span>Kiosk Mode Active: No Student ID Required.</span>
        </div>
      )}

      {/* Search */}
      {currentCategory && (
        <div className="search-bar">
          <Search className="search-icon" size={18} />
          <input
            type="text"
            className="input input-dark"
            placeholder="Search candidates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search candidates"
          />
        </div>
      )}

      {/* Current Category */}
      {currentCategory ? (
        <section style={{ marginBottom: 'var(--sp-10)' }}>
          <div className="category-header">
            <h2 className="category-title">{currentCategory}</h2>
            <span className="category-badge">
              <CheckCircle size={12} />
              Vote now
            </span>
          </div>

          <div className="candidate-grid">
            <AnimatePresence mode="popLayout">
              {currentCandidates.map((candidate, index) => (
                <motion.div
                  key={candidate.id}
                  className="candidate-card"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: index * 0.05 }}
                  layout
                >
                  <img src={candidate.photo_url} alt={candidate.name} />
                  <div className="candidate-card-body">
                    <div className="candidate-card-role">{candidate.category}</div>
                    <div className="candidate-card-name">{candidate.name}</div>
                    <p className="candidate-card-manifesto">"{candidate.manifesto}"</p>
                    <motion.button
                      className="btn btn-primary btn-block"
                      onClick={() => setSelectedCandidate(candidate)}
                      whileTap={{ scale: 0.97 }}
                    >
                      Vote for {candidate.name.split(' ')[0]}
                    </motion.button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {currentCandidates.length === 0 && (
            <div className="empty-state">
              <p>No candidates found matching your search.</p>
            </div>
          )}
        </section>
      ) : (
        <div className="card card-dark" style={{ textAlign: 'center', maxWidth: 500, margin: '0 auto', padding: 'var(--sp-12)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 'var(--sp-4)' }}>&#127891;</div>
          <h2 style={{ marginBottom: 'var(--sp-3)' }}>All Categories Complete</h2>
          <p style={{ color: 'var(--text-on-dark-muted)' }}>
            You have voted in every category. Thank you for participating!
          </p>
        </div>
      )}

      {/* Voted Categories Summary */}
      {votedCategories.size > 0 && currentCategory && (
        <div style={{ marginTop: 'var(--sp-6)', display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
          {categories.map((cat) => (
            <span
              key={cat}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--sp-1)',
                padding: 'var(--sp-1) var(--sp-3)',
                borderRadius: 'var(--radius-full)',
                fontSize: '0.75rem',
                fontWeight: 700,
                background: votedCategories.has(cat) ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.06)',
                color: votedCategories.has(cat) ? 'var(--emerald-400)' : 'var(--text-on-dark-muted)',
                border: votedCategories.has(cat) ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {votedCategories.has(cat) && <CheckCircle size={10} />}
              {cat}
            </span>
          ))}
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmDialog
        open={!!selectedCandidate}
        candidate={selectedCandidate}
        loading={loading}
        onConfirm={handleVote}
        onCancel={() => setSelectedCandidate(null)}
      />
    </div>
  );
};

export default CandidateProfiles;
