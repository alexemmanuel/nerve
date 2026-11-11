import { ChatMessage } from '../data/mockWorkspaceData';
import { IncidentWorkflowReport } from '../data/incidentReports';

export interface QueuedOfflineAction {
  id: string;
  type: 'message' | 'bug_dispatch';
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
}

const STORAGE_KEY = 'nerve_offline_sync_queue_v1';

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
  return next;
}

export function clearOfflineQueue(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear offline queue:', err);
  }
}
