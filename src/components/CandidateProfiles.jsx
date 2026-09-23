import React, { useState, useEffect, useMemo, useRef } from 'react';
import { subscribeToCandidates, submitPrimaryVote, submitSecondaryVote, submitStaffVote } from '../supabaseClient';
import { Search, CheckCircle, ArrowLeft, ShieldAlert, X } from 'lucide-react';
import StepIndicator from './StepIndicator';
import ConfirmDialog from './ConfirmDialog';
import BallotGrid from './BallotGrid';

// Portal-agnostic ballot shell. portal: 'primary' | 'secondary' | 'staff'.
// voterId is the student ID or staff code; onVoteComplete fires when every
// position is voted; onExit (optional) returns to the previous screen.
const CandidateProfiles = ({
  voterId,
  portal = 'secondary',
  voterLabel,
  initialVotedCategories = [],
  onVoteComplete,
  onExit,
}) => {
  const [candidates, setCandidates] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [votedCategories, setVotedCategories] = useState(() => new Set(initialVotedCategories));
  const [showThankYou, setShowThankYou] = useState(false);
  const [voteError, setVoteError] = useState('');
  const finishTimer = useRef(null);

  useEffect(() => {
    const unsubscribe = subscribeToCandidates((data) => setCandidates(data));
    return () => {
      unsubscribe();
      if (finishTimer.current) clearTimeout(finishTimer.current);
    };
  }, []);

  const finishVoting = () => {
    setShowThankYou(true);
    if (finishTimer.current) clearTimeout(finishTimer.current);
    finishTimer.current = setTimeout(() => onVoteComplete(), 3000);
  };

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
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.manifesto && c.manifesto.toLowerCase().includes(q))
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
      if (portal === 'primary') {
        await submitPrimaryVote(voterId, selectedCandidate.id);
      } else if (portal === 'staff') {
        await submitStaffVote(voterId, selectedCandidate.id);
      } else {
        await submitSecondaryVote(voterId, selectedCandidate.id);
      }

      const newVoted = new Set([...votedCategories, selectedCandidate.category]);
      setVotedCategories(newVoted);
      setSelectedCandidate(null);

      if (categories.every((cat) => newVoted.has(cat))) {
        finishVoting();
      }
    } catch (err) {
      setVoteError(err.message);
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
          <div className="welcome-progress-fill" style={{ animationDuration: '2.8s' }} />
        </div>
        <p style={{ marginTop: 'var(--sp-5)', color: 'var(--text-on-dark-muted)', fontSize: '0.8rem' }}>
          Finalizing session...
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
            Electoral Progress{voterLabel ? ` — ${voterLabel}` : ''}
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

      {/* Exit */}
      {onExit && (
        <div style={{ marginBottom: 'var(--sp-6)' }}>
          <button className="btn btn-sm btn-outline" onClick={onExit}>
            <ArrowLeft size={16} />
            Switch voter
          </button>
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
            style={{ paddingRight: 48 }}
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              <X size={18} />
            </button>
          )}
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

          <BallotGrid
            candidates={currentCandidates}
            selectedId={selectedCandidate?.id || null}
            onSelect={(c) => {
              setVoteError('');
              if (portal === 'secondary') {
                // Auto-submit and advance to next category for secondary portal
                setLoading(true);
                submitSecondaryVote(voterId, c.id)
                  .then(() => {
                    const newVoted = new Set([...votedCategories, c.category]);
                    setVotedCategories(newVoted);
                    // If all categories voted, show thank you and finish
                    if (categories.every((cat) => newVoted.has(cat))) {
                      finishVoting();
                    }
                  })
                  .catch((err) => setVoteError(err.message))
                  .finally(() => setLoading(false));
              } else {
                setSelectedCandidate(c);
              }
            }}
            disabled={loading}
          />

          {voteError && (
            <div className="error-msg" role="alert" style={{ marginTop: 'var(--sp-4)' }}>
              <ShieldAlert size={16} />
              <span>{voteError}</span>
            </div>
          )}

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
                fontSize: '0.8125rem',
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
