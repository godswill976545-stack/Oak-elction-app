import React from 'react';

const StepIndicator = ({ total, current }) => {
  // `current` may equal `total` when all steps are done. Clamp so the
  // progressbar's aria values never exceed aria-valuemax.
  const safeCurrent = Math.min(Math.max(current, 0), total);
  const isComplete = safeCurrent >= total;

  return (
    <div
      className="steps"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={isComplete ? total : safeCurrent + 1}
      aria-valuetext={isComplete ? `All ${total} steps complete` : `Step ${safeCurrent + 1} of ${total}`}
    >
      {Array.from({ length: total }, (_, i) => {
        const isDone = i < safeCurrent;
        const isActive = !isComplete && i === safeCurrent;
        return (
          <div
            key={i}
            className={`step-dot ${
              isDone ? 'step-dot-done' : isActive ? 'step-dot-active' : 'step-dot-pending'
            }`}
            aria-hidden="true"
          />
        );
      })}
    </div>
  );
};

export default StepIndicator;
