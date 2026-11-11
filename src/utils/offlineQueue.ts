import { ChatMessage } from '../data/mockWorkspaceData';
import { IncidentWorkflowReport } from '../data/incidentReports';

export interface QueuedOfflineAction {
  id: string;
  type: 'message' | 'bug_dispatch' | 'ssh_sync' | 'peer_sync';
  createdAt: string;
  peerHandle?: string;
  messagePayload?: ChatMessage;
  bugPayload?: {
    reporterHandle: string;
    targetRepo: string;
    branch: string;
    filePath: string;
    lineNumber: number;
    summary: string;
    stackTrace: string;
    reportObject: IncidentWorkflowReport;
    chatMessage: ChatMessage;
    peerHandle: string;
  };
  metadata?: Record<string, any>;
}

const STORAGE_KEY = 'nerve_offline_sync_queue_v1';
const QUEUE_CHANGE_EVENT = 'nerve_offline_queue_updated';

// Custom event for cross-component and same-tab reactive queue tracking
export function notifyQueueChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(QUEUE_CHANGE_EVENT, { detail: getOfflineQueue() }));
  }
}

export function subscribeToQueueChanges(callback: (queue: QueuedOfflineAction[]) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleCustom = (e: Event) => {
    const custom = e as CustomEvent<QueuedOfflineAction[]>;
    callback(custom.detail || getOfflineQueue());
  };

  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      callback(getOfflineQueue());
    }
  };

  window.addEventListener(QUEUE_CHANGE_EVENT, handleCustom);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(QUEUE_CHANGE_EVENT, handleCustom);
    window.removeEventListener('storage', handleStorage);
  };
}

export function getOfflineQueue(): QueuedOfflineAction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function enqueueOfflineAction(action: QueuedOfflineAction): QueuedOfflineAction[] {
  const current = getOfflineQueue();
  const next = [...current, action];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (err) {
    console.error('Failed to write offline queue to localStorage:', err);
  }
  notifyQueueChanged();
  triggerBackgroundSyncRegistration();
  return next;
}

export function clearOfflineQueue(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear offline queue:', err);
  }
  notifyQueueChanged();
}

/**
 * Register Service Worker if supported by the browser
 */
export async function registerNerveServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
    return registration;
  } catch (err) {
    // In restricted sandbox or if sw.js is blocked, fallback silently
    console.warn('[Nerve SW] Service Worker registration skipped/failed:', err);
    return null;
  }
}

/**
 * Request Background Sync registration via ServiceWorker SyncManager
 */
export async function triggerBackgroundSyncRegistration(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    if ('sync' in registration) {
      await (registration as any).sync.register('nerve-flush-offline-queue');
    }
  } catch {
    // Non-fatal if Background Sync API is unsupported (e.g. Safari / Firefox)
  }
}

export interface FlushResult {
  flushedCount: number;
  items: QueuedOfflineAction[];
  serverProcessed: boolean;
  timestamp: string;
}

/**
 * Dispatches the offline queue to the backend or applies local reconciliation
 */
export async function flushOfflineQueueToBackend(
  apiKey: string,
  onApplyItem?: (item: QueuedOfflineAction) => void
): Promise<FlushResult> {
  const queued = getOfflineQueue();
  if (queued.length === 0) {
    return {
      flushedCount: 0,
      items: [],
      serverProcessed: false,
      timestamp: new Date().toISOString(),
    };
  }

  let serverProcessed = false;

  // Try bulk flush API endpoint
  try {
    const res = await fetch('/api/v1/offline/flush', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ queue: queued }),
    });

    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      serverProcessed = !!data.success;
    }
  } catch {
    serverProcessed = false;
  }

  // Apply items to local state (for instant client-side responsiveness, especially on Vercel)
  for (const item of queued) {
    if (onApplyItem) {
      try {
        onApplyItem(item);
      } catch (err) {
        console.warn('Error applying queued item to local state:', err);
      }
    }
  }

  clearOfflineQueue();

  return {
    flushedCount: queued.length,
    items: queued,
    serverProcessed,
    timestamp: new Date().toISOString(),
  };
}
