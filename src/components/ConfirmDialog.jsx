import React from 'react';
import { AlertTriangle } from 'lucide-react';
// eslint-disable-next-line no-unused-vars -- used in JSX as <motion.div>, <AnimatePresence>
import { motion, AnimatePresence } from 'framer-motion';

const ConfirmDialog = ({ open, candidate, loading, onConfirm, onCancel }) => {
  if (!open || !candidate) return null;

  return (
    <AnimatePresence>
      <div className="modal-overlay" onClick={onCancel}>
        <motion.div
          className="modal-card"
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.92, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 12 }}
          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: 'var(--sp-4)' }}>&#128499;&#65039;</div>
          <h2>Confirm Your Vote</h2>
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
                'Confirm & Sign'
              )}
            </button>
            <button
              className="btn btn-outline btn-block"
              onClick={onCancel}
              disabled={loading}
            >
              Go Back
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ConfirmDialog;
