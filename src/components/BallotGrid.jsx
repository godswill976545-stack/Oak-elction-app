import React from 'react';
import { Check } from 'lucide-react';
// eslint-disable-next-line no-unused-vars -- used in JSX as <motion.div>
import { motion } from 'framer-motion';
import PartyBadge from './PartyBadge';
import CandidateAvatar from './CandidateAvatar';

// Ballot grid: one row per candidate — [party mark + name] [photo] [tick box].
const BallotGrid = ({ candidates, selectedId, onSelect, disabled = false }) => {
  return (
    <div className="ballot-grid" role="radiogroup" aria-label="Candidates">
      {candidates.map((candidate, index) => {
        const selected = selectedId === candidate.id;
        return (
          <motion.div
            key={candidate.id}
            className={`ballot-row ${selected ? 'is-selected' : ''}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index * 0.04, 0.3) }}
          >
            <div className="ballot-party">
              <PartyBadge
                party={candidate.party}
                code={candidate.party_code}
                logoUrl={candidate.party_logo}
                size={56}
              />
              <div className="ballot-party-text">
                <span className="ballot-party-name">{candidate.party || 'Independent'}</span>
                <span className="ballot-candidate-name">{candidate.name}</span>
              </div>
            </div>

            <div className="ballot-photo">
              <CandidateAvatar
                name={candidate.name}
                photoUrl={candidate.photo_url}
                className="ballot-photo-img"
                iconSize={22}
              />
            </div>

            <button
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`Vote for ${candidate.name}`}
              className={`ballot-tick ${selected ? 'is-checked' : ''}`}
              onClick={() => onSelect(candidate)}
              disabled={disabled}
            >
              {selected && <Check size={26} strokeWidth={3.5} />}
            </button>
          </motion.div>
        );
      })}
    </div>
  );
};

export default BallotGrid;
