'use client';

import { useEffect } from 'react';

export type AlertVariant = 'error' | 'success' | 'info' | 'warning';

interface AlertProps {
  /** The alert message to display */
  message: string;
  /** Alert variant determines styling */
  variant: AlertVariant;
  /** Callback when alert is dismissed */
  onDismiss?: () => void;
  /** Auto-dismiss after milliseconds (0 = no auto-dismiss) */
  autoDismiss?: number;
  /** Additional CSS class */
  className?: string;
}

/**
 * Reusable alert component for error, success, info, and warning messages.
 * Uses existing global CSS classes (alert, alert-error, alert-success, alert-info).
 *
 * @example
 * ```tsx
 * {error && <Alert message={error} variant="error" onDismiss={clearError} />}
 * {successMessage && <Alert message={successMessage} variant="success" onDismiss={clearSuccess} autoDismiss={3000} />}
 * ```
 */
export function Alert({
  message,
  variant,
  onDismiss,
  autoDismiss = 0,
  className = '',
}: AlertProps) {
  useEffect(() => {
    if (autoDismiss > 0 && onDismiss) {
      const timer = setTimeout(onDismiss, autoDismiss);
      return () => clearTimeout(timer);
    }
  }, [autoDismiss, onDismiss, message]);

  if (!message) return null;

  const variantClass = `alert-${variant}`;

  return (
    <div
      className={`alert ${variantClass} ${className}`}
      role={variant === 'error' ? 'alert' : 'status'}
      onClick={onDismiss}
      style={{ cursor: onDismiss ? 'pointer' : 'default' }}
    >
      <span>{message}</span>
      {onDismiss && (
        <button
          type="button"
          className="alert-close"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          aria-label="Dismiss"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '0.25rem 0.5rem',
            marginLeft: '0.5rem',
            opacity: 0.7,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

/**
 * Convenience wrapper for displaying error and success alerts together.
 *
 * @example
 * ```tsx
 * <PageAlerts
 *   error={error}
 *   success={successMessage}
 *   onDismissError={clearError}
 *   onDismissSuccess={clearSuccess}
 * />
 * ```
 */
export function PageAlerts({
  error,
  success,
  info,
  onDismissError,
  onDismissSuccess,
  onDismissInfo,
  successAutoDismiss = 3000,
}: {
  error?: string;
  success?: string;
  info?: string;
  onDismissError?: () => void;
  onDismissSuccess?: () => void;
  onDismissInfo?: () => void;
  successAutoDismiss?: number;
}) {
  return (
    <>
      {error && (
        <Alert message={error} variant="error" onDismiss={onDismissError} />
      )}
      {success && (
        <Alert
          message={success}
          variant="success"
          onDismiss={onDismissSuccess}
          autoDismiss={successAutoDismiss}
        />
      )}
      {info && (
        <Alert message={info} variant="info" onDismiss={onDismissInfo} />
      )}
    </>
  );
}
