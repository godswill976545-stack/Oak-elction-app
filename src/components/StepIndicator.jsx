import React from 'react';
import { Check } from 'lucide-react';

const StepIndicator = ({ total, current }) => (
  <div className="steps" role="progressbar" aria-valuenow={current + 1} aria-valuemin={1} aria-valuemax={total}>
    {Array.from({ length: total }, (_, i) => (
      <div
        key={i}
        className={`step-dot ${
          i < current ? 'step-dot-done' : i === current ? 'step-dot-active' : 'step-dot-pending'
        }`}
      />
    ))}
  </div>
);

export default StepIndicator;
