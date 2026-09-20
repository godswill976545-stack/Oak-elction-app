import React, { useState } from 'react';
import { User } from 'lucide-react';

// Renders a candidate's photo with a graceful fallback to their initials
// (or a generic user icon when no name is available) if the URL is missing
// or fails to load. Prevents broken image icons and keeps the grid tidy.
const CandidateAvatar = ({ name = '', photoUrl, className = '', iconSize = 32 }) => {
  const [errored, setErrored] = useState(false);

  const initials = (name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('') || '?';

  const showImage = photoUrl && !errored;

  if (showImage) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className={className}
        loading="lazy"
        onError={() => setErrored(true)}
      />
    );
  }

  return (
    <div
      className={`${className} candidate-avatar-fallback`}
      role="img"
      aria-label={name ? `${name} (photo unavailable)` : 'Candidate photo unavailable'}
    >
      {initials === '?' ? <User size={iconSize} /> : <span>{initials}</span>}
    </div>
  );
};

export default CandidateAvatar;
