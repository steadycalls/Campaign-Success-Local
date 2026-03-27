import { useState, useEffect, useCallback } from 'react';
import { X, RefreshCw } from 'lucide-react';
import type { NotificationEventUI } from '../../types';

interface Toast {
  id: string;
  event: NotificationEventUI;
  visible: boolean;
  persistent: boolean;  // sync failures persist until dismissed
  retrying: boolean;
}

let toastId = 0;

/** Check if a notification is a sync failure that should persist */
function isSyncFailure(event: NotificationEventUI): boolean {
  return event.type === 'sync_failed' || event.type === 'pit_expired'
    || (event.urgency === 'critical' && (event.title || '').toLowerCase().includes('sync'));
}

export default function NotificationToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const handler = (...args: unknown[]) => {
      const notification = args[1] as NotificationEventUI;
      if (!notification?.title) return;
      const id = String(++toastId);
      const persistent = isSyncFailure(notification);

      setToasts((prev) => {
        // Limit to 5 visible toasts
        const visible = prev.filter(t => t.visible);
        if (visible.length >= 5) return prev;
        return [...prev, { id, event: notification, visible: true, persistent, retrying: false }];
      });

      // Auto-dismiss non-persistent toasts
      if (!persistent) {
        const timeout = notification.urgency === 'critical' ? 15000 : 8000;
        setTimeout(() => {
          setToasts((prev) =>
            prev.map((t) => (t.id === id ? { ...t, visible: false } : t))
          );
          setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
          }, 300);
        }, timeout);
      }
    };

    window.api.onNotification(handler);
    return () => window.api.offNotification(handler);
  }, []);

  // Navigate events from desktop notification clicks
  useEffect(() => {
    const handler = (...args: unknown[]) => {
      const url = args[1] as string;
      if (url) window.location.hash = url;
    };
    window.api.onNotificationNavigate(handler);
    return () => window.api.offNotificationNavigate(handler);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, visible: false } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
  }, []);

  const dismissAll = useCallback(() => {
    setToasts((prev) => prev.map(t => ({ ...t, visible: false })));
    setTimeout(() => setToasts([]), 300);
  }, []);

  const handleRetry = useCallback(async (id: string, companyId?: string) => {
    if (!companyId) return;
    setToasts(prev => prev.map(t => t.id === id ? { ...t, retrying: true } : t));
    try {
      await window.api.queueSyncCompany(companyId);
      // Dismiss after successful queue
      setTimeout(() => dismiss(id), 1000);
    } catch {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, retrying: false } : t));
    }
  }, [dismiss]);

  const visibleToasts = toasts.filter(t => t.visible);
  if (visibleToasts.length === 0) return null;

  const persistentCount = visibleToasts.filter(t => t.persistent).length;

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
      {visibleToasts.slice(0, 3).map((toast) => (
        <ToastItem
          key={toast.id}
          event={toast.event}
          persistent={toast.persistent}
          retrying={toast.retrying}
          onDismiss={() => dismiss(toast.id)}
          onRetry={() => handleRetry(toast.id, toast.event.companyId)}
          onAction={() => {
            if (toast.event.actionUrl) window.location.hash = toast.event.actionUrl;
          }}
        />
      ))}
      {visibleToasts.length > 3 && (
        <div className="text-xs text-slate-500 dark:text-slate-400 text-right pr-1">
          +{visibleToasts.length - 3} more
        </div>
      )}
      {persistentCount > 1 && (
        <button onClick={dismissAll}
          className="w-full text-center text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 py-1">
          Dismiss all
        </button>
      )}
    </div>
  );
}

function ToastItem({
  event, persistent, retrying, onDismiss, onRetry, onAction,
}: {
  event: NotificationEventUI;
  persistent: boolean;
  retrying: boolean;
  onDismiss: () => void;
  onRetry: () => void;
  onAction: () => void;
}) {
  const bgColor =
    event.urgency === 'critical'
      ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
      : event.urgency === 'warning'
        ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
        : 'bg-teal-50 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800';

  const icon =
    event.urgency === 'critical'
      ? '\u{1F534}'
      : event.urgency === 'warning'
        ? '\u{1F7E1}'
        : '\u2139\uFE0F';

  return (
    <div className={`${bgColor} border rounded-lg shadow-lg p-3 transition-all`}>
      <div className="flex items-start gap-2">
        <span className="text-lg flex-shrink-0">{icon}</span>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onAction}>
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{event.title}</div>
          <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2">{event.body}</div>
          {event.companyName && (
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{event.companyName}</div>
          )}
        </div>
        <button onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 flex-shrink-0">
          <X size={14} />
        </button>
      </div>
      {/* Retry button for persistent sync failures */}
      {persistent && event.companyId && (
        <div className="mt-2 flex items-center gap-2 pl-7">
          <button onClick={onRetry} disabled={retrying}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50">
            <RefreshCw size={11} className={retrying ? 'animate-spin' : ''} />
            {retrying ? 'Retrying...' : 'Retry Sync'}
          </button>
          <button onClick={onDismiss}
            className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300">
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
