import React, { useEffect } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';

const Toast = ({ message, type = 'success', onDismiss, duration = 3000 }) => {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => onDismiss?.(), duration);
    return () => clearTimeout(timer);
  }, [message, duration, onDismiss]);

  if (!message) return null;

  const Icon = type === 'error' ? XCircle : CheckCircle;

  return (
    <div className="toast-container">
      <div className={`toast toast-${type}`}>
        <Icon size={18} />
        <span>{message}</span>
      </div>
    </div>
  );
};

export default Toast;
