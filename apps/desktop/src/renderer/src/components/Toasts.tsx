import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

export interface Toast {
  id: number;
  tone: 'info' | 'warn';
  title: string;
  body: string;
  action?: { label: string; run: () => void };
  /** powiadomienia z tą samą grupą łączą się w jedno (np. kilka replayów naraz) */
  group?: string;
  count?: number;
  createdAt?: number;
}

const LIFETIME_MS = 9000;

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const { t } = useTranslation();
  // licznik startuje raz – nowe renderowanie okna nie przedłuża życia powiadomienia
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const timer = setTimeout(() => close.current(), LIFETIME_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className={`toast ${toast.tone}`} role="status">
      <div className="toast-text">
        <div className="toast-title">{toast.title}</div>
        <div className="toast-body">{toast.body}</div>
      </div>
      <div className="toast-actions">
        {toast.action && (
          <button
            type="button"
            className="btn small primary"
            onClick={() => {
              toast.action!.run();
              onClose();
            }}
          >
            {toast.action.label}
          </button>
        )}
        <button type="button" className="icon-btn" aria-label={t('toast.close')} onClick={onClose}>
          ×
        </button>
      </div>
    </div>
  );
}

export default function Toasts({ toasts, onClose }: { toasts: Toast[]; onClose: (id: number) => void }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={() => onClose(toast.id)} />
      ))}
    </div>
  );
}
