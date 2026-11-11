import { useState, useEffect } from 'react';
import {
  encodeEnvSecret,
  decodeEnvSecret,
  hydratePersistedApiKeys,
  setPersistedApiKey,
  DEFAULT_LIVE_API_KEY,
  DEFAULT_TEST_API_KEY,
} from '../utils/securityEncoding';

const WORKSPACE_STORAGE_KEY = 'nerve_workspace_context_v2';

export interface PersistedWorkspaceState {
  activeRepoKey: string;
  activeFilePath: string;
  highlightedLine: number;
  terminalLogs: string[];
  terminalCommandHistory: string[];
  patchApplied: boolean;
  keyEnvironment: 'live' | 'test';
  liveApiKey: string;
  testApiKey: string;
}

const DEFAULT_WORKSPACE_STATE: PersistedWorkspaceState = {
  activeRepoKey: '',
  activeFilePath: '',
  highlightedLine: 1,
  terminalLogs: [],
  terminalCommandHistory: [
    'npm run build && npm test',
    'npm run build',
    'npm test',
    'git status',
    'gh pr create --fill',
    'clr terminal',
  ],
  patchApplied: false,
  keyEnvironment: 'live',
  liveApiKey: DEFAULT_LIVE_API_KEY,
  testApiKey: DEFAULT_TEST_API_KEY,
};

function stripInstructionalLogs(logs: unknown): string[] {
  if (!Array.isArray(logs)) return [];
  return logs.filter(
    (entry): entry is string =>
      typeof entry === 'string' &&
      !entry.includes('Nerve Codespace Terminal Ready') &&
      !entry.includes('Session Ready]') &&
      !entry.includes('Runner Ready]') &&
      !entry.includes('Stream Ready]') &&
      !entry.includes('Full Codespace session initialized')
  );
}

export function useWorkspacePersistence() {
  const [persisted, setPersisted] = useState<PersistedWorkspaceState>(() => {
    const hydratedApiKeys = hydratePersistedApiKeys();
    try {
      const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
      if (!raw) {
        return {
          ...DEFAULT_WORKSPACE_STATE,
          liveApiKey: hydratedApiKeys.liveApiKey || DEFAULT_LIVE_API_KEY,
          testApiKey: hydratedApiKeys.testApiKey || DEFAULT_TEST_API_KEY,
        };
      }
      const parsed = JSON.parse(raw);
      return {
        activeRepoKey:
          typeof parsed.activeRepoKey === 'string'
            ? parsed.activeRepoKey
            : DEFAULT_WORKSPACE_STATE.activeRepoKey,
        activeFilePath:
          typeof parsed.activeFilePath === 'string'
            ? parsed.activeFilePath
            : DEFAULT_WORKSPACE_STATE.activeFilePath,
        highlightedLine:
          typeof parsed.highlightedLine === 'number'
            ? parsed.highlightedLine
            : DEFAULT_WORKSPACE_STATE.highlightedLine,
        terminalLogs: stripInstructionalLogs(parsed.terminalLogs),
        terminalCommandHistory:
          Array.isArray(parsed.terminalCommandHistory) && parsed.terminalCommandHistory.length > 0
            ? parsed.terminalCommandHistory
            : DEFAULT_WORKSPACE_STATE.terminalCommandHistory,
        patchApplied:
          typeof parsed.patchApplied === 'boolean'
            ? parsed.patchApplied
            : DEFAULT_WORKSPACE_STATE.patchApplied,
        keyEnvironment: parsed.keyEnvironment === 'test' ? 'test' : 'live',
        liveApiKey:
          typeof parsed.liveApiKey === 'string' && parsed.liveApiKey.trim()
            ? decodeEnvSecret(parsed.liveApiKey)
            : hydratedApiKeys.liveApiKey || DEFAULT_LIVE_API_KEY,
        testApiKey:
          typeof parsed.testApiKey === 'string' && parsed.testApiKey.trim()
            ? decodeEnvSecret(parsed.testApiKey)
            : hydratedApiKeys.testApiKey || DEFAULT_TEST_API_KEY,
      };
    } catch {
      return {
        ...DEFAULT_WORKSPACE_STATE,
        liveApiKey: hydratedApiKeys.liveApiKey || DEFAULT_LIVE_API_KEY,
        testApiKey: hydratedApiKeys.testApiKey || DEFAULT_TEST_API_KEY,
      };
    }
  });

  useEffect(() => {
    try {
      const securePayload = {
        ...persisted,
        liveApiKey: encodeEnvSecret(persisted.liveApiKey),
        testApiKey: encodeEnvSecret(persisted.testApiKey),
      };
      localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(securePayload));
      // Persist to individual environment-encoded slots as well for instant boot hydration
      setPersistedApiKey('live', persisted.liveApiKey);
      setPersistedApiKey('test', persisted.testApiKey);
    } catch (err) {
      console.error('Failed to save workspace context to localStorage:', err);
    }
  }, [persisted]);

  const setActiveRepoKey = (val: string | ((prev: string) => string)) => {
    setPersisted((prev) => ({
      ...prev,
      activeRepoKey: typeof val === 'function' ? val(prev.activeRepoKey) : val,
    }));
  };

  const setActiveFilePath = (val: string | ((prev: string) => string)) => {
    setPersisted((prev) => ({
      ...prev,
      activeFilePath: typeof val === 'function' ? val(prev.activeFilePath) : val,
    }));
  };

  const setHighlightedLine = (val: number | ((prev: number) => number)) => {
    setPersisted((prev) => ({
      ...prev,
      highlightedLine: typeof val === 'function' ? val(prev.highlightedLine) : val,
    }));
  };

  const setTerminalLogs = (val: string[] | ((prev: string[]) => string[])) => {
    setPersisted((prev) => ({
      ...prev,
      terminalLogs: typeof val === 'function' ? val(prev.terminalLogs) : val,
    }));
  };

  const setTerminalCommandHistory = (val: string[] | ((prev: string[]) => string[])) => {
    setPersisted((prev) => ({
      ...prev,
      terminalCommandHistory:
        typeof val === 'function' ? val(prev.terminalCommandHistory) : val,
    }));
  };

  const setPatchApplied = (val: boolean | ((prev: boolean) => boolean)) => {
    setPersisted((prev) => ({
      ...prev,
      patchApplied: typeof val === 'function' ? val(prev.patchApplied) : val,
    }));
  };

  const setKeyEnvironment = (env: 'live' | 'test') => {
    setPersisted((prev) => ({
      ...prev,
      keyEnvironment: env,
    }));
  };

  const setLiveApiKey = (key: string) => {
    setPersisted((prev) => ({
      ...prev,
      liveApiKey: key,
    }));
  };

  const setTestApiKey = (key: string) => {
    setPersisted((prev) => ({
      ...prev,
      testApiKey: key,
    }));
  };

  return {
    activeRepoKey: persisted.activeRepoKey,
    setActiveRepoKey,
    activeFilePath: persisted.activeFilePath,
    setActiveFilePath,
    highlightedLine: persisted.highlightedLine,
    setHighlightedLine,
    terminalLogs: persisted.terminalLogs,
    setTerminalLogs,
    terminalCommandHistory: persisted.terminalCommandHistory,
    setTerminalCommandHistory,
    patchApplied: persisted.patchApplied,
    setPatchApplied,
    keyEnvironment: persisted.keyEnvironment,
    setKeyEnvironment,
    liveApiKey: persisted.liveApiKey,
    setLiveApiKey,
    testApiKey: persisted.testApiKey,
    setTestApiKey,
  };
}
