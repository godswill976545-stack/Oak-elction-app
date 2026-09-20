import React from 'react';

// Circular party mark: real logo image when the party has one uploaded,
// otherwise the A/B letter badge. Null party renders a neutral Independent mark.
const PartyBadge = ({ party, code, logoUrl, size = 64, showName = false }) => {
  const letter = code || (party ? party.charAt(0).toUpperCase() : '?');
  const label = party || 'Independent';

  return (
    <span className="party-badge-wrap" style={{ width: size }}>
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={`${label} logo`}
          className="party-badge"
          style={{ width: size, height: size }}
          loading="lazy"
        />
      ) : (
        <span
          className={`party-badge party-badge-letter ${party ? '' : 'party-badge-none'}`}
          style={{ width: size, height: size, fontSize: size * 0.42 }}
          role="img"
          aria-label={`${label} badge`}
        >
          {letter}
        </span>
      )}
      {showName && <span className="party-badge-name">{label}</span>}
    </span>
  );
};

export default PartyBadge;
