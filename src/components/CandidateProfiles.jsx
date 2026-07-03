import React, { useState, useEffect } from 'react';
import { subscribeToCandidates, submitPrimaryVote, submitSecondaryVote } from '../supabaseClient';
import { Search, CheckCircle, ChevronRight, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

const CandidateProfiles = ({ studentId, mode, onVoteComplete }) => {
  const [candidates,        setCandidates]        = useState([]);
  const [searchQuery,       setSearchQuery]       = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [loading,           setLoading]           = useState(false);
  const [votedCategories,   setVotedCategories]   = useState(new Set());
  const [showThankYou,      setShowThankYou]      = useState(false);
  const [voteError,         setVoteError]         = useState('');

  useEffect(() => {
    const unsubscribe = subscribeToCandidates((data) => setCandidates(data));
    return () => unsubscribe();
  }, []);

  const grouped = {};
  candidates.forEach(c => {
    const cat = c.category || 'Uncategorized';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(c);
  });

  const categories = Object.keys(grouped);

  const filteredGrouped = {};
  Object.entries(grouped).forEach(([cat, cands]) => {
    const filtered = cands.filter(c =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.manifesto.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (filtered.length > 0) filteredGrouped[cat] = filtered;
  });

  const handleVote = async () => {
    if (!selectedCandidate) return;
    setLoading(true);
    setVoteError('');
    try {
      if (mode === 'primary') {
        await submitPrimaryVote(selectedCandidate.id);
      } else {
        await submitSecondaryVote(studentId, selectedCandidate.id);
      }

      const newVoted = new Set([...votedCategories, selectedCandidate.category]);
      setVotedCategories(newVoted);
      setSelectedCandidate(null);

      if (categories.every(cat => newVoted.has(cat))) {
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
      setVoteError(err.message || 'Vote failed. Please retry.');
    } finally {
      setLoading(false);
    }
  };

  if (showThankYou) {
    return (
      <div className="glass-container text-center" style={{ padding: '64px 48px' }}>
        <CheckCircle
          size={80}
          style={{ color: 'var(--gold-400)', marginBottom: '24px', animation: 'pulse 1.5s ease-in-out infinite' }}
        />
        <h2 style={{ fontSize: '2.5rem', marginBottom: '16px' }}>Vote Registered! 🎉</h2>
        <p className="subtitle">
          Thank you for exercising your right to vote. Your choices have been securely encrypted and stored in the digital ledger.
        </p>
        <div style={{
          width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)',
          borderRadius: '10px', marginTop: '32px', overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.05)'
        }}>
          <div style={{
            height: '100%', background: 'linear-gradient(90deg, var(--emerald-500), var(--gold-400))',
            animation: `progressBar ${mode === 'primary' ? '3.8s' : '2.8s'} linear forwards`,
            borderRadius: '10px',
          }} />
        </div>
        <p style={{ marginTop: '20px', color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>
          {mode === 'primary' ? 'Clearing session for next voter...' : 'Finalizing portal session...'}
        </p>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Banner & Progress */}
      <div style={{ 
        display: 'flex', flexWrap: 'wrap', gap: '20px', marginBottom: '40px',
        background: 'rgba(255,255,255,0.05)', padding: '24px', borderRadius: '24px',
        border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)'
      }}>
        <div style={{ flex: '1 1 300px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '8px', color: 'var(--gold-400)' }}>
            Electoral Progress
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div style={{ flexGrow: 1, height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '10px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: categories.length > 0 ? `${(votedCategories.size / categories.length) * 100}%` : '0%',
                background: 'linear-gradient(90deg, var(--emerald-500), var(--gold-400))',
                borderRadius: '10px',
                transition: 'width 0.8s cubic-bezier(0.23, 1, 0.32, 1)',
              }} />
            </div>
            <span style={{ fontWeight: 700, fontSize: '1rem' }}>
              {votedCategories.size} / {categories.length}
            </span>
          </div>
        </div>

        {mode === 'primary' && (
          <div style={{ 
            display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px', 
            background: 'rgba(5, 150, 105, 0.15)', borderRadius: '16px', border: '1px solid var(--emerald-600)' 
          }}>
            <AlertCircle size={20} color="var(--emerald-400)" />
            <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
              Kiosk Mode Active: No Student ID Required.
            </span>
          </div>
        )}
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '48px', maxWidth: '600px' }}>
        <Search style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} size={20} />
        <input
          type="text"
          className="input-field"
          placeholder="Filter candidates or roles..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ 
            paddingLeft: '56px', background: 'rgba(255,255,255,0.05)', 
            border: '1px solid rgba(255,255,255,0.15)', borderRadius: '100px', height: '60px' 
          }}
        />
      </div>

      {/* Categories */}
      {Object.entries(filteredGrouped).map(([category, catCandidates]) => {
        const alreadyVoted = votedCategories.has(category);
        return (
          <section key={category} style={{ marginBottom: '64px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>{category}</h2>
              {alreadyVoted && (
                <span style={{
                  background: 'rgba(5, 150, 105, 0.2)', color: 'var(--emerald-400)',
                  padding: '6px 14px', borderRadius: '100px',
                  fontSize: '0.85rem', fontWeight: 700,
                  display: 'flex', alignItems: 'center', gap: '6px',
                  border: '1px solid var(--emerald-600)'
                }}>
                  <CheckCircle size={14} /> Registered Successfully
                </span>
              )}
            </div>

            <div className="bento-grid">
              {catCandidates.map((candidate, index) => {
                // Determine layout class dynamically based on index for asymmetrical look
                let bentoClass = 'bento-regular';
                if (index % 5 === 0) bentoClass = 'bento-large';
                else if (index % 5 === 3) bentoClass = 'bento-tall';
                else if (index % 5 === 4) bentoClass = 'bento-wide';

                return (
                  <div
                    key={candidate.id}
                    className={`bento-card-glass ${bentoClass}`}
                    style={{ 
                      opacity: alreadyVoted ? 0.4 : 1, 
                      pointerEvents: alreadyVoted ? 'none' : 'auto',
                      filter: alreadyVoted ? 'grayscale(0.5)' : 'none'
                    }}
                  >
                    <div style={{ 
                      width: '100%', flex: '1 1 auto', minHeight: '200px', borderRadius: '18px', overflow: 'hidden', 
                      marginBottom: '20px', position: 'relative', background: 'rgba(255,255,255,0.05)' 
                    }}>
                      <img 
                        src={candidate.photo_url} 
                        alt={candidate.name} 
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                      />
                    </div>
                    
                    <div style={{ flex: '0 0 auto' }}>
                      <h3 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '12px', color: '#fff' }}>
                        {candidate.name}
                      </h3>
                      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '1rem', lineHeight: 1.6, marginBottom: '24px' }}>
                        "{candidate.manifesto}"
                      </p>
                    </div>

                    {alreadyVoted ? (
                      <button className="btn-3d" style={{ width: '100%', opacity: 0.5, cursor: 'default' }} disabled>
                        Section Completed
                      </button>
                    ) : (
                      <motion.button
                        className="btn-3d btn-3d-emerald"
                        style={{ width: '100%' }}
                        onClick={() => setSelectedCandidate(candidate)}
                        whileHover={{ scale: 1.02, boxShadow: '0px 0px 15px rgba(5, 150, 105, 0.6)' }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <ChevronRight size={20} /> Cast Vote
                      </motion.button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {Object.keys(filteredGrouped).length === 0 && (
        <div className="glass-container text-center" style={{ maxWidth: '100%' }}>
          <p className="subtitle">No candidates found matching your current filter.</p>
        </div>
      )}

      {/* Confirmation Modal */}
      {selectedCandidate && (
        <div className="modal-overlay">
          <div className="glass-container text-center" style={{ maxWidth: '440px' }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '20px' }}>🗳️</div>
            <h2 style={{ fontSize: '1.75rem', marginBottom: '12px' }}>Confirm Choice</h2>
            <p className="subtitle" style={{ fontSize: '1rem' }}>
              You are selecting <strong style={{ color: 'var(--gold-400)' }}>{selectedCandidate.name}</strong> for the role of <strong>{selectedCandidate.category}</strong>.
            </p>
            <div style={{ background: 'rgba(251, 113, 133, 0.1)', padding: '16px', borderRadius: '16px', marginBottom: '16px', border: '1px solid rgba(251, 113, 133, 0.2)' }}>
              <p style={{ color: '#fb7185', fontSize: '0.85rem', fontWeight: 600 }}>
                ⚠️ Warning: You cannot change this vote after confirmation.
              </p>
            </div>

            {voteError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', padding: '12px', borderRadius: '12px', marginBottom: '16px', fontWeight: 600, fontSize: '0.9rem', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                {voteError}
              </div>
            )}

            <div className="flex-col">
              <motion.button
                className="btn-3d btn-3d-gold"
                onClick={handleVote}
                disabled={loading}
                whileHover={{ scale: 1.05, boxShadow: '0px 0px 20px rgba(251, 191, 36, 0.6)' }}
                whileTap={{ scale: 0.95 }}
              >
                {loading
                  ? <><span className="btn-spinner" /> Validating...</>
                  : 'Confirm & Sign'
                }
              </motion.button>
              <motion.button
                className="btn-3d"
                style={{ background: 'transparent', border: 'none' }}
                onClick={() => { setSelectedCandidate(null); setVoteError(''); }}
                disabled={loading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Go Back
              </motion.button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CandidateProfiles;
