/**
 * IndexedDB & LocalStorage Persistent Session Store for Nerve P2P Engine
 * Caches encrypted/decrypted session logs, chat history, file transfer manifests,
 * and terminal stream logs so state survives page refreshes and offline disconnects.
 */

export interface StoredFileTransferManifest {
  transferId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  totalChunks: number;
  receivedChunks: number;
  senderHandle: string;
  timestamp: string;
  direction: 'inbound' | 'outbound';
  status: 'streaming' | 'completed' | 'error';
  downloadUrl?: string;
  sha256Fingerprint?: string;
  throughputKbps?: number;
}

export interface StoredTerminalStreamLog {
  id: string;
  senderHandle: string;
  line: string;
  level: 'stdout' | 'stderr' | 'system';
  timestamp: string;
  encrypted: boolean;
}

const DB_NAME = 'nerve_p2p_indexeddb_v1';
const DB_VERSION = 1;
const STORE_MANIFESTS = 'transfer_manifests';
const STORE_STREAM_LOGS = 'terminal_stream_logs';
const STORE_KV = 'session_kv';

function openP2PDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_MANIFESTS)) {
          db.createObjectStore(STORE_MANIFESTS, { keyPath: 'transferId' });
        }
        if (!db.objectStoreNames.contains(STORE_STREAM_LOGS)) {
          db.createObjectStore(STORE_STREAM_LOGS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_KV)) {
          db.createObjectStore(STORE_KV, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveTransferManifestsToIdb(
  manifests: StoredFileTransferManifest[]
): Promise<void> {
  try {
    localStorage.setItem(
      'nerve_p2p_manifests_v1',
      JSON.stringify(manifests.map(({ downloadUrl, ...rest }) => rest))
    );
  } catch {
    // Fallback to IDB
  }

  const db = await openP2PDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_MANIFESTS, 'readwrite');
      const store = tx.objectStore(STORE_MANIFESTS);
      for (const m of manifests) {
        const { downloadUrl, ...serializable } = m;
        store.put(serializable);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function loadTransferManifestsFromIdb(): Promise<StoredFileTransferManifest[]> {
  const db = await openP2PDatabase();
  if (db) {
    try {
      const items = await new Promise<StoredFileTransferManifest[]>((resolve) => {
        const tx = db.transaction(STORE_MANIFESTS, 'readonly');
        const store = tx.objectStore(STORE_MANIFESTS);
        const req = store.getAll();
        req.onsuccess = () => resolve((req.result as StoredFileTransferManifest[]) || []);
        req.onerror = () => resolve([]);
      });
      if (items.length > 0) return items;
    } catch {
      // Fallback to localStorage
    }
  }

  try {
    const raw = localStorage.getItem('nerve_p2p_manifests_v1');
    return raw ? (JSON.parse(raw) as StoredFileTransferManifest[]) : [];
  } catch {
    return [];
  }
}

export async function saveStreamLogsToIdb(logs: StoredTerminalStreamLog[]): Promise<void> {
  const trimmed = logs.slice(-250);
  try {
    localStorage.setItem('nerve_p2p_stream_logs_v1', JSON.stringify(trimmed));
  } catch {
    // Ignore quota errors
  }

  const db = await openP2PDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_KV, 'readwrite');
      const store = tx.objectStore(STORE_KV);
      store.put({ key: 'stream_logs', value: trimmed });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function loadStreamLogsFromIdb(): Promise<StoredTerminalStreamLog[]> {
  const db = await openP2PDatabase();
  if (db) {
    try {
      const result = await new Promise<StoredTerminalStreamLog[] | null>((resolve) => {
        const tx = db.transaction(STORE_KV, 'readonly');
        const store = tx.objectStore(STORE_KV);
        const req = store.get('stream_logs');
        req.onsuccess = () => resolve(req.result?.value || null);
        req.onerror = () => resolve(null);
      });
      if (result && Array.isArray(result)) return result;
    } catch {
      // Fallback
    }
  }

  try {
    const raw = localStorage.getItem('nerve_p2p_stream_logs_v1');
    return raw ? (JSON.parse(raw) as StoredTerminalStreamLog[]) : [];
  } catch {
    return [];
  }
}
