import React, { useState, useEffect, useRef } from 'react';
import { searchStudents } from '../supabaseClient';
import { Search, CheckCircle2, UserSearch, ChevronRight, ShieldAlert, X } from 'lucide-react';
// eslint-disable-next-line no-unused-vars -- used in JSX as <motion.button>, <motion.div>, <AnimatePresence>
import { motion, AnimatePresence } from 'framer-motion';
import CandidateProfiles from './CandidateProfiles';

// Primary portal: type a name, pick the voter, ballot opens. When voting
// finishes the screen returns here with the search kept for the next voter.
const PrimarySearch = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  // Bumped when a ballot finishes so the list re-fetches fresh
  // voted/complete flags instead of showing the just-finished voter as votable.
  const [refreshTick, setRefreshTick] = useState(0);
  const timer = useRef(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(async () => {
      try {
        const data = await searchStudents(q);
        setResults(Array.isArray(data) ? data : []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => timer.current && clearTimeout(timer.current);
  }, [query, refreshTick]);

  const handleDone = () => {
    // Ballot finished: drop back to the name search for the next voter.
    setSelected(null);
    setRefreshTick((t) => t + 1);
  };

  if (selected) {
    return (
      <CandidateProfiles
        key={selected.id}
        voterId={selected.id}
        portal="primary"
        voterLabel={selected.name}
        initialVotedCategories={selected.votedCategories || []}
        onVoteComplete={handleDone}
        onExit={() => setSelected(null)}
      />
    );
  }

  return (
    <div className="login-card" style={{ maxWidth: 520 }}>
      <div className="login-card-header">
        <div className="login-card-icon">
          <UserSearch size={32} />
        </div>
        <div>
          <h2>Find Voter</h2>
          <p className="subtitle">
            Type the voter&apos;s name, tap it, and hand over the terminal to vote.
          </p>
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        <Search
          size={18}
          style={{ position: 'absolute', left: 'var(--sp-5)', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }}
        />
        <input
          type="text"
          className="input input-dark"
          placeholder="Start typing a name..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
          aria-label="Search voter by name"
          style={{ padding: 'var(--sp-5)', paddingLeft: 48, paddingRight: 48 }}
        />
        {query && (
          <button
            type="button"
            className="search-clear"
            onClick={() => setQuery('')}
            aria-label="Clear search"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <div style={{ marginTop: 'var(--sp-4)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', minHeight: 120 }}>
        <AnimatePresence>
          {searching && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ color: 'var(--text-on-dark-muted)', fontSize: '0.9rem', textAlign: 'center', padding: 'var(--sp-4)' }}
            >
              Searching...
            </motion.div>
          )}
          {!searching && query.trim().length >= 2 && results.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="error-msg"
              style={{ justifyContent: 'center' }}
              role="status"
            >
              <ShieldAlert size={16} />
              <span>No voter matches &ldquo;{query.trim()}&rdquo;.</span>
            </motion.div>
          )}
          {results.map((s) => (
            <motion.button
              key={s.id}
              type="button"
              className="voter-row"
              onClick={() => !s.complete && setSelected(s)}
              disabled={s.complete}
              whileTap={!s.complete ? { scale: 0.98 } : {}}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              layout
            >
              <span className="voter-row-info">
                <span className="voter-row-name">{s.name}</span>
                <span className="voter-row-id">{s.id}</span>
              </span>
              {s.complete ? (
                <span className="voter-row-done">
                  <CheckCircle2 size={16} />
                  Voted
                </span>
              ) : (
                <ChevronRight size={18} opacity={0.5} />
              )}
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default PrimarySearch;
