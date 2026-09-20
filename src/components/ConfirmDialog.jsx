import React, { useEffect, useRef, useId } from 'react';
import { AlertTriangle } from 'lucide-react';
// eslint-disable-next-line no-unused-vars -- used in JSX as <motion.div>, <AnimatePresence>
import { motion, AnimatePresence } from 'framer-motion';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

const ConfirmDialog = ({ open, candidate, loading, onConfirm, onCancel }) => {
  const cardRef = useRef(null);
  const titleId = useId();

  // Keyboard path: Escape cancels; Tab cycles inside the dialog.
  // Focus lands on the dialog itself so screen readers announce the question.
  useEffect(() => {
    if (!open) return;
    const card = cardRef.current;
    card?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
        return;
      }
      if (e.key !== 'Tab' || !card) return;
      const items = Array.from(card.querySelectorAll(FOCUSABLE)).filter(
        (el) => !el.disabled && el.offsetParent !== null
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open || !candidate) return null;

  return (
    <AnimatePresence>
      <div className="modal-overlay" onClick={onCancel}>
        <motion.div
          ref={cardRef}
          className="modal-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.92, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 12 }}
          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: 'var(--sp-4)' }} aria-hidden="true">&#128499;&#65039;</div>
          <h2 id={titleId}>Confirm Your Vote</h2>
          <p>
            You are voting for <strong style={{ color: 'var(--emerald-700)' }}>{candidate.name}</strong> as{' '}
            <strong>{candidate.category}</strong>.
          </p>

          <div className="modal-warning">
            <p>
              <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />
              This action cannot be undone.
            </p>
          </div>

          <div className="flex-col" style={{ gap: 'var(--sp-3)' }}>
            <button
              className="btn btn-gold btn-block"
              onClick={onConfirm}
              disabled={loading}
            >
              {loading ? (
                <><span className="btn-spinner" /> Validating...</>
              ) : (
                'Confirm Vote'
              )}
            </button>
            <button
              className="btn btn-outline btn-block"
              onClick={onCancel}
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ConfirmDialog;
