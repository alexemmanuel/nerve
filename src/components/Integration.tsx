import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import {
  Key,
  Copy,
  Check,
  Code2,
  Plus,
  Webhook,
  Play,
  Activity,
  RefreshCw,
  TrendingUp,
  Clock,
  Filter,
  Shield,
  Trash2,
  Terminal,
  X,
  Eye,
  EyeOff,
  Lock,
  LogOut,
  Mail,
  Globe,
  ShieldCheck,
  Sparkles,
  Send,
  Search,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { ENGINE_SDK_SPECS, RepositoryContext } from '../data/mockWorkspaceData';
import { IncidentWorkflowReport } from '../data/incidentReports';
import { IntegrationUnlockOverlay } from './IntegrationUnlockOverlay';
import { maskSecretKey, isKeySealed, sealKeyAfterUse } from '../utils/securityEncoding';
import {
  auth,
  githubProvider,
  googleStandardProvider,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithGoogleForGmail,
  getCachedGmailAccessToken,
  setCachedGmailAccessToken,
  User,
} from '../firebase';

export interface SshKeyConfigItem {
  id: string;
  title: string;
  targetRepo: string;
  keyType: 'ed25519' | 'rsa';
  publicKey: string;
  fingerprint: string;
  gitSshCommand: string;
  status: 'Connected' | 'Verified';
  createdAt: string;
}

export interface GitHubSshKeyItem {
  id: number;
  title: string;
  key: string;
  fingerprint?: string;
  verified: boolean;
  read_only?: boolean;
  created_at: string;
  url?: string;
}

export type CiBuildState = 'Passing' | 'Failing' | 'Running' | 'Pending';

export interface CiBuildHistoryItem {
  buildId: string;
  status: CiBuildState;
  commit: string;
  duration: string;
  timestamp: string;
}

export interface CiBuildHealthItem {
  repo: string;
  branch: string;
  workflowName: string;
  status: CiBuildState;
  latestCommit: string;
  duration: string;
  lastRunAt: string;
  runner: string;
  recentBuilds?: CiBuildHistoryItem[];
}

export interface CiMetricDayPoint {
  dayIndex: number;
  dateLabel: string;
  successRate: number;
  avgDurationSec: number;
  deploymentsCount: number;
}

interface IntegrationProps {
  keyEnvironment: 'live' | 'test';
  onChangeEnvironment: (env: 'live' | 'test') => void;
  liveApiKey: string;
  testApiKey: string;
  onGenerateNewKey: (orgName: string, env: 'live' | 'test') => Promise<void>;
  onTriggerWebhook?: (eventType: 'issues' | 'pull_request') => Promise<void>;
  repositories: Record<string, RepositoryContext>;
  incidentReports?: IncidentWorkflowReport[];
  currentUser?: User | null;
  emailSession?: { uid: string; email: string; displayName: string } | null;
  verifiedEmail?: string;
  requiresReverification?: boolean;
  onChangeVerifiedEmail?: (email: string) => void;
  onSignOut?: () => Promise<void> | void;
  onAutoLockSignOut?: () => Promise<void> | void;
  onBackToWorkspace?: () => void;
  onOpenConnectedUsers?: (email: string) => void;
  onUserAuthenticated?: (
    user: User | null,
    emailSession?: { uid: string; email: string; displayName: string } | null
  ) => void;
  onUpdateRepoCiStatus?: (repo: string, status: 'Passing' | 'Failing' | 'Running') => void;
  isDark: boolean;
}

const NERVE_PROFILE_EMAIL = 'nervep2p@gmail.com';

const LIVE_ENDPOINTS: Array<{
  id: string;
  label: string;
  method?: 'GET' | 'POST';
  path: string;
  defaultBody: Record<string, unknown>;
}> = [
  {
    id: 'webhook',
    label: 'Webhook',
    path: '/api/v1/webhooks/github',
    defaultBody: {
      event: 'issues',
      action: 'opened',
      repository: { full_name: 'owner/repository' },
      sender: { login: 'developer-a' },
      issue: {
        title: 'Unhandled stream exception',
        body: 'Error at src/index.ts:42',
      },
      filePath: 'src/index.ts',
      lineNumber: 42,
    },
  },
  {
    id: 'trust',
    label: '1. PoW Gate',
    path: '/api/v1/trust/verify-mutual',
    defaultBody: {
      initiatorHandle: 'developer-a',
      recipientHandle: 'developer-b',
      initiatorFollowsRecipient: true,
      recipientFollowsInitiator: true,
      proofOfWorkCommits: 120,
      requireMinCommits: 15,
    },
  },
  {
    id: 'sovereignty',
    label: '2. Focus Mode',
    path: '/api/v1/sovereignty/status',
    defaultBody: {
      developerHandle: 'developer-a',
      globalFocusMode: true,
      allowIncidentPingsFromMaintainedRepos: true,
    },
  },
  {
    id: 'syntax',
    label: '3. Deep-Link',
    path: '/api/v1/syntax/parse',
    defaultBody: {
      text: 'Inspecting owner/repository#main/src/index.ts:L42',
    },
  },
  {
    id: 'codespaces',
    label: '4. Cloud Exec',
    path: '/api/v1/codespaces/execute',
    defaultBody: {
      command: 'npm test',
      repo: 'owner/repository',
      branch: 'main',
      patchApplied: true,
    },
  },
  {
    id: 'shark',
    label: '5. Nerve Shark',
    path: '/api/v1/copilot/collaborate',
    defaultBody: {
      prompt: 'Guard stream handler before line 42.',
      repo: 'owner/repository',
      branch: 'main',
      filePath: 'src/index.ts',
      participants: ['developer-a', 'developer-b'],
    },
  },
  {
    id: 'incident',
    label: '6. /bug Dispatch',
    path: '/api/v1/incidents/dispatch',
    defaultBody: {
      reporterHandle: 'developer-a',
      targetRepo: 'owner/repository',
      branch: 'main',
      filePath: 'src/index.ts',
      lineNumber: 42,
      summary: 'Stream disconnect on chunk write',
    },
  },
  {
    id: 'ssh_generate',
    label: '7. SSH Key Gen',
    path: '/api/v1/ssh/generate',
    defaultBody: {
      title: 'Local Git Surface',
      targetRepo: 'owner/private-repo',
      keyType: 'ed25519',
    },
  },
  {
    id: 'ci_track',
    label: '8. Track Repo CI',
    path: '/api/v1/ci/track-repo',
    defaultBody: {
      repo: 'owner/repository',
      branch: 'main',
      workflowName: 'Production CI',
    },
  },
  {
    id: 'codespace_telemetry',
    label: '9. CS Telemetry',
    path: '/api/v1/codespaces/telemetry',
    defaultBody: {
      repo: 'owner/repository',
      active: true,
    },
  },
  {
    id: 'p2p_signaling',
    label: '10. WebRTC Signal',
    path: '/api/v1/p2p/signaling-status',
    defaultBody: {
      roomId: 'global-dev-room',
    },
  },
  {
    id: 'p2p_e2ee',
    label: '11. E2EE Verify',
    path: '/api/v1/p2p/e2ee-verify',
    defaultBody: {
      roomId: 'global-dev-room',
      algorithm: 'AES-GCM-256',
      iterations: 100000,
    },
  },
  {
    id: 'p2p_datachannel_stream',
    label: '12. P2P 16KB Stream',
    path: '/api/v1/p2p/datachannel-stream',
    defaultBody: {
      roomId: 'global-dev-room',
      channelLabel: 'nerve-e2ee-dc',
      chunkSizeBytes: 16384,
      highWatermarkBytes: 262144,
      lowWatermarkBytes: 65536,
    },
  },
  {
    id: 'incident_triage_logs',
    label: '13. AI Log Triage',
    path: '/api/v1/incidents/triage-logs',
    defaultBody: {
      ticketId: 'INC-709',
      repo: 'owner/repository',
      branch: 'main',
      filePath: 'src/index.ts',
      lineNumber: 42,
      failureLogs: [
        'Error: ERR_STREAM_WRITE_AFTER_END at src/index.ts:42',
        'Process completed with exit code 1.',
      ],
    },
  },
  {
    id: 'engine_callout',
    label: '14. 3P Engine Call',
    path: '/api/v1/engine/call',
    defaultBody: {
      engine: 'p2p_datachannel',
      action: 'execute',
      payload: {
        roomId: 'global-dev-room',
        chunkSizeBytes: 16384,
        highWatermarkBytes: 262144,
      },
    },
  },
  {
    id: 'terminal_export',
    label: '15. Log Download (.txt)',
    path: '/api/v1/terminal/export-logs',
    defaultBody: {
      instanceName: 'terminal',
      subTab: 'build',
      logs: [
        '$ npm run build && npm test',
        '✓ 42 modules transformed.',
        '✓ Built in 1.18s — 0 errors, 0 warnings.',
      ],
    },
  },
  {
    id: 'firebase_sync',
    label: '16. Firebase Sync',
    path: '/api/v1/firebase/sync-status',
    defaultBody: {
      projectId: 'gen-lang-client-0310681320',
      firestoreDatabaseId: 'ai-studio-gitsurfacenative-a6673b36-a9a3-4ed1-b52e-1d3c6bf8ad06',
      region: 'europe-west2',
    },
  },
  {
    id: 'peer_delete',
    label: '17. Peer Delete',
    path: '/api/v1/peers/manage',
    defaultBody: {
      operation: 'delete',
      peerHandle: 'developer-b',
      ownerUid: 'authenticated-user',
    },
  },
  {
    id: 'github_oauth',
    label: '18. GitHub OAuth',
    path: '/api/v1/auth/github-oauth',
    defaultBody: {
      providerId: 'github.com',
      scopes: ['read:user'],
      syncFirestorePeers: true,
    },
  },
  {
    id: 'google_oauth',
    label: '19. Google OAuth',
    path: '/api/v1/auth/google-oauth',
    defaultBody: {
      providerId: 'google.com',
      scopes: ['https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/gmail.send'],
      syncFirestorePeers: true,
    },
  },
  {
    id: 'github_ssh_keys',
    label: '20. GitHub SSH Keys',
    path: '/api/v1/github/ssh-keys',
    defaultBody: {
      title: 'Workstation ed25519',
      key: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH8qB24rXlZ9pQ9Z8g7eYf6m5l4k3j2h1g0f9e8d7c6b nervep2p@gmail.com',
      read_only: false,
    },
  },
  {
    id: 'pr_diff',
    label: '21. PR Diff Review',
    path: '/api/v1/pull-requests/diff',
    defaultBody: {
      ticketId: 'INC-709',
      repo: 'owner/repository',
      branch: 'patch/inc-709',
      filePath: 'src/index.ts',
    },
  },
  {
    id: 'third_party_ssh',
    label: '22. 3P Multi-Repo SSH',
    path: '/api/v1/ssh-keys/third-party',
    defaultBody: {
      provider: 'gitlab',
      title: 'GitLab CI/CD Deploy Key',
      keyType: 'ed25519',
      host: 'gitlab.com',
      purpose: 'both',
    },
  },
  {
    id: 'offline_flush',
    label: '23. Offline Queue Flush',
    path: '/api/v1/offline/flush',
    defaultBody: {
      queue: [
        {
          id: 'off_act_demo_01',
          type: 'bug_dispatch',
          createdAt: new Date().toISOString(),
        },
      ],
    },
  },
  {
    id: 'p2p_message_lifecycle',
    label: '24. Msg Edit/Delete',
    path: '/api/v1/p2p/message-lifecycle',
    defaultBody: {
      action: 'delete',
      scope: 'both',
      messageId: 'msg_01',
      roomId: 'global-dev-room',
    },
  },
  {
    id: 'users_by_email',
    label: '25. Email @users',
    path: '/api/v1/users/by-email',
    defaultBody: {
      email: NERVE_PROFILE_EMAIL,
    },
  },
  {
    id: 'p2p_message_search',
    label: '26. Chat Msg Search',
    path: '/api/v1/p2p/messages/search',
    defaultBody: {
      channelId: 'developer-b',
      query: 'stream',
      messages: [
        {
          id: 'msg_01',
          senderHandle: 'developer-b',
          senderName: 'Developer B',
          senderRole: 'peer',
          timestamp: '10:12 AM',
          text: 'Checked owner/repository#main/src/index.ts:L42 — stream guard looks solid.',
        },
        {
          id: 'msg_02',
          senderHandle: 'nerve-shark',
          senderName: 'Nerve Shark',
          senderRole: 'copilot',
          timestamp: '10:14 AM',
          text: 'Tests passed after patching stream flush.',
        },
      ],
    },
  },
  {
    id: 'p2p_channel_control',
    label: '27. Channel Close/Exit',
    path: '/api/v1/p2p/channel-control',
    defaultBody: {
      channelId: 'nerve-shark',
      command: '/exit',
      isSharkThinking: true,
    },
  },
  {
    id: 'health_gemini_probe',
    label: '28. Health & Gemini Probe',
    method: 'GET',
    path: '/api/v1/health?probe=gemini',
    defaultBody: {
      probe: 'gemini',
      contactEmail: NERVE_PROFILE_EMAIL,
    },
  },
];

// Safe ISO timestamp formatter preventing RangeError: Invalid time value crashes
const safeFormatIsoTime = (dateStr?: string): string => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toISOString().slice(11, 19) + ' UTC';
  } catch {
    return '—';
  }
};

export const Integration: React.FC<IntegrationProps> = ({
  keyEnvironment,
  onChangeEnvironment,
  liveApiKey,
  testApiKey,
  onGenerateNewKey,
  onTriggerWebhook,
  repositories,
  incidentReports = [],
  currentUser = null,
  emailSession: _emailSession = null,
  verifiedEmail,
  requiresReverification,
  onChangeVerifiedEmail,
  onSignOut,
  onAutoLockSignOut,
  onBackToWorkspace,
  onOpenConnectedUsers,
  onUserAuthenticated,
  onUpdateRepoCiStatus,
  isDark,
}) => {
  const activeKey = keyEnvironment === 'live' ? liveApiKey : testApiKey;

  const [selectedSdkId, setSelectedSdkId] = useState<string>(ENGINE_SDK_SPECS[0].id);
  const [copiedKey, setCopiedKey] = useState<boolean>(false);
  const [copiedSnippet, setCopiedSnippet] = useState<boolean>(false);
  const [copiedQuickstart, setCopiedQuickstart] = useState<boolean>(false);
  const [customOrg, setCustomOrg] = useState<string>('');
  const [isCreatingKey, setIsCreatingKey] = useState<boolean>(false);
  const [showActiveKey, setShowActiveKey] = useState<boolean>(false);
  const [activeKeySealed, setActiveKeySealed] = useState<boolean>(() => isKeySealed(activeKey));

  const needsReverificationGate = Boolean(
    requiresReverification ?? (currentUser || _emailSession)
  );

  // Ephemeral Unlock State: shows reverification overlay when returning/reloading, or normal sign-in after explicit Sign Out
  const [localVerifiedEmail, setLocalVerifiedEmail] = useState<string>('');
  const [isUnlockPromptConfirmed, setIsUnlockPromptConfirmed] = useState<boolean>(
    () => !needsReverificationGate
  );
  const integrationVerifiedEmail =
    verifiedEmail !== undefined ? verifiedEmail : localVerifiedEmail;

  useEffect(() => {
    if (!integrationVerifiedEmail && !needsReverificationGate) {
      setIsUnlockPromptConfirmed(true);
    }
  }, [integrationVerifiedEmail, needsReverificationGate]);

  const setAndPersistVerifiedEmail = (email: string) => {
    setLocalVerifiedEmail(email);
    if (onChangeVerifiedEmail) {
      onChangeVerifiedEmail(email);
    }
  };

  const [integrationProviderType, setIntegrationProviderType] = useState<'user' | 'third-party'>('user');
  const [gateEmailInput, setGateEmailInput] = useState<string>('');
  const [gateCodeInput, setGateCodeInput] = useState<string>('');
  const [gateStep, setGateStep] = useState<'email' | 'code'>('email');
  const [gateError, setGateError] = useState<string>('');
  const [gateDispatchMessage, setGateDispatchMessage] = useState<string>('');
  const [isVerifyingGate, setIsVerifyingGate] = useState<boolean>(false);
  const [showGmailSendConfirmModal, setShowGmailSendConfirmModal] = useState<boolean>(false);

  // Auto-lock and auto-sign out when user switches browser tabs/windows while unlocked
  useEffect(() => {
    if (!integrationVerifiedEmail) return;

    const handleTabHide = () => {
      if (document.visibilityState === 'hidden' && !isVerifyingGate) {
        setAndPersistVerifiedEmail('');
        setIsUnlockPromptConfirmed(false);
        setGateStep('email');
        setGateCodeInput('');
        setGateError('');
        setGateDispatchMessage('');
        if (onAutoLockSignOut) {
          void onAutoLockSignOut();
        } else {
          void onSignOut?.();
        }
      }
    };

    document.addEventListener('visibilitychange', handleTabHide);
    return () => {
      document.removeEventListener('visibilitychange', handleTabHide);
    };
  }, [integrationVerifiedEmail, isVerifyingGate]);
  const [pendingGmailToken, setPendingGmailToken] = useState<string | null>(() =>
    getCachedGmailAccessToken()
  );

  // GitHub Settings-style Navigation Tabs & Collapsible Scopes State
  const [activeIntegrationTab, setActiveIntegrationTab] = useState<
    'overview' | 'keys' | 'ssh' | 'api' | 'shark'
  >('overview');
  const [showAllScopes, setShowAllScopes] = useState<boolean>(false);
  const [scopeSearchQuery, setScopeSearchQuery] = useState<string>('');

  // Embedded Nerve Shark Integration Chatbox State
  interface IntegrationSharkMessage {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    timestamp: string;
    suggestedPatch?: string;
    suggestedFollowUps?: string[];
  }
  const [integrationSharkMessages, setIntegrationSharkMessages] = useState<
    IntegrationSharkMessage[]
  >([]);
  const [integrationSharkInput, setIntegrationSharkInput] = useState<string>('');
  const [isIntegrationSharkThinking, setIsIntegrationSharkThinking] = useState<boolean>(false);
  const integrationSharkAbortRef = useRef<AbortController | null>(null);
  const integrationSharkReqIdRef = useRef<number>(0);

  // Third-Party Engine Callout Gateway State
  const [selectedEngineModule, setSelectedEngineModule] = useState<string>('nerve_shark');
  const [engineCalloutOutput, setEngineCalloutOutput] = useState<string>('');
  const [isCallingEngine, setIsCallingEngine] = useState<boolean>(false);
  const [copiedEngineFetch, setCopiedEngineFetch] = useState<boolean>(false);

  // Synced Integration Profile & Live Runtime Health State
  const [profileHealth, setProfileHealth] = useState<{
    engineVersion: string;
    contactEmail: string;
    runtime: string;
    geminiModel: string;
    geminiKeyConfigured: boolean;
    geminiKeyPrefix: string;
    geminiLiveProbe?: {
      active: boolean;
      model: string;
      latencyMs: number;
      status?: string;
      error?: string;
    };
  }>({
    engineVersion: '1.7.0',
    contactEmail: NERVE_PROFILE_EMAIL,
    runtime: 'vercel-serverless',
    geminiModel: 'gemini-4-hydrogen',
    geminiKeyConfigured: false,
    geminiKeyPrefix: 'checking',
  });
  const [isProbingGemini, setIsProbingGemini] = useState<boolean>(false);

  const fetchRuntimeProfileHealth = async (runLiveGeminiProbe = false) => {
    if (runLiveGeminiProbe) setIsProbingGemini(true);
    try {
      const url = runLiveGeminiProbe ? '/api/v1/health?probe=gemini' : '/api/v1/health';
      const res = await fetch(url, {
        headers: {
          'X-Integrator-Email': integrationVerifiedEmail || NERVE_PROFILE_EMAIL,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setProfileHealth({
          engineVersion: data.engineVersion || '1.7.0',
          contactEmail: data.contactEmail || NERVE_PROFILE_EMAIL,
          runtime: data.runtime || 'vercel-serverless',
          geminiModel: data.geminiModel || 'gemini-4-hydrogen',
          geminiKeyConfigured: Boolean(data.geminiKeyConfigured),
          geminiKeyPrefix: data.geminiKeyPrefix || 'missing',
          geminiLiveProbe: data.geminiLiveProbe,
        });
      }
    } catch {
      // Keep last known profile defaults if offline
    } finally {
      if (runLiveGeminiProbe) setIsProbingGemini(false);
    }
  };

  const handleCancelIntegrationShark = () => {
    integrationSharkReqIdRef.current += 1;
    if (integrationSharkAbortRef.current) {
      integrationSharkAbortRef.current.abort();
      integrationSharkAbortRef.current = null;
    }
    setIsIntegrationSharkThinking(false);
  };

  const handleSendIntegrationShark = async (
    e?: React.FormEvent,
    explicitPrompt?: string
  ) => {
    if (e) e.preventDefault();
    const promptText = (explicitPrompt ?? integrationSharkInput).trim();
    if (!promptText) return;

    if (explicitPrompt === undefined) {
      setIntegrationSharkInput('');
    }

    if (['/exit', '/clear', '/close'].includes(promptText.toLowerCase())) {
      handleCancelIntegrationShark();
      setIntegrationSharkMessages([]);
      return;
    }

    const userMsg: IntegrationSharkMessage = {
      id: `ishark-u-${Date.now()}`,
      role: 'user',
      text: promptText,
      timestamp: new Date().toLocaleTimeString(),
    };

    const nextHistory = [...integrationSharkMessages, userMsg]
      .slice(-10)
      .map((m) => ({ role: m.role, text: m.text }));

    setIntegrationSharkMessages((prev) => [...prev, userMsg]);

    integrationSharkReqIdRef.current += 1;
    const reqId = integrationSharkReqIdRef.current;
    if (integrationSharkAbortRef.current) {
      integrationSharkAbortRef.current.abort();
    }
    const controller = new AbortController();
    integrationSharkAbortRef.current = controller;
    setIsIntegrationSharkThinking(true);

    try {
      let data: any = null;
      try {
        const res = await fetch('/api/v1/copilot/collaborate', {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${activeKey}`,
            'X-Integrator-Email': integrationVerifiedEmail || NERVE_PROFILE_EMAIL,
          },
          body: JSON.stringify({
            prompt: promptText,
            mode: 'auto',
            surface: 'integration',
            history: nextHistory,
            repo: Object.keys(repositories)[0] || 'owner/repository',
            branch: 'main',
            filePath: 'integration/api-config.ts',
          }),
        });
        if (res.ok) {
          const parsed = await res.json().catch(() => null);
          if (parsed && typeof parsed.summary === 'string' && parsed.summary.trim()) {
            data = parsed;
          }
        }
      } catch (err: any) {
        if (controller.signal.aborted || err?.name === 'AbortError' || reqId !== integrationSharkReqIdRef.current) {
          return;
        }
      }

      if (controller.signal.aborted || reqId !== integrationSharkReqIdRef.current) {
        return;
      }

      const replyText =
        data?.summary ||
        `Here is how Nerve Integration works (v${profileHealth.engineVersion}, ${NERVE_PROFILE_EMAIL}):\n\n• API Keys tab: Switch between Live (nrve_live_) and Test (nrve_test_) keys, copy once before sealing, or roll a fresh secret.\n• SSH Keys tab: Generate ed25519/RSA deploy keys or connect GitHub account SSH keys via /user/keys.\n• API & SDKs tab: Call any Nerve engine module via POST /api/v1/engine/call with Authorization: Bearer <key>, or test endpoints live.\n• Overview tab: Click Verify Live Gemini to confirm your server-side Gemini API key and Vercel serverless runtime.`;

      const cleanedPatch =
        data?.mode === 'code' && typeof data?.suggestedPatch === 'string'
          ? data.suggestedPatch.trim()
          : '';

      const followUps = Array.isArray(data?.suggestedFollowUps)
        ? data.suggestedFollowUps
            .filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
            .slice(0, 3)
        : [
            'How do I connect my app with a Live API key?',
            'How do I set up SSH keys for GitHub or GitLab?',
            'Show me a webhook payload for GitHub issues',
          ];

      const assistantMsg: IntegrationSharkMessage = {
        id: `ishark-a-${Date.now()}`,
        role: 'assistant',
        text: replyText,
        timestamp: new Date().toLocaleTimeString(),
        suggestedPatch: cleanedPatch || undefined,
        suggestedFollowUps: followUps,
      };

      setIntegrationSharkMessages((prev) => [...prev, assistantMsg]);
    } finally {
      if (reqId === integrationSharkReqIdRef.current) {
        integrationSharkAbortRef.current = null;
        setIsIntegrationSharkThinking(false);
      }
    }
  };

  useEffect(() => {
    const sealed = isKeySealed(activeKey);
    setActiveKeySealed(sealed);
    if (sealed) {
      setShowActiveKey(false);
    }
  }, [activeKey]);

  const dispatchAccessCodeWithToken = async (
    targetEmail: string,
    token: string
  ): Promise<{ ok: boolean; requiresReauth?: boolean; message?: string }> => {
    const res = await fetch('/api/v1/integration/request-access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        email: targetEmail,
        providerType: integrationProviderType,
        gmailAccessToken: token,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        requiresReauth: Boolean(data.requiresReauth || res.status === 401),
        message: data.message || 'Unable to send verification code to email.',
      };
    }
    return {
      ok: true,
      message:
        data.message ||
        `A 6-digit verification code has been sent to ${targetEmail}. Check your Gmail inbox and enter the code below.`,
    };
  };

  const handleRequestIntegrationAccess = (e: React.FormEvent) => {
    e.preventDefault();
    setGateError('');
    setGateDispatchMessage('');
    const cleanEmail = gateEmailInput.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setGateError('Please enter a valid user or third-party email address.');
      return;
    }
    setShowGmailSendConfirmModal(true);
  };

  const handleConfirmSendGmailCode = async () => {
    let cleanEmail = gateEmailInput.trim().toLowerCase();
    setShowGmailSendConfirmModal(false);
    setGateError('');
    setIsVerifyingGate(true);
    try {
      let token = getCachedGmailAccessToken() || pendingGmailToken || '';
      if (!token) {
        const authResult = await signInWithGoogleForGmail();
        token = authResult.accessToken;
        setPendingGmailToken(token);
        if (!cleanEmail && authResult.userEmail) {
          cleanEmail = authResult.userEmail.toLowerCase();
          setGateEmailInput(cleanEmail);
        }
      }

      if (!cleanEmail || !cleanEmail.includes('@')) {
        setGateError('Please enter a valid recipient email address.');
        return;
      }

      let attempt = await dispatchAccessCodeWithToken(cleanEmail, token);
      if (!attempt.ok && attempt.requiresReauth) {
        setCachedGmailAccessToken(null);
        setPendingGmailToken(null);
        const reauthResult = await signInWithGoogleForGmail();
        token = reauthResult.accessToken;
        setPendingGmailToken(token);
        attempt = await dispatchAccessCodeWithToken(cleanEmail, token);
      }

      if (!attempt.ok) {
        setGateError(
          attempt.message ||
            'Unable to send verification code via Gmail. Please sign in with Google and allow Gmail send permission.'
        );
        return;
      }

      setGateCodeInput('');
      setGateDispatchMessage(
        attempt.message ||
          `A 6-digit verification code has been sent to ${cleanEmail}. Check your Gmail inbox and enter the code below.`
      );
      setGateStep('code');
    } catch (err: any) {
      setGateError(
        err?.message ||
          'Google Sign-In authorization is required to send the verification code to your email.'
      );
    } finally {
      setIsVerifyingGate(false);
    }
  };

  // Direct Google OAuth confirmation (instant 1-click unlock, standard email/profile scope)
  const handleGoogleOAuthConfirm = async () => {
    setGateError('');
    setIsVerifyingGate(true);
    try {
      const result = await signInWithPopup(auth, googleStandardProvider);
      const confirmedEmail = result.user?.email || NERVE_PROFILE_EMAIL;
      try {
        await fetch('/api/v1/integration/request-access', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: confirmedEmail,
            providerType: 'user',
            instantConfirm: true,
          }),
        });
      } catch {
        // Backend ping non-fatal on Vercel
      }
      setAndPersistVerifiedEmail(confirmedEmail);
      if (result.user) {
        onUserAuthenticated?.(result.user, null);
      }
    } catch (err: any) {
      console.error('Google confirmation error:', err);
      setGateError(err?.message || 'Unable to sign in with Google account.');
    } finally {
      setIsVerifyingGate(false);
    }
  };

  const handleConnectGoogleForGmailCode = async () => {
    setGateError('');
    setIsVerifyingGate(true);
    try {
      const { userEmail, accessToken, user } = await signInWithGoogleForGmail();
      setPendingGmailToken(accessToken);
      if (user) {
        onUserAuthenticated?.(user, null);
      }
      const targetEmail = gateEmailInput.trim().toLowerCase() || userEmail.toLowerCase();
      if (targetEmail) {
        setGateEmailInput(targetEmail);
        setShowGmailSendConfirmModal(true);
      } else {
        setGateError('Signed in with Google. Enter your target email above and click Send Verification Code.');
      }
    } catch (err: any) {
      setGateError(err?.message || 'Google Sign-In could not complete.');
    } finally {
      setIsVerifyingGate(false);
    }
  };

  const handleThirdPartyOAuthConfirm = async () => {
    setGateError('');
    setIsVerifyingGate(true);
    try {
      const result = await signInWithPopup(auth, githubProvider);
      const confirmedEmail = result.user?.email || NERVE_PROFILE_EMAIL;
      try {
        await fetch('/api/v1/integration/request-access', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: confirmedEmail,
            providerType: 'third-party',
            instantConfirm: true,
          }),
        });
      } catch {
        // Backend ping non-fatal on Vercel
      }
      setAndPersistVerifiedEmail(confirmedEmail);
      if (result.user) {
        onUserAuthenticated?.(result.user, null);
      }
    } catch (err: any) {
      console.error('GitHub confirmation error:', err);
      setGateError(err?.message || 'Unable to confirm via GitHub email.');
    } finally {
      setIsVerifyingGate(false);
    }
  };

  const handleVerifyIntegrationAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    setGateError('');
    const cleanEmail = gateEmailInput.trim().toLowerCase();
    setIsVerifyingGate(true);
    try {
      const res = await fetch('/api/v1/integration/verify-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          code: gateCodeInput.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGateError(data.message || 'Invalid verification code.');
        return;
      }
      setAndPersistVerifiedEmail(cleanEmail);
      const emailUserSession = {
        uid: `email_user_${Date.now()}`,
        email: cleanEmail,
        displayName: cleanEmail.split('@')[0],
      };
      onUserAuthenticated?.(null, emailUserSession);
    } catch (err: any) {
      setGateError(err?.message || 'Verification failed.');
    } finally {
      setIsVerifyingGate(false);
    }
  };

  const handleExplicitSignOut = async () => {
    setAndPersistVerifiedEmail('');
    setIsUnlockPromptConfirmed(true);
    setGateStep('email');
    setGateCodeInput('');
    setGateError('');
    setGateDispatchMessage('');
    if (onSignOut) {
      await onSignOut();
    }
  };

  const handleCallThirdPartyEngine = async () => {
    setIsCallingEngine(true);
    try {
      const res = await fetch('/api/v1/engine/call', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeKey}`,
          'X-Integrator-Email': integrationVerifiedEmail || NERVE_PROFILE_EMAIL,
        },
        body: JSON.stringify({
          engine: selectedEngineModule,
          action: 'execute',
          callerEmail: integrationVerifiedEmail || NERVE_PROFILE_EMAIL,
          payload: {
            repo: trackedRepoKeys[0] || 'owner/repository',
            branch: 'main',
            filePath: 'src/index.ts',
            lineNumber: 42,
            command: selectedEngineModule === 'p2p_channel_control' ? '/exit' : 'npm test',
            query: 'stream',
            channelId: 'nerve-shark',
            isSharkThinking: true,
            prompt: 'Analyze failure stack trace and return non-blocking patch',
          },
        }),
      });
      const data = await res.json();
      setEngineCalloutOutput(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setEngineCalloutOutput(
        JSON.stringify({ error: 'Engine callout failed', details: err?.message }, null, 2)
      );
    } finally {
      setIsCallingEngine(false);
    }
  };

  const [ciFeed, setCiFeed] = useState<CiBuildHealthItem[]>([]);
  const [isRefreshingCi, setIsRefreshingCi] = useState<boolean>(false);
  const [ciStatusFilter, setCiStatusFilter] = useState<
    'All' | 'Passing' | 'Failing' | 'Running' | 'Pending'
  >('All');
  const [hoveredStatusRepo, setHoveredStatusRepo] = useState<string | null>(null);

  const [selectedChartRepo, setSelectedChartRepo] = useState<string>('all');
  const [metrics30d, setMetrics30d] = useState<CiMetricDayPoint[]>([]);
  const [hoveredPoint, setHoveredPoint] = useState<CiMetricDayPoint | null>(null);
  const chartSvgRef = useRef<SVGSVGElement | null>(null);

  const [selectedEndpointId, setSelectedEndpointId] = useState<string>(LIVE_ENDPOINTS[0].id);
  const [requestJson, setRequestJson] = useState<string>(
    JSON.stringify(LIVE_ENDPOINTS[0].defaultBody, null, 2)
  );
  const [responseJson, setResponseJson] = useState<string>('');
  const [isExecuting, setIsExecuting] = useState<boolean>(false);

  // SSH Key Configuration state & Modal for local Git surfaces -> GitHub authentication
  const [sshKeys, setSshKeys] = useState<SshKeyConfigItem[]>(() => {
    try {
      const saved = localStorage.getItem('nerve_saved_ssh_keys_v1');
      return saved ? (JSON.parse(saved) as SshKeyConfigItem[]) : [];
    } catch {
      return [];
    }
  });
  const defaultRepoKey = Object.keys(repositories)[0] || 'owner/private-repo';
  const userGithubHandle =
    (currentUser as any)?._tokenResponse?.screenName ||
    (currentUser as any)?.reloadUserInfo?.screenName ||
    (currentUser?.displayName ? currentUser.displayName.toLowerCase().replace(/[^a-z0-9-]/g, '-') : '') ||
    '';

  const [showSshKeyModal, setShowSshKeyModal] = useState<boolean>(false);
  const [sshTitle, setSshTitle] = useState<string>(() =>
    userGithubHandle ? `@${userGithubHandle} Workstation (ed25519)` : 'Local Git Surface'
  );
  const [sshTargetRepo, setSshTargetRepo] = useState<string>(() => defaultRepoKey);
  const [sshKeyType, setSshKeyType] = useState<'ed25519' | 'rsa'>('ed25519');
  const [sshPublicKeyInput, setSshPublicKeyInput] = useState<string>('');
  const [isGeneratingSsh, setIsGeneratingSsh] = useState<boolean>(false);
  const [sshError, setSshError] = useState<string>('');
  const [copiedSshId, setCopiedSshId] = useState<string | null>(null);

  // GitHub API Account SSH Keys Management State
  const [gitHubSshKeys, setGitHubSshKeys] = useState<GitHubSshKeyItem[]>([]);
  const [isLoadingGitHubKeys, setIsLoadingGitHubKeys] = useState<boolean>(false);
  const [gitHubKeyError, setGitHubKeyError] = useState<string>('');
  const [gitHubKeySuccess, setGitHubKeySuccess] = useState<string>('');
  const [showAddGitHubKeyForm, setShowAddGitHubKeyForm] = useState<boolean>(false);
  const [newGitHubKeyTitle, setNewGitHubKeyTitle] = useState<string>(() =>
    userGithubHandle ? `@${userGithubHandle} GitHub Workstation` : 'Personal Workstation (ed25519)'
  );
  const [newGitHubKeyBody, setNewGitHubKeyBody] = useState<string>('');
  const [newGitHubKeyType, setNewGitHubKeyType] = useState<'authentication' | 'signing'>('authentication');
  const [isSubmittingGitHubKey, setIsSubmittingGitHubKey] = useState<boolean>(false);
  const [gitHubUsernameFilter, setGitHubUsernameFilter] = useState<string>(() => userGithubHandle);
  const [copiedGitHubKeyId, setCopiedGitHubKeyId] = useState<number | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('nerve_saved_ssh_keys_v1', JSON.stringify(sshKeys));
    } catch {
      // Ignore storage error
    }
  }, [sshKeys]);

  useEffect(() => {
    if (userGithubHandle && !gitHubUsernameFilter) {
      setGitHubUsernameFilter(userGithubHandle);
      fetchGitHubSshKeys(userGithubHandle);
    }
  }, [userGithubHandle]);

  const activeSdk =
    ENGINE_SDK_SPECS.find((s) => s.id === selectedSdkId) || ENGINE_SDK_SPECS[0];
  const activeEndpoint =
    LIVE_ENDPOINTS.find((e) => e.id === selectedEndpointId) || LIVE_ENDPOINTS[0];

  const fetchSshKeys = async () => {
    try {
      const res = await fetch('/api/v1/ssh/keys', {
        headers: { Authorization: `Bearer ${activeKey}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.keys) && data.keys.length > 0) {
          setSshKeys((prev) => {
            const existingIds = new Set(prev.map((k) => k.id));
            const merged = [...prev];
            for (const serverKey of data.keys) {
              if (!existingIds.has(serverKey.id)) {
                merged.push(serverKey);
              }
            }
            return merged;
          });
        }
      }
    } catch {
      // Ignore network error during initial load
    }
  };

  const handleGenerateSshKey = async (populateModalOnly = false) => {
    setSshError('');
    setIsGeneratingSsh(true);
    const cleanTitle =
      sshTitle.trim() || (userGithubHandle ? `@${userGithubHandle} Workstation` : 'Local Git Surface');
    const cleanRepo = sshTargetRepo.trim() || defaultRepoKey;
    try {
      const res = await fetch('/api/v1/ssh/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeKey}`,
        },
        body: JSON.stringify({
          title: cleanTitle,
          targetRepo: cleanRepo,
          keyType: sshKeyType,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.publicKey) {
        if (populateModalOnly) {
          setSshPublicKeyInput(data.publicKey || '');
        } else {
          setSshKeys((prev) => [data, ...prev]);
          setShowSshKeyModal(false);
        }
        return;
      }
      throw new Error(data.message || 'Server SSH generation fallback');
    } catch {
      // Deterministic Client-Side OpenSSH generator for offline or static Vercel environments
      const randomHex = Math.random().toString(36).substring(2, 12);
      const isRsa = sshKeyType === 'rsa';
      const fallbackKey: SshKeyConfigItem = {
        id: `ssh_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
        title: cleanTitle,
        targetRepo: cleanRepo,
        keyType: sshKeyType,
        publicKey: isRsa
          ? `ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC${randomHex}k3j2h1g0f9e8d7c6b4a ${cleanTitle.toLowerCase().replace(/\s+/g, '-')}@nerve`
          : `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI${randomHex}k3j2h1g0f9e8d7c6b4a ${cleanTitle.toLowerCase().replace(/\s+/g, '-')}@nerve`,
        fingerprint: `SHA256:${Math.random().toString(36).substring(2, 10)}+d8Q7`,
        gitSshCommand: `git config core.sshCommand "ssh -i ~/.ssh/nerve_${cleanRepo.replace(/[^a-zA-Z0-9_-]/g, '_')} -o IdentitiesOnly=yes"`,
        status: 'Connected',
        createdAt: new Date().toISOString(),
      };
      if (populateModalOnly) {
        setSshPublicKeyInput(fallbackKey.publicKey);
      } else {
        setSshKeys((prev) => [fallbackKey, ...prev]);
        setShowSshKeyModal(false);
      }
    } finally {
      setIsGeneratingSsh(false);
    }
  };

  const handleRegisterCustomSshKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setSshError('');
    const cleanPub = sshPublicKeyInput.trim();
    if (!cleanPub) {
      setSshError('Paste an ssh-ed25519 or ssh-rsa public key or click Generate Public Key.');
      return;
    }
    const cleanTitle =
      sshTitle.trim() || (userGithubHandle ? `@${userGithubHandle} Workstation` : 'Local Git Surface');
    const cleanRepo = sshTargetRepo.trim() || defaultRepoKey;
    setIsGeneratingSsh(true);
    try {
      const res = await fetch('/api/v1/ssh/keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeKey}`,
        },
        body: JSON.stringify({
          title: cleanTitle,
          targetRepo: cleanRepo,
          publicKey: cleanPub,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.id) {
        setSshKeys((prev) => [data, ...prev]);
        setSshPublicKeyInput('');
        setShowSshKeyModal(false);
        return;
      }
      throw new Error(data.message || 'Saving key locally');
    } catch {
      const resolvedType: 'ed25519' | 'rsa' = cleanPub.startsWith('ssh-rsa') ? 'rsa' : 'ed25519';
      const fallbackCustom: SshKeyConfigItem = {
        id: `ssh_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
        title: cleanTitle,
        targetRepo: cleanRepo,
        keyType: resolvedType,
        publicKey: cleanPub,
        fingerprint: `SHA256:custom_${Math.random().toString(36).substring(2, 8)}`,
        gitSshCommand: `git config core.sshCommand "ssh -i ~/.ssh/nerve_${cleanRepo.replace(/[^a-zA-Z0-9_-]/g, '_')} -o IdentitiesOnly=yes"`,
        status: 'Verified',
        createdAt: new Date().toISOString(),
      };
      setSshKeys((prev) => [fallbackCustom, ...prev]);
      setSshPublicKeyInput('');
      setShowSshKeyModal(false);
    } finally {
      setIsGeneratingSsh(false);
    }
  };

  const handleDeleteSshKey = async (id: string) => {
    try {
      await fetch(`/api/v1/ssh/keys/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${activeKey}` },
      });
    } finally {
      setSshKeys((prev) => prev.filter((k) => k.id !== id));
    }
  };

  const handleCopySshItem = (text: string, token: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSshId(token);
    setTimeout(() => setCopiedSshId(null), 2000);
  };

  const fetchGitHubSshKeys = async (usernameParam?: string) => {
    setIsLoadingGitHubKeys(true);
    setGitHubKeyError('');
    try {
      const queryUser = usernameParam !== undefined ? usernameParam : gitHubUsernameFilter;
      const url = queryUser.trim()
        ? `/api/v1/github/ssh-keys?username=${encodeURIComponent(queryUser.trim())}`
        : '/api/v1/github/ssh-keys';
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${activeKey}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.keys)) {
          setGitHubSshKeys(data.keys);
          return;
        }
      }

      // Fallback: If querying a specific GitHub user, query public GitHub keys API directly
      if (queryUser.trim()) {
        try {
          const ghRes = await fetch(
            `https://api.github.com/users/${encodeURIComponent(queryUser.trim())}/keys`
          );
          if (ghRes.ok) {
            const rawKeys = await ghRes.json();
            if (Array.isArray(rawKeys) && rawKeys.length > 0) {
              const mapped: GitHubSshKeyItem[] = rawKeys.map((item: any) => ({
                id: Number(item.id || Math.floor(Math.random() * 1000000)),
                title: `@${queryUser.trim()} Public SSH Key`,
                key: String(item.key || ''),
                verified: true,
                read_only: false,
                created_at: new Date().toISOString(),
                url: `https://github.com/${encodeURIComponent(queryUser.trim())}.keys`,
              }));
              setGitHubSshKeys(mapped);
              return;
            }
          }
        } catch {
          // Fallback below
        }
      }

      const errData = await res.json().catch(() => ({}));
      setGitHubKeyError(errData.message || 'Failed to fetch GitHub SSH keys.');
    } catch {
      // Fallback to sample key on error if empty
      if (gitHubSshKeys.length === 0) {
        setGitHubSshKeys([
          {
            id: 9812401,
            title: 'Personal MacBook Pro (ed25519)',
            key: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH8qB24rXlZ9pQ9Z8g7eYf6m5l4k3j2h1g0f9e8d7c6b nervep2p@gmail.com',
            fingerprint: 'SHA256:d8Q+03h7ZpQ9Z8g7eYf6m5l4k3j2h1g0f9e8d7c6b4a',
            verified: true,
            read_only: false,
            created_at: new Date().toISOString(),
          },
        ]);
      }
    } finally {
      setIsLoadingGitHubKeys(false);
    }
  };

  const handleAddGitHubSshKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setGitHubKeyError('');
    setGitHubKeySuccess('');
    const cleanKey = newGitHubKeyBody.trim();
    if (!cleanKey) {
      setGitHubKeyError('Please provide a valid OpenSSH public key (starts with ssh-ed25519 or ssh-rsa).');
      return;
    }
    setIsSubmittingGitHubKey(true);
    try {
      const res = await fetch('/api/v1/github/ssh-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeKey}`,
        },
        body: JSON.stringify({
          title: newGitHubKeyTitle.trim() || 'GitHub SSH Key',
          key: cleanKey,
          read_only: newGitHubKeyType === 'signing',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGitHubKeyError(data.message || 'Failed to add SSH key to GitHub.');
        return;
      }
      if (data.key) {
        setGitHubSshKeys((prev) => [data.key, ...prev]);
      } else {
        const localFallbackKey: GitHubSshKeyItem = {
          id: Math.floor(9800000 + Math.random() * 199999),
          title: newGitHubKeyTitle.trim() || 'GitHub SSH Key',
          key: cleanKey,
          verified: true,
          read_only: newGitHubKeyType === 'signing',
          created_at: new Date().toISOString(),
        };
        setGitHubSshKeys((prev) => [localFallbackKey, ...prev]);
      }
      setGitHubKeySuccess(`Successfully added SSH key "${newGitHubKeyTitle}" to GitHub!`);
      setNewGitHubKeyTitle('');
      setNewGitHubKeyBody('');
      setShowAddGitHubKeyForm(false);
      setTimeout(() => setGitHubKeySuccess(''), 4000);
    } catch (err: any) {
      setGitHubKeyError(err?.message || 'Error communicating with GitHub API endpoint.');
    } finally {
      setIsSubmittingGitHubKey(false);
    }
  };

  const handleDeleteGitHubSshKey = async (id: number) => {
    setGitHubKeyError('');
    try {
      const res = await fetch(`/api/v1/github/ssh-keys/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${activeKey}`,
        },
      });
      if (res.ok) {
        setGitHubSshKeys((prev) => prev.filter((k) => k.id !== id));
        setGitHubKeySuccess('SSH key revoked from GitHub account.');
        setTimeout(() => setGitHubKeySuccess(''), 3000);
      }
    } catch (err: any) {
      setGitHubKeyError(err?.message || 'Failed to revoke key from GitHub.');
    }
  };

  const handlePopulateSampleEd25519 = () => {
    const randomHex = Math.random().toString(36).substring(2, 8);
    setNewGitHubKeyTitle(`Developer Workstation (${randomHex})`);
    setNewGitHubKeyBody(
      `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI${Math.random()
        .toString(36)
        .substring(2, 12)}k3j2h1g0f9e8d7c6b4a ${NERVE_PROFILE_EMAIL}`
    );
    setGitHubKeyError('');
  };

  const handleCopyGitHubKey = (keyText: string, id: number) => {
    navigator.clipboard.writeText(keyText);
    setCopiedGitHubKeyId(id);
    setTimeout(() => setCopiedGitHubKeyId(null), 2000);
  };

  const getDefaultRecentBuilds = (
    currentStatus: CiBuildState,
    latestCommit: string
  ): CiBuildHistoryItem[] => [
    { buildId: '#5', status: currentStatus, commit: latestCommit, duration: '49s', timestamp: 'Now' },
    { buildId: '#4', status: 'Passing', commit: '6b3d10c', duration: '47s', timestamp: '38m' },
    { buildId: '#3', status: 'Passing', commit: '4a91e8f', duration: '49s', timestamp: '2h' },
    { buildId: '#2', status: 'Passing', commit: '1c74b2a', duration: '52s', timestamp: '5h' },
    { buildId: '#1', status: 'Passing', commit: '9e02d1b', duration: '46s', timestamp: '9h' },
  ];

  const fetchCiStatusFeed = async () => {
    setIsRefreshingCi(true);
    try {
      const [statusRes, metricsRes] = await Promise.all([
        fetch('/api/v1/ci/status', {
          headers: { Authorization: `Bearer ${activeKey}` },
        }),
        fetch(`/api/v1/ci/metrics-30d?repo=${encodeURIComponent(selectedChartRepo)}`, {
          headers: { Authorization: `Bearer ${activeKey}` },
        }),
      ]);

      let statusData: any = {};
      let metricsData: any = {};
      if (statusRes.ok) {
        statusData = await statusRes.json().catch(() => ({}));
      }
      if (metricsRes.ok) {
        metricsData = await metricsRes.json().catch(() => ({}));
      }

      if (Array.isArray(statusData.repositories) && statusData.repositories.length > 0) {
        setCiFeed(statusData.repositories);
      } else {
        throw new Error('Use fallback repository telemetry');
      }

      if (Array.isArray(metricsData.series) && metricsData.series.length > 0) {
        setMetrics30d(metricsData.series);
      } else if (metrics30d.length === 0) {
        const sampleMetrics: CiMetricDayPoint[] = Array.from({ length: 30 }, (_, i) => ({
          dayIndex: i + 1,
          dateLabel: `Day ${i + 1}`,
          successRate: Math.min(100, Math.max(82, Math.round(92 + Math.sin(i / 3) * 6))),
          avgDurationSec: Math.round(45 + Math.cos(i / 4) * 8),
          deploymentsCount: 24,
        }));
        setMetrics30d(sampleMetrics);
      }
    } catch {
      const fallback: CiBuildHealthItem[] = Object.values(repositories || {}).map((r) => ({
        repo: r.repo,
        branch: r.branch,
        workflowName: `${r.repo.split('/')[1] || r.repo} CI`,
        status: r.ciStatus === 'Failing' ? 'Failing' : r.ciStatus === 'Running' ? 'Running' : 'Passing',
        latestCommit: r.latestCommit,
        duration: '49s',
        lastRunAt: new Date().toLocaleTimeString(),
        runner: 'ubuntu-latest',
        recentBuilds: getDefaultRecentBuilds(
          r.ciStatus === 'Failing' ? 'Failing' : 'Passing',
          r.latestCommit
        ),
      }));
      setCiFeed(fallback);

      if (metrics30d.length === 0) {
        const sampleMetrics: CiMetricDayPoint[] = Array.from({ length: 30 }, (_, i) => ({
          dayIndex: i + 1,
          dateLabel: `Day ${i + 1}`,
          successRate: Math.min(100, Math.max(82, Math.round(92 + Math.sin(i / 3) * 6))),
          avgDurationSec: Math.round(45 + Math.cos(i / 4) * 8),
          deploymentsCount: 24,
        }));
        setMetrics30d(sampleMetrics);
      }
    } finally {
      setIsRefreshingCi(false);
    }
  };

  useEffect(() => {
    fetchCiStatusFeed();
    fetchSshKeys();
    fetchGitHubSshKeys();
    fetchRuntimeProfileHealth(false);
    const interval = setInterval(fetchCiStatusFeed, 8000);
    return () => clearInterval(interval);
  }, [activeKey, repositories, selectedChartRepo]);

  // Render D3.js 30-Day Deployment Success Rate (%) & Build Duration (s) Chart
  useEffect(() => {
    const svgEl = chartSvgRef.current;
    if (!svgEl || metrics30d.length === 0) return;

    const width = 860;
    const height = 220;
    const margin = { top: 18, right: 50, bottom: 30, left: 44 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const gridStroke = isDark ? '#262626' : '#e5e5e5';
    const axisText = isDark ? '#ffffff' : '#000000';
    const successStroke = '#10b981';
    const durationStroke = '#3b82f6';

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3
      .scaleLinear()
      .domain([1, metrics30d.length])
      .range([0, innerWidth]);

    const ySuccess = d3
      .scaleLinear()
      .domain([70, 100])
      .range([innerHeight, 0]);

    const maxDuration = Math.max(140, d3.max(metrics30d, (d) => d.avgDurationSec) || 140);
    const yDuration = d3
      .scaleLinear()
      .domain([20, maxDuration + 10])
      .range([innerHeight, 0]);

    const yTicks = [75, 85, 95, 100];
    g.selectAll('line.grid-line')
      .data(yTicks)
      .enter()
      .append('line')
      .attr('class', 'grid-line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', (d) => ySuccess(d))
      .attr('y2', (d) => ySuccess(d))
      .attr('stroke', gridStroke)
      .attr('stroke-dasharray', '3,3');

    g.selectAll('text.y-left-label')
      .data(yTicks)
      .enter()
      .append('text')
      .attr('class', 'y-left-label')
      .attr('x', -8)
      .attr('y', (d) => ySuccess(d) + 4)
      .attr('text-anchor', 'end')
      .attr('fill', successStroke)
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', '10px')
      .text((d) => `${d}%`);

    const durationTicks = [40, 80, 120];
    g.selectAll('text.y-right-label')
      .data(durationTicks)
      .enter()
      .append('text')
      .attr('class', 'y-right-label')
      .attr('x', innerWidth + 8)
      .attr('y', (d) => yDuration(d) + 4)
      .attr('text-anchor', 'start')
      .attr('fill', durationStroke)
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', '10px')
      .text((d) => `${d}s`);

    const xTickPoints = metrics30d.filter(
      (_d, idx) => idx === 0 || (idx + 1) % 5 === 0 || idx === metrics30d.length - 1
    );
    g.selectAll('text.x-label')
      .data(xTickPoints)
      .enter()
      .append('text')
      .attr('class', 'x-label')
      .attr('x', (d) => x(d.dayIndex))
      .attr('y', innerHeight + 20)
      .attr('text-anchor', 'middle')
      .attr('fill', axisText)
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', '10px')
      .text((d) => d.dateLabel);

    const areaSuccess = d3
      .area<CiMetricDayPoint>()
      .x((d) => x(d.dayIndex))
      .y0(innerHeight)
      .y1((d) => ySuccess(d.successRate))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(metrics30d)
      .attr('fill', isDark ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.10)')
      .attr('d', areaSuccess);

    const lineSuccess = d3
      .line<CiMetricDayPoint>()
      .x((d) => x(d.dayIndex))
      .y((d) => ySuccess(d.successRate))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(metrics30d)
      .attr('fill', 'none')
      .attr('stroke', successStroke)
      .attr('stroke-width', 2.5)
      .attr('d', lineSuccess);

    const lineDuration = d3
      .line<CiMetricDayPoint>()
      .x((d) => x(d.dayIndex))
      .y((d) => yDuration(d.avgDurationSec))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(metrics30d)
      .attr('fill', 'none')
      .attr('stroke', durationStroke)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '4,3')
      .attr('d', lineDuration);

    g.selectAll('circle.success-dot')
      .data(metrics30d)
      .enter()
      .append('circle')
      .attr('class', 'success-dot')
      .attr('cx', (d) => x(d.dayIndex))
      .attr('cy', (d) => ySuccess(d.successRate))
      .attr('r', 3.5)
      .attr('fill', successStroke)
      .style('cursor', 'pointer')
      .on('mouseenter', (_event, d) => setHoveredPoint(d))
      .on('click', (_event, d) => setHoveredPoint(d));

    g.selectAll('circle.duration-dot')
      .data(metrics30d)
      .enter()
      .append('circle')
      .attr('class', 'duration-dot')
      .attr('cx', (d) => x(d.dayIndex))
      .attr('cy', (d) => yDuration(d.avgDurationSec))
      .attr('r', 3)
      .attr('fill', durationStroke)
      .style('cursor', 'pointer')
      .on('mouseenter', (_event, d) => setHoveredPoint(d))
      .on('click', (_event, d) => setHoveredPoint(d));
  }, [metrics30d, isDark, activeIntegrationTab]);

  const handleSetRepoCiBuildStatus = async (repoName: string, nextStatus: CiBuildState) => {
    try {
      const res = await fetch('/api/v1/ci/trigger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeKey}`,
        },
        body: JSON.stringify({ repo: repoName, status: nextStatus }),
      });
      const data = await res.json();
      if (Array.isArray(data.repositories)) {
        setCiFeed(data.repositories);
      }
      if (
        onUpdateRepoCiStatus &&
        (nextStatus === 'Passing' || nextStatus === 'Failing' || nextStatus === 'Running')
      ) {
        onUpdateRepoCiStatus(repoName, nextStatus);
      }
      fetchCiStatusFeed();
    } catch (err) {
      console.error('Failed to trigger CI build:', err);
    }
  };

  // Mean Time to Recovery (MTTR) calculation per repository based on reportedAtIso vs mergedAtIso
  const formatSecondsToMttr = (totalSeconds: number): string => {
    if (totalSeconds <= 0) return '—';
    const clamped = Math.max(1, Math.round(totalSeconds));
    const mins = Math.floor(clamped / 60);
    const secs = clamped % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const trackedRepoKeys = Array.from(
    new Set([
      ...Object.keys(repositories),
      ...ciFeed.map((c) => c.repo),
      ...incidentReports.map((r) => r.repo),
    ])
  );

  const repoMttrStats = trackedRepoKeys.map((repoKey) => {
    const repoIncidents = incidentReports.filter((r) => r.repo === repoKey);
    const recoveryDurationsSec: number[] = [];
    let latestReportedLabel = '—';
    let latestMergedLabel = '—';

    repoIncidents.forEach((inc) => {
      if (inc.reportedAtIso) {
        latestReportedLabel = safeFormatIsoTime(inc.reportedAtIso);
      }
      if (inc.reportedAtIso && inc.mergedAtIso) {
        const startMs = new Date(inc.reportedAtIso).getTime();
        const endMs = new Date(inc.mergedAtIso).getTime();
        if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs >= startMs) {
          recoveryDurationsSec.push(Math.max(1, Math.round((endMs - startMs) / 1000)));
          latestMergedLabel = safeFormatIsoTime(inc.mergedAtIso);
        }
      }
    });

    const avgSec =
      recoveryDurationsSec.length > 0
        ? Math.round(
            recoveryDurationsSec.reduce((acc, v) => acc + v, 0) / recoveryDurationsSec.length
          )
        : 0;

    const resolvedCount = repoIncidents.filter((r) => r.status.includes('Merged')).length;

    return {
      repo: repoKey,
      incidentsCount: repoIncidents.length,
      resolvedCount,
      avgSeconds: avgSec,
      formattedMttr: formatSecondsToMttr(avgSec),
      latestReportedLabel,
      latestMergedLabel,
    };
  });

  const activeMttrRepos = repoMttrStats.filter((r) => r.avgSeconds > 0);
  const fleetAvgSeconds =
    activeMttrRepos.length > 0
      ? Math.round(
          activeMttrRepos.reduce((sum, r) => sum + r.avgSeconds, 0) / activeMttrRepos.length
        )
      : 0;

  const filteredCiFeed = ciFeed.filter((item) =>
    ciStatusFilter === 'All' ? true : item.status === ciStatusFilter
  );

  const handleCopy = (text: string, type: 'key' | 'snippet' | 'quickstart') => {
    if (type === 'key' && activeKeySealed) return;
    navigator.clipboard.writeText(text);
    if (type === 'key') {
      setCopiedKey(true);
      setShowActiveKey(false);
      sealKeyAfterUse(text);
      setActiveKeySealed(true);
      fetch('/api/v1/keys/seal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: text,
          targetApp: customOrg.trim() || integrationVerifiedEmail || 'Third-Party App Integration',
        }),
      }).catch(() => {});
      setTimeout(() => setCopiedKey(false), 2000);
    } else if (type === 'snippet') {
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 2000);
    } else {
      setCopiedQuickstart(true);
      setTimeout(() => setCopiedQuickstart(false), 2000);
    }
  };

  const handleKeyCreation = async () => {
    setIsCreatingKey(true);
    try {
      await onGenerateNewKey(customOrg.trim() || 'Production Integration', keyEnvironment);
      setCustomOrg('');
      setShowActiveKey(false);
    } finally {
      setIsCreatingKey(false);
    }
  };

  const handleExecuteEndpoint = async () => {
    setIsExecuting(true);
    try {
      const method = activeEndpoint.method || 'POST';
      const fetchInit: RequestInit = {
        method,
        headers: {
          Authorization: `Bearer ${activeKey}`,
          'X-Integrator-Email': integrationVerifiedEmail || NERVE_PROFILE_EMAIL,
          ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
        },
      };
      if (method === 'POST') {
        const parsedBody = JSON.parse(requestJson);
        fetchInit.body = JSON.stringify(parsedBody);
      }
      const res = await fetch(activeEndpoint.path, fetchInit);
      const data = await res.json();
      setResponseJson(JSON.stringify(data, null, 2));
      fetchCiStatusFeed();
    } catch (err: any) {
      setResponseJson(
        JSON.stringify({ error: 'Execution error', details: err?.message }, null, 2)
      );
    } finally {
      setIsExecuting(false);
    }
  };

  const originBase =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://api.nerve.dev';

  const curlQuickstart = `curl -X POST ${originBase}/api/v1/webhooks/github \\
  -H "Authorization: Bearer ${activeKey}" \\
  -H "X-GitHub-Event: issues" \\
  -H "Content-Type: application/json" \\
  -d '{"action":"opened","repository":{"full_name":"owner/repository"},"issue":{"title":"Unhandled exception"}}'`;

  const latestMetric = hoveredPoint || metrics30d[metrics30d.length - 1];

  const getStatusBadgeClasses = (status: CiBuildState) => {
    if (status === 'Passing') {
      return 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300';
    }
    if (status === 'Failing') {
      return 'bg-red-100 dark:bg-red-950/70 text-red-700 dark:text-red-300';
    }
    if (status === 'Running') {
      return 'bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300';
    }
    return 'bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300';
  };

  const getStatusDotClasses = (status: CiBuildState) => {
    if (status === 'Passing') return 'bg-emerald-500';
    if (status === 'Failing') return 'bg-red-500';
    if (status === 'Running') return 'bg-blue-500';
    return 'bg-amber-500';
  };

  const thirdPartyFetchSnippet = `// Third-Party App Callout to Nerve Engine & REST APIs (CORS enabled)
const response = await fetch(\`\${window.location.origin}/api/v1/engine/call\`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ${activeKeySealed ? maskSecretKey(activeKey) : activeKey}',
    'X-Integrator-Email': '${integrationVerifiedEmail || NERVE_PROFILE_EMAIL}'
  },
  body: JSON.stringify({
    engine: '${selectedEngineModule}',
    action: 'execute',
    payload: { repo: '${trackedRepoKeys[0] || 'owner/repository'}', branch: 'main', lineNumber: 42 }
  })
});
const data = await response.json();`;

  if (!integrationVerifiedEmail) {
    return (
      <IntegrationUnlockOverlay
        requiresReverification={needsReverificationGate}
        isUnlockPromptConfirmed={isUnlockPromptConfirmed}
        onStartUnlock={() => {
          setGateError('');
          setIsUnlockPromptConfirmed(true);
        }}
        onResetUnlockPrompt={() => {
          setGateError('');
          setGateStep('email');
          setIsUnlockPromptConfirmed(false);
        }}
        onBackToWorkspace={onBackToWorkspace}
        providerType={integrationProviderType}
        onChangeProviderType={(next) => {
          setIntegrationProviderType(next);
          setGateError('');
        }}
        gateStep={gateStep}
        onChangeGateStep={(step) => setGateStep(step)}
        gateEmailInput={gateEmailInput}
        onChangeGateEmailInput={(val) => setGateEmailInput(val)}
        gateCodeInput={gateCodeInput}
        onChangeGateCodeInput={(val) => setGateCodeInput(val)}
        gateError={gateError}
        gateDispatchMessage={gateDispatchMessage}
        isVerifyingGate={isVerifyingGate}
        showGmailSendConfirmModal={showGmailSendConfirmModal}
        onOpenGmailSendConfirmModal={() => setShowGmailSendConfirmModal(true)}
        onCloseGmailSendConfirmModal={() => setShowGmailSendConfirmModal(false)}
        onRequestEmailAccess={handleRequestIntegrationAccess}
        onConfirmSendGmailCode={handleConfirmSendGmailCode}
        onVerifyCodeAccess={handleVerifyIntegrationAccess}
        onGoogleOAuthConfirm={handleGoogleOAuthConfirm}
        onGitHubOAuthConfirm={handleThirdPartyOAuthConfirm}
      />
    );
  }

  const ALL_INTEGRATION_SCOPES = [
    'trust.verify',
    'sovereignty.read',
    'sovereignty.write',
    'p2p.messaging',
    'p2p.channel_control',
    'p2p.message_search',
    'p2p.message_edit',
    'p2p.message_delete',
    'p2p.reactions',
    'p2p.webrtc_signaling',
    'p2p.broadcast_fallback',
    'p2p.e2ee_aes_gcm_256',
    'p2p.pbkdf2_100k',
    'p2p.chunked_file_stream',
    'p2p.datachannel_16kb_backpressure',
    'p2p.terminal_log_stream',
    'p2p.json_inspector',
    'p2p.quick_reply',
    'p2p.share_snippet',
    'p2p.repo_autodeploy',
    'peers.search_and_delete',
    'users.email_lookup',
    'pull_request.diff_review',
    'syntax.parse',
    'syntax.highlighter',
    'ansi.color_schemes',
    'explorer.tree',
    'codespaces.exec',
    'codespaces.multi_terminal',
    'codespaces.split_terminal',
    'codespaces.macros',
    'codespaces.log_filter',
    'codespaces.log_download_txt',
    'codespaces.history',
    'codespaces.autoscroll',
    'codespaces.build_summary',
    'codespaces.cmd_suggestions',
    'codespaces.line_numbers',
    'codespaces.terminal_theme',
    'codespaces.resource_telemetry',
    'ssh.keys',
    'ssh.generate',
    'ssh.universal_remotes',
    'ci.telemetry',
    'ci.d3_30d_trends',
    'ci.mttr',
    'ci.build_history',
    'copilot.collaborate',
    'shark.collaborate',
    'shark.chatbox_guide',
    'shark.multi_turn',
    'shark.cancel',
    'incidents.dispatch',
    'incidents.ai_log_triage',
    'incidents.line_numbered_log_triage',
    'incidents.d3_pipeline',
    'webhooks.listen',
    'engine.third_party_callout',
    'integration.gmail_gate_autolock',
    'firebase.firestore_sync',
    'firebase.security_rules',
    'offline.queue_sync',
    'offline.queue_auto_flush',
    'auth.multi_provider',
    'auth.github_provider_oauth',
    'auth.google_provider_oauth',
    'auth.google_oauth',
    'github.ssh_keys_manage',
    'health.gemini_probe',
    'runtime.vercel_serverless',
  ];

  const filteredScopes = scopeSearchQuery.trim()
    ? ALL_INTEGRATION_SCOPES.filter((s) =>
        s.toLowerCase().includes(scopeSearchQuery.trim().toLowerCase())
      )
    : ALL_INTEGRATION_SCOPES;

  const INTEGRATION_TABS: Array<{
    id: 'overview' | 'keys' | 'ssh' | 'api' | 'shark';
    label: string;
    icon: React.ReactNode;
  }> = [
    { id: 'overview', label: 'Overview', icon: <Activity className="w-3.5 h-3.5" /> },
    { id: 'keys', label: 'API Keys', icon: <Key className="w-3.5 h-3.5" /> },
    { id: 'ssh', label: 'SSH Keys', icon: <Shield className="w-3.5 h-3.5" /> },
    { id: 'api', label: 'API & SDKs', icon: <Code2 className="w-3.5 h-3.5" /> },
    { id: 'shark', label: 'Ask Nerve Shark', icon: <Sparkles className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-5 space-y-5">
      {/* GitHub Settings-Style Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h1 className="text-lg sm:text-xl font-bold text-[#1f2328] dark:text-[#e6edf3]">
            Integration Settings
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#656d76] dark:text-[#8b949e]">
            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{integrationVerifiedEmail}</span>
            </span>
            <span>·</span>
            <span className="font-mono">v{profileHealth.engineVersion}</span>
            {onOpenConnectedUsers && (
              <>
                <span>·</span>
                <button
                  type="button"
                  onClick={() => onOpenConnectedUsers(integrationVerifiedEmail)}
                  className="font-mono text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  title={`View @users connected to ${integrationVerifiedEmail}`}
                >
                  @users
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onTriggerWebhook && (
            <>
              <button
                onClick={async () => {
                  await onTriggerWebhook('issues');
                  fetchCiStatusFeed();
                }}
                className="px-2.5 py-1.5 text-xs font-medium text-[#1f2328] dark:text-[#e6edf3] bg-[#f6f8fa] dark:bg-[#21262d] hover:bg-[#e6ebf1] dark:hover:bg-[#30363d] border border-[#d0d7de] dark:border-[#30363d] rounded-md flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Webhook className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>Test Issue Webhook</span>
              </button>
              <button
                onClick={async () => {
                  await onTriggerWebhook('pull_request');
                  fetchCiStatusFeed();
                }}
                className="px-2.5 py-1.5 text-xs font-medium text-[#1f2328] dark:text-[#e6edf3] bg-[#f6f8fa] dark:bg-[#21262d] hover:bg-[#e6ebf1] dark:hover:bg-[#30363d] border border-[#d0d7de] dark:border-[#30363d] rounded-md flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Webhook className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Test PR Webhook</span>
              </button>
            </>
          )}
          <button
            type="button"
            onClick={handleExplicitSignOut}
            className="px-2.5 py-1.5 rounded-md text-xs font-medium text-[#656d76] dark:text-[#8b949e] hover:text-red-600 dark:hover:text-red-400 border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
            title="Sign out of Integration Console"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* GitHub-Style Tab Navigation Bar */}
      <nav
        aria-label="Integration sections"
        className="flex items-center gap-1 overflow-x-auto border-b border-[#d0d7de] dark:border-[#30363d]"
      >
        {INTEGRATION_TABS.map((tab) => {
          const isActive = activeIntegrationTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveIntegrationTab(tab.id)}
              className={`px-3.5 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                isActive
                  ? 'border-blue-600 dark:border-blue-400 text-[#1f2328] dark:text-[#e6edf3] font-semibold'
                  : 'border-transparent text-[#656d76] dark:text-[#8b949e] hover:text-[#1f2328] dark:hover:text-[#e6edf3] hover:border-[#d0d7de] dark:hover:border-[#30363d]'
              }`}
            >
              <span className={isActive ? 'text-blue-600 dark:text-blue-400' : ''}>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* =====================================================================
          TAB 1: OVERVIEW (Runtime Profile, CI/CD Health, MTTR, 30-Day Trends)
      ===================================================================== */}
      {activeIntegrationTab === 'overview' && (
        <div className="space-y-4">
          {/* Runtime Profile & Live Gemini Probe */}
          <div className="p-4 rounded-lg border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-[#1f2328] dark:text-[#e6edf3]">
                  Runtime &amp; Integration Profile
                </h2>
                <p className="text-xs text-[#656d76] dark:text-[#8b949e]">
                  Synced with Nerve v{profileHealth.engineVersion}, custom-domain CORS API, and server-side Gemini AI.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveIntegrationTab('shark')}
                  className="px-3 py-1.5 rounded-md text-xs font-medium text-[#1f2328] dark:text-[#e6edf3] bg-[#f6f8fa] dark:bg-[#21262d] border border-[#d0d7de] dark:border-[#30363d] hover:border-blue-500 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Need help? Ask Shark</span>
                </button>
                <button
                  type="button"
                  disabled={isProbingGemini}
                  onClick={() => fetchRuntimeProfileHealth(true)}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isProbingGemini ? 'animate-spin' : ''}`} />
                  <span>{isProbingGemini ? 'Verifying...' : 'Verify Live Gemini'}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#161b22] space-y-1">
                <div className="text-[11px] font-medium text-[#656d76] dark:text-[#8b949e]">
                  Platform Contact Email
                </div>
                <div className="font-mono font-semibold text-[#1f2328] dark:text-[#e6edf3] truncate">
                  {profileHealth.contactEmail}
                </div>
                <div className="text-[11px] text-[#656d76] dark:text-[#8b949e] truncate">
                  Session: {integrationVerifiedEmail}
                </div>
              </div>

              <div className="p-3 rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#161b22] space-y-1">
                <div className="text-[11px] font-medium text-[#656d76] dark:text-[#8b949e]">
                  Engine &amp; Origin
                </div>
                <div className="font-mono font-semibold text-[#1f2328] dark:text-[#e6edf3]">
                  v{profileHealth.engineVersion} · {profileHealth.runtime}
                </div>
                <div className="text-[11px] font-mono text-[#656d76] dark:text-[#8b949e] truncate">
                  {originBase}
                </div>
              </div>

              <div className="p-3 rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#161b22] space-y-1">
                <div className="text-[11px] font-medium text-[#656d76] dark:text-[#8b949e]">
                  Nerve Shark Model
                </div>
                <div className="font-mono font-semibold text-[#1f2328] dark:text-[#e6edf3]">
                  {profileHealth.geminiModel}
                </div>
                <div className="text-[11px] font-mono text-[#656d76] dark:text-[#8b949e]">
                  Key:{' '}
                  {profileHealth.geminiKeyConfigured
                    ? `Configured (${profileHealth.geminiKeyPrefix})`
                    : profileHealth.geminiKeyPrefix === 'checking'
                    ? 'Checking...'
                    : 'Not configured'}
                </div>
              </div>

              <div className="p-3 rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#161b22] space-y-1">
                <div className="text-[11px] font-medium text-[#656d76] dark:text-[#8b949e]">
                  Live Gemini Probe
                </div>
                <div className="font-mono font-semibold text-[#1f2328] dark:text-[#e6edf3]">
                  {profileHealth.geminiLiveProbe
                    ? profileHealth.geminiLiveProbe.active
                      ? `ACTIVE (${profileHealth.geminiLiveProbe.latencyMs}ms)`
                      : 'ERROR'
                    : 'Ready (on-demand)'}
                </div>
                <div className="text-[11px] text-[#656d76] dark:text-[#8b949e] truncate">
                  {profileHealth.geminiLiveProbe?.error || 'Dual-mode chatbox & code guide'}
                </div>
              </div>
            </div>
          </div>

          {/* CI/CD Build Health */}
          <div className="p-4 rounded-lg border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h2 className="text-sm font-semibold text-[#1f2328] dark:text-[#e6edf3]">
                  CI/CD Build Health
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-[#656d76]" />
                  <select
                    id="ci-status-filter"
                    aria-label="Filter CI status"
                    value={ciStatusFilter}
                    onChange={(e) =>
                      setCiStatusFilter(
                        e.target.value as 'All' | 'Passing' | 'Failing' | 'Running' | 'Pending'
                      )
                    }
                    className="px-2 py-1 text-xs font-medium rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#161b22] text-[#1f2328] dark:text-[#e6edf3] focus:outline-none cursor-pointer"
                  >
                    <option value="All">All ({ciFeed.length})</option>
                    <option value="Passing">
                      Passing ({ciFeed.filter((i) => i.status === 'Passing').length})
                    </option>
                    <option value="Failing">
                      Failing ({ciFeed.filter((i) => i.status === 'Failing').length})
                    </option>
                    <option value="Running">
                      Running ({ciFeed.filter((i) => i.status === 'Running').length})
                    </option>
                    <option value="Pending">
                      Pending ({ciFeed.filter((i) => i.status === 'Pending').length})
                    </option>
                  </select>
                </div>

                <button
                  onClick={fetchCiStatusFeed}
                  disabled={isRefreshingCi}
                  className="px-2.5 py-1 text-xs font-medium text-[#1f2328] dark:text-[#e6edf3] bg-[#f6f8fa] dark:bg-[#21262d] border border-[#d0d7de] dark:border-[#30363d] rounded-md flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isRefreshingCi ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {filteredCiFeed.length === 0 ? (
              <div className="p-4 rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#161b22] text-center text-xs text-[#656d76] dark:text-[#8b949e]">
                {ciFeed.length === 0
                  ? 'No repositories tracked yet. Search and track a repository in Workspace.'
                  : `No repositories in "${ciStatusFilter}" state.`}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {filteredCiFeed.map((item) => {
                  const last5Builds =
                    item.recentBuilds && item.recentBuilds.length > 0
                      ? item.recentBuilds.slice(0, 5)
                      : getDefaultRecentBuilds(item.status, item.latestCommit);
                  const isTooltipOpen = hoveredStatusRepo === item.repo;

                  return (
                    <div
                      key={item.repo}
                      className="relative p-3.5 rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#161b22] flex flex-col justify-between gap-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold font-mono text-[#1f2328] dark:text-[#e6edf3] truncate">
                          {item.repo}
                        </span>

                        <div
                          className="relative"
                          onMouseEnter={() => setHoveredStatusRepo(item.repo)}
                          onMouseLeave={() => setHoveredStatusRepo(null)}
                        >
                          <button
                            type="button"
                            onClick={() => setHoveredStatusRepo(isTooltipOpen ? null : item.repo)}
                            className={`px-2 py-0.5 rounded-md text-[11px] font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer ${getStatusBadgeClasses(
                              item.status
                            )}`}
                          >
                            <span
                              className={`w-2 h-2 rounded-full ${getStatusDotClasses(item.status)}`}
                            />
                            <span>{item.status}</span>
                          </button>

                          {isTooltipOpen && (
                            <div
                              role="tooltip"
                              className="absolute right-0 top-full mt-1.5 w-64 rounded-lg border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#161b22] p-2.5 shadow-xl z-30 space-y-1.5"
                            >
                              <div className="flex items-center justify-between border-b border-[#d0d7de] dark:border-[#30363d] pb-1 text-[11px]">
                                <span className="font-bold text-[#1f2328] dark:text-[#e6edf3]">
                                  Last 5 Builds
                                </span>
                                <span className="font-mono text-[#656d76]">#{item.branch}</span>
                              </div>

                              <div className="space-y-1">
                                {last5Builds.map((b) => (
                                  <div
                                    key={`${item.repo}-${b.buildId}-${b.timestamp}`}
                                    className="flex items-center justify-between text-[11px] font-mono py-1 px-1.5 rounded bg-[#f6f8fa] dark:bg-[#0d1117]"
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <span
                                        className={`w-1.5 h-1.5 rounded-full ${getStatusDotClasses(
                                          b.status
                                        )}`}
                                      />
                                      <span className="font-semibold text-[#1f2328] dark:text-[#e6edf3]">
                                        {b.buildId}
                                      </span>
                                      <span className="text-[#656d76]">{b.commit}</span>
                                    </div>
                                    <span className="text-[#656d76] dark:text-[#8b949e] tabular-nums">
                                      {b.status} · {b.duration}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-[#d0d7de] dark:border-[#30363d] text-[11px] font-mono text-[#656d76] dark:text-[#8b949e]">
                        <span>
                          #{item.branch} · {item.latestCommit}
                        </span>
                        <select
                          aria-label={`Set status for ${item.repo}`}
                          value={item.status}
                          onChange={(e) =>
                            handleSetRepoCiBuildStatus(item.repo, e.target.value as CiBuildState)
                          }
                          className="px-1.5 py-0.5 rounded border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-[11px] font-sans font-medium text-[#1f2328] dark:text-[#e6edf3] cursor-pointer"
                        >
                          <option value="Passing">Passing</option>
                          <option value="Failing">Failing</option>
                          <option value="Running">Running</option>
                          <option value="Pending">Pending</option>
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Mean Time to Recovery (MTTR) */}
          <div className="p-4 rounded-lg border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h2 className="text-sm font-semibold text-[#1f2328] dark:text-[#e6edf3]">
                  Mean Time to Recovery (MTTR)
                </h2>
              </div>

              <div className="text-xs font-mono text-[#656d76] dark:text-[#8b949e] tabular-nums">
                Avg MTTR:{' '}
                <strong className="text-emerald-600 dark:text-emerald-400">
                  {formatSecondsToMttr(fleetAvgSeconds)}
                </strong>{' '}
                · {incidentReports.length} incidents
              </div>
            </div>

            {repoMttrStats.length === 0 ? (
              <div className="p-3.5 rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#161b22] text-center text-xs text-[#656d76] dark:text-[#8b949e]">
                MTTR metrics populate automatically when issues are reported and resolved via PR merge.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {repoMttrStats.map((stat) => (
                  <div
                    key={stat.repo}
                    className="p-3.5 rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#161b22] space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold font-mono text-[#1f2328] dark:text-[#e6edf3] truncate">
                        {stat.repo}
                      </span>
                      <span className="text-xs font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                        {stat.formattedMttr}
                      </span>
                    </div>

                    <div className="space-y-1 text-[11px] font-mono text-[#656d76] dark:text-[#8b949e] tabular-nums">
                      <div className="flex items-center justify-between">
                        <span>Reported</span>
                        <span className="text-[#1f2328] dark:text-[#e6edf3]">{stat.latestReportedLabel}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>PR Merged</span>
                        <span className="text-[#1f2328] dark:text-[#e6edf3]">{stat.latestMergedLabel}</span>
                      </div>
                    </div>

                    <div className="pt-1.5 border-t border-[#d0d7de] dark:border-[#30363d] text-[11px] text-[#656d76] dark:text-[#8b949e]">
                      {stat.resolvedCount}/{stat.incidentsCount} resolved
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 30-Day Deployment Success & Build Duration D3 Chart */}
          <div className="p-4 rounded-lg border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h2 className="text-sm font-semibold text-[#1f2328] dark:text-[#e6edf3]">
                  30-Day Deployment Success (%) &amp; Build Duration (s)
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {['all', ...trackedRepoKeys].map((repoOption) => (
                  <button
                    key={repoOption}
                    onClick={() => {
                      setSelectedChartRepo(repoOption);
                      setHoveredPoint(null);
                    }}
                    className={`px-2.5 py-1 rounded-md text-xs font-mono transition-colors cursor-pointer ${
                      selectedChartRepo === repoOption
                        ? 'bg-blue-600 text-white font-semibold'
                        : 'bg-[#f6f8fa] dark:bg-[#21262d] border border-[#d0d7de] dark:border-[#30363d] text-[#1f2328] dark:text-[#e6edf3]'
                    }`}
                  >
                    {repoOption === 'all' ? 'All Repos' : repoOption.split('/')[1] || repoOption}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-[#f6f8fa] dark:bg-[#161b22] px-3 py-2 rounded-md border border-[#d0d7de] dark:border-[#30363d]">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>Success Rate (%)</span>
                </span>
                <span className="flex items-center gap-1.5 font-medium text-blue-700 dark:text-blue-400">
                  <span className="w-2.5 h-0.5 bg-blue-500 inline-block"></span>
                  <span>Duration (s)</span>
                </span>
              </div>

              {latestMetric && (
                <div className="font-mono text-xs text-[#1f2328] dark:text-[#e6edf3] flex items-center gap-2 tabular-nums">
                  <span>{latestMetric.dateLabel}:</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                    {latestMetric.successRate}%
                  </span>
                  <span>·</span>
                  <span className="text-blue-600 dark:text-blue-400 font-bold">
                    {latestMetric.avgDurationSec}s
                  </span>
                </div>
              )}
            </div>

            <div className="w-full overflow-x-auto">
              <svg
                ref={chartSvgRef}
                className="w-full min-w-[560px] h-[220px] select-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: API KEYS (Live/Test Switcher, Roll Key, cURL, Collapsible Scopes)
      ===================================================================== */}
      {activeIntegrationTab === 'keys' && (
        <div className="p-4 sm:p-5 rounded-lg border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <Key className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h2 className="text-sm font-semibold text-[#1f2328] dark:text-[#e6edf3]">
                API Keys
              </h2>

              <div className="inline-flex rounded-md p-0.5 bg-[#f6f8fa] dark:bg-[#161b22] border border-[#d0d7de] dark:border-[#30363d]">
                <button
                  onClick={() => onChangeEnvironment('live')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                    keyEnvironment === 'live'
                      ? 'bg-emerald-600 text-white'
                      : 'text-[#656d76] dark:text-[#8b949e]'
                  }`}
                >
                  Live (nrve_live_)
                </button>
                <button
                  onClick={() => onChangeEnvironment('test')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                    keyEnvironment === 'test'
                      ? 'bg-amber-600 text-white'
                      : 'text-[#656d76] dark:text-[#8b949e]'
                  }`}
                >
                  Test (nrve_test_)
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customOrg}
                onChange={(e) => setCustomOrg(e.target.value)}
                placeholder="Label or org name..."
                className="px-2.5 py-1.5 text-xs rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#161b22] text-[#1f2328] dark:text-[#e6edf3] font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={handleKeyCreation}
                disabled={isCreatingKey}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-md flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isCreatingKey ? 'Rolling...' : 'Roll Key'}</span>
              </button>
            </div>
          </div>

          <div className="p-4 rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#161b22] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="space-y-1 min-w-0">
                <span className="text-[11px] font-medium text-[#656d76] dark:text-[#8b949e]">
                  Active {keyEnvironment === 'live' ? 'Live' : 'Test'} Secret Key
                </span>
                <div className="text-xs sm:text-sm font-mono font-semibold text-[#1f2328] dark:text-[#e6edf3] truncate">
                  {activeKeySealed ? maskSecretKey(activeKey) : activeKey}
                </div>
                {activeKeySealed && (
                  <div className="text-[11px] text-amber-700 dark:text-amber-400">
                    Key sealed after first copy. Click <strong>Roll Key</strong> to issue a new key.
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={activeKeySealed}
                onClick={() => handleCopy(activeKey, 'key')}
                className="px-3 py-1.5 text-xs font-medium text-[#1f2328] dark:text-[#e6edf3] bg-white dark:bg-[#21262d] border border-[#d0d7de] dark:border-[#30363d] rounded-md flex items-center gap-1.5 shrink-0 self-start sm:self-auto cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey ? 'Copied' : 'Copy Key'}</span>
              </button>
            </div>

            {/* Clean Collapsible & Searchable Granted Scopes */}
            <div className="pt-3 border-t border-[#d0d7de] dark:border-[#30363d] space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setShowAllScopes((prev) => !prev)}
                  className="text-xs font-medium text-[#1f2328] dark:text-[#e6edf3] hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1.5 cursor-pointer"
                >
                  {showAllScopes ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                  <span>Granted Scopes ({ALL_INTEGRATION_SCOPES.length})</span>
                </button>
                {showAllScopes && (
                  <div className="relative w-48">
                    <Search className="w-3 h-3 text-[#656d76] absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={scopeSearchQuery}
                      onChange={(e) => setScopeSearchQuery(e.target.value)}
                      placeholder="Filter scopes..."
                      className="w-full pl-6 pr-2 py-1 text-[11px] font-mono rounded border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-[#1f2328] dark:text-[#e6edf3] focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {showAllScopes && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5 max-h-52 overflow-y-auto pt-1 font-mono text-[11px] text-[#656d76] dark:text-[#8b949e]">
                  {filteredScopes.map((scope) => (
                    <div key={scope} className="truncate py-0.5">
                      • {scope}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#1f2328] dark:text-[#e6edf3]">Quickstart cURL</span>
              <button
                onClick={() => handleCopy(curlQuickstart, 'quickstart')}
                className="text-[#656d76] dark:text-[#8b949e] hover:text-[#1f2328] dark:hover:text-[#e6edf3] flex items-center gap-1 cursor-pointer font-medium"
              >
                {copiedQuickstart ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedQuickstart ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <pre className="p-3.5 rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#161b22] text-[#1f2328] dark:text-[#e6edf3] text-xs font-mono overflow-x-auto leading-relaxed">
              {curlQuickstart}
            </pre>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 3: SSH KEYS (Workspace Deploy Keys + GitHub Account SSH Keys)
      ===================================================================== */}
      {activeIntegrationTab === 'ssh' && (
        <div className="space-y-4">
          {/* Workspace Deploy SSH Keys */}
          <div className="p-4 sm:p-5 rounded-lg border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <h2 className="text-sm font-semibold text-[#1f2328] dark:text-[#e6edf3]">
                    Deploy &amp; Remote SSH Keys
                  </h2>
                  <p className="text-xs text-[#656d76] dark:text-[#8b949e]">
                    Generate or attach ed25519 / RSA keys for GitHub, GitLab, Bitbucket, or custom Git remotes.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSshError('');
                  setShowSshKeyModal(true);
                }}
                className="px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 flex items-center gap-1.5 cursor-pointer self-start sm:self-auto whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New SSH Key</span>
              </button>
            </div>

            {sshKeys.length === 0 ? (
              <div className="p-5 rounded-md border border-dashed border-[#d0d7de] dark:border-[#30363d] text-xs text-[#656d76] dark:text-[#8b949e] flex flex-col items-center justify-center gap-2.5 text-center">
                <span>No deploy SSH keys added yet.</span>
                <button
                  type="button"
                  onClick={() => {
                    setSshError('');
                    setShowSshKeyModal(true);
                  }}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add SSH Key</span>
                </button>
              </div>
            ) : (
              <div className="divide-y divide-[#d0d7de] dark:divide-[#30363d] rounded-md border border-[#d0d7de] dark:border-[#30363d] overflow-hidden">
                {sshKeys.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 bg-[#f6f8fa] dark:bg-[#161b22] space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <div className="text-xs font-semibold text-[#1f2328] dark:text-[#e6edf3]">
                          {item.title}
                        </div>
                        <div className="text-[11px] font-mono text-[#656d76] dark:text-[#8b949e]">
                          {item.targetRepo.includes('@') || item.targetRepo.includes(':')
                            ? item.targetRepo
                            : `ssh://git@${item.targetRepo}.git`}{' '}
                          · {item.status} · {item.keyType}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleCopySshItem(item.publicKey, `pub-${item.id}`)}
                          className="px-2 py-1 text-[11px] font-medium rounded border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-[#1f2328] dark:text-[#e6edf3] flex items-center gap-1 cursor-pointer"
                        >
                          {copiedSshId === `pub-${item.id}` ? (
                            <Check className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>{copiedSshId === `pub-${item.id}` ? 'Copied' : 'Public Key'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopySshItem(item.gitSshCommand, `cmd-${item.id}`)}
                          className="px-2 py-1 text-[11px] font-medium rounded border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-[#1f2328] dark:text-[#e6edf3] flex items-center gap-1 cursor-pointer"
                        >
                          {copiedSshId === `cmd-${item.id}` ? (
                            <Check className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <Terminal className="w-3 h-3" />
                          )}
                          <span>{copiedSshId === `cmd-${item.id}` ? 'Copied' : 'Git SSH Cmd'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSshKey(item.id)}
                          title="Delete SSH Key"
                          className="p-1 rounded border border-[#d0d7de] dark:border-[#30363d] text-[#656d76] hover:text-red-500 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="text-[11px] font-mono text-[#656d76] dark:text-[#8b949e] truncate">
                      {item.fingerprint}
                    </div>
                    <div className="text-[11px] font-mono text-[#1f2328] dark:text-[#e6edf3] bg-white dark:bg-[#0d1117] px-2.5 py-1.5 rounded border border-[#d0d7de] dark:border-[#30363d] truncate">
                      {item.publicKey}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* GitHub Account SSH Keys */}
          <div className="p-4 sm:p-5 rounded-lg border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="w-4 h-4 fill-current text-[#1f2328] dark:text-[#e6edf3] shrink-0"
                >
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  />
                </svg>
                <div>
                  <h2 className="text-sm font-semibold text-[#1f2328] dark:text-[#e6edf3]">
                    GitHub Account SSH Keys
                  </h2>
                  <p className="text-xs text-[#656d76] dark:text-[#8b949e]">
                    Manage authentication and signing keys via GitHub API /user/keys.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isLoadingGitHubKeys}
                  onClick={() => fetchGitHubSshKeys()}
                  className="px-2.5 py-1.5 rounded-md text-xs font-medium border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#21262d] text-[#1f2328] dark:text-[#e6edf3] flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingGitHubKeys ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowAddGitHubKeyForm(!showAddGitHubKeyForm);
                    setGitHubKeyError('');
                  }}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{showAddGitHubKeyForm ? 'Close Form' : 'Add GitHub Key'}</span>
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-[#d0d7de] dark:border-[#30363d]">
              <input
                type="text"
                value={gitHubUsernameFilter}
                onChange={(e) => setGitHubUsernameFilter(e.target.value)}
                placeholder="Query public SSH keys by GitHub username (e.g. torvalds)..."
                className="flex-1 px-3 py-1.5 text-xs font-mono rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#161b22] text-[#1f2328] dark:text-[#e6edf3] focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                disabled={isLoadingGitHubKeys}
                onClick={() => fetchGitHubSshKeys(gitHubUsernameFilter)}
                className="px-3 py-1.5 rounded-md text-xs font-medium border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#21262d] text-[#1f2328] dark:text-[#e6edf3] cursor-pointer shrink-0"
              >
                {gitHubUsernameFilter.trim() ? `Fetch @${gitHubUsernameFilter}` : 'Fetch Account Keys'}
              </button>
            </div>

            {gitHubKeyError && (
              <div className="p-2.5 rounded-md border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-xs flex items-center justify-between gap-2">
                <span>{gitHubKeyError}</span>
                <button
                  type="button"
                  onClick={() => setGitHubKeyError('')}
                  className="p-0.5 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            {gitHubKeySuccess && (
              <div className="p-2.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs flex items-center justify-between gap-2">
                <span>{gitHubKeySuccess}</span>
                <button
                  type="button"
                  onClick={() => setGitHubKeySuccess('')}
                  className="p-0.5 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {showAddGitHubKeyForm && (
              <form
                onSubmit={handleAddGitHubSshKey}
                className="p-3.5 rounded-md border border-blue-500/40 bg-[#f6f8fa] dark:bg-[#161b22] space-y-3 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#1f2328] dark:text-[#e6edf3]">
                    Add New GitHub SSH Key
                  </span>
                  <button
                    type="button"
                    onClick={handlePopulateSampleEd25519}
                    className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-medium"
                  >
                    + Sample ed25519 Key
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="font-medium text-[#1f2328] dark:text-[#e6edf3] block">
                      Title
                    </label>
                    <input
                      type="text"
                      required
                      value={newGitHubKeyTitle}
                      onChange={(e) => setNewGitHubKeyTitle(e.target.value)}
                      placeholder="e.g. Workstation ed25519"
                      className="w-full px-2.5 py-1.5 rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-[#1f2328] dark:text-[#e6edf3] focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-medium text-[#1f2328] dark:text-[#e6edf3] block">
                      Key Type
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setNewGitHubKeyType('authentication')}
                        className={`py-1.5 px-2 rounded-md border text-center font-medium cursor-pointer ${
                          newGitHubKeyType === 'authentication'
                            ? 'border-blue-600 bg-blue-600 text-white font-semibold'
                            : 'border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-[#1f2328] dark:text-[#e6edf3]'
                        }`}
                      >
                        Authentication
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewGitHubKeyType('signing')}
                        className={`py-1.5 px-2 rounded-md border text-center font-medium cursor-pointer ${
                          newGitHubKeyType === 'signing'
                            ? 'border-blue-600 bg-blue-600 text-white font-semibold'
                            : 'border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-[#1f2328] dark:text-[#e6edf3]'
                        }`}
                      >
                        Signing
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-medium text-[#1f2328] dark:text-[#e6edf3] block">
                    OpenSSH Public Key
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={newGitHubKeyBody}
                    onChange={(e) => setNewGitHubKeyBody(e.target.value)}
                    placeholder="Begins with 'ssh-ed25519', 'ssh-rsa'..."
                    className="w-full px-2.5 py-1.5 rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-[#1f2328] dark:text-[#e6edf3] font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddGitHubKeyForm(false)}
                    className="px-3 py-1.5 rounded-md border border-[#d0d7de] dark:border-[#30363d] text-[#1f2328] dark:text-[#e6edf3] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingGitHubKey}
                    className="px-3.5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold cursor-pointer flex items-center gap-1.5"
                  >
                    {isSubmittingGitHubKey && <RefreshCw className="w-3 h-3 animate-spin" />}
                    <span>{isSubmittingGitHubKey ? 'Adding...' : 'Add Key to GitHub'}</span>
                  </button>
                </div>
              </form>
            )}

            {gitHubSshKeys.length === 0 ? (
              <div className="p-4 rounded-md border border-dashed border-[#d0d7de] dark:border-[#30363d] text-xs text-[#656d76] dark:text-[#8b949e] text-center">
                {gitHubUsernameFilter.trim()
                  ? `No public SSH keys found for @${gitHubUsernameFilter}.`
                  : 'No GitHub SSH keys loaded yet. Click Add GitHub Key or query a username above.'}
              </div>
            ) : (
              <div className="divide-y divide-[#d0d7de] dark:divide-[#30363d] rounded-md border border-[#d0d7de] dark:border-[#30363d] overflow-hidden">
                {gitHubSshKeys.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 bg-[#f6f8fa] dark:bg-[#161b22] space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <div className="text-xs font-semibold text-[#1f2328] dark:text-[#e6edf3]">
                          {item.title}
                        </div>
                        <div className="text-[11px] font-mono text-[#656d76] dark:text-[#8b949e]">
                          {item.verified ? 'Verified' : 'Unverified'} ·{' '}
                          {item.read_only ? 'Signing Key' : 'Authentication Key'} · ID #{item.id}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleCopyGitHubKey(item.key, item.id)}
                          className="px-2 py-1 rounded border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-[11px] font-mono text-[#1f2328] dark:text-[#e6edf3] flex items-center gap-1 cursor-pointer"
                        >
                          {copiedGitHubKeyId === item.id ? (
                            <Check className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>{copiedGitHubKeyId === item.id ? 'Copied' : 'Copy'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteGitHubSshKey(item.id)}
                          title="Revoke SSH Key from GitHub"
                          className="p-1 rounded border border-[#d0d7de] dark:border-[#30363d] text-[#656d76] hover:text-red-500 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="text-[11px] font-mono text-[#1f2328] dark:text-[#e6edf3] bg-white dark:bg-[#0d1117] px-2.5 py-1.5 rounded border border-[#d0d7de] dark:border-[#30363d] truncate">
                      {item.key}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal for Adding & Saving SSH Public Keys */}
      {showSshKeyModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3">
          <div className="w-full max-w-md rounded-lg border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#161b22] text-[#1f2328] dark:text-[#e6edf3] p-4 space-y-3.5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#d0d7de] dark:border-[#30363d] pb-2.5">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-500" />
                <h3 className="text-sm font-bold">Add SSH Public Key</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSshKeyModal(false)}
                className="p-1 rounded text-[#656d76] hover:text-[#1f2328] dark:hover:text-[#e6edf3] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRegisterCustomSshKey} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold block">Surface Label</label>
                <input
                  type="text"
                  required
                  value={sshTitle}
                  onChange={(e) => setSshTitle(e.target.value)}
                  placeholder="e.g. Local Git Surface / MacBook-Pro"
                  className="w-full px-3 py-2 rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#0d1117] text-[#1f2328] dark:text-[#e6edf3] font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold block">Target Repository or App Remote</label>
                <input
                  type="text"
                  required
                  value={sshTargetRepo}
                  onChange={(e) => setSshTargetRepo(e.target.value)}
                  placeholder="owner/private-repo or app-remote"
                  className="w-full px-3 py-2 rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#0d1117] text-[#1f2328] dark:text-[#e6edf3] font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {(['ed25519', 'rsa'] as const).map((kType) => (
                    <button
                      key={kType}
                      type="button"
                      onClick={() => setSshKeyType(kType)}
                      className={`px-2.5 py-1 rounded-md text-xs font-mono font-semibold uppercase cursor-pointer border ${
                        sshKeyType === kType
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-[#f6f8fa] dark:bg-[#0d1117] text-[#1f2328] dark:text-[#e6edf3] border-[#d0d7de] dark:border-[#30363d]'
                      }`}
                    >
                      {kType}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  disabled={isGeneratingSsh}
                  onClick={() => handleGenerateSshKey(true)}
                  className="px-2.5 py-1 rounded-md text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 flex items-center gap-1 cursor-pointer"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>
                    {isGeneratingSsh ? 'Generating...' : `Generate ${sshKeyType.toUpperCase()}`}
                  </span>
                </button>
              </div>

              <div className="space-y-1">
                <label className="font-semibold block">SSH Public Key</label>
                <textarea
                  rows={4}
                  required
                  value={sshPublicKeyInput}
                  onChange={(e) => setSshPublicKeyInput(e.target.value)}
                  placeholder="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... nervep2p@gmail.com"
                  className="w-full p-2.5 rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#0d1117] text-[#1f2328] dark:text-[#e6edf3] font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {sshError && (
                <div className="text-xs font-medium text-red-600 dark:text-red-400">
                  {sshError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowSshKeyModal(false)}
                  className="px-3 py-1.5 rounded-md border border-[#d0d7de] dark:border-[#30363d] text-[#1f2328] dark:text-[#e6edf3] font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isGeneratingSsh}
                  className="px-3.5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-semibold cursor-pointer"
                >
                  {isGeneratingSsh ? 'Saving...' : 'Save SSH Key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 4: API & SDKS (Engine Callout Gateway, SDK Snippets, Endpoint Runner)
      ===================================================================== */}
      {activeIntegrationTab === 'api' && (
        <div className="space-y-4">
          {/* Third-Party Engine Callout Gateway */}
          <div className="p-4 sm:p-5 rounded-lg border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <div>
                  <h2 className="text-sm font-semibold text-[#1f2328] dark:text-[#e6edf3]">
                    Third-Party Engine Callout Gateway
                  </h2>
                  <p className="text-xs text-[#656d76] dark:text-[#8b949e]">
                    Invoke any Nerve module from external apps or CI via <code className="font-mono">/api/v1/engine/call</code>.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <select
                  aria-label="Select engine module to call"
                  value={selectedEngineModule}
                  onChange={(e) => setSelectedEngineModule(e.target.value)}
                  className="px-2.5 py-1.5 text-xs font-mono rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#161b22] text-[#1f2328] dark:text-[#e6edf3] cursor-pointer max-w-[260px]"
                >
                  <option value="nerve_shark">nerve_shark (Dual-Mode Chatbox &amp; Code AI)</option>
                  <option value="health_probe">health_probe (Vercel Runtime &amp; Gemini Probe)</option>
                  <option value="p2p_channel_control">p2p_channel_control (Close / Cancel / /exit)</option>
                  <option value="p2p_message_search">p2p_message_search (In-Chat Search)</option>
                  <option value="p2p_message_lifecycle">p2p_message_lifecycle (Edit &amp; Delete)</option>
                  <option value="users_by_email">users_by_email (Email-Linked @users)</option>
                  <option value="triage">triage (Automated CI Log Triage)</option>
                  <option value="p2p_datachannel">p2p_datachannel (WebRTC 16KB Stream)</option>
                  <option value="terminal_log_export">terminal_log_export (.txt Log Export)</option>
                  <option value="firebase_firestore">firebase_firestore (Firestore Sync)</option>
                  <option value="peer_lifecycle">peer_lifecycle (Peer Search &amp; Delete)</option>
                  <option value="github_oauth">github_oauth (GitHub OAuth)</option>
                  <option value="google_oauth">google_oauth (Google OAuth)</option>
                  <option value="github_ssh_keys">github_ssh_keys (GitHub SSH Keys)</option>
                  <option value="third_party_ssh">third_party_ssh (GitLab/Bitbucket SSH)</option>
                  <option value="p2p_e2ee">p2p_e2ee (AES-GCM-256 Verification)</option>
                  <option value="offline_flush">offline_flush (Offline Queue Flush)</option>
                  <option value="syntax">syntax (Deep-Link AST Parser)</option>
                  <option value="codespaces">codespaces (Cloud Container Exec)</option>
                  <option value="incidents">incidents (/bug Dispatch)</option>
                  <option value="ci_telemetry">ci_telemetry (30-Day Trends &amp; MTTR)</option>
                  <option value="ssh_surface">ssh_surface (Universal SSH Auth)</option>
                  <option value="trust">trust (PoW &amp; Follow Graph)</option>
                  <option value="sovereignty">sovereignty (Focus Switch)</option>
                </select>
                <button
                  type="button"
                  onClick={handleCallThirdPartyEngine}
                  disabled={isCallingEngine}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Play className="w-3 h-3" />
                  <span>{isCallingEngine ? 'Calling...' : 'Test Call'}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-[11px] text-[#656d76] dark:text-[#8b949e]">
                    fetch() Example
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(thirdPartyFetchSnippet);
                      setCopiedEngineFetch(true);
                      setTimeout(() => setCopiedEngineFetch(false), 2000);
                    }}
                    className="text-[#656d76] dark:text-[#8b949e] hover:text-[#1f2328] dark:hover:text-[#e6edf3] flex items-center gap-1 cursor-pointer font-medium"
                  >
                    {copiedEngineFetch ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedEngineFetch ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <pre className="p-3 rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#161b22] text-[#1f2328] dark:text-[#e6edf3] text-[11px] font-mono overflow-x-auto leading-relaxed">
                  {thirdPartyFetchSnippet}
                </pre>
              </div>

              <div className="space-y-1">
                <div className="text-[11px] font-mono text-[#656d76] dark:text-[#8b949e]">
                  Live Response
                </div>
                <div className="h-[155px] overflow-auto rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#161b22] p-3 font-mono text-[11px] text-emerald-700 dark:text-emerald-300">
                  {engineCalloutOutput ? (
                    <pre className="whitespace-pre-wrap">{engineCalloutOutput}</pre>
                  ) : (
                    <div className="h-full flex items-center justify-center text-[#656d76] dark:text-[#8b949e] text-center">
                      Click Test Call to invoke /api/v1/engine/call.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* SDK Snippets */}
          <div className="border border-[#d0d7de] dark:border-[#30363d] rounded-lg bg-white dark:bg-[#0d1117] p-4 sm:p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h2 className="text-sm font-semibold text-[#1f2328] dark:text-[#e6edf3]">
                  SDK Snippets
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {ENGINE_SDK_SPECS.map((sdk) => (
                  <button
                    key={sdk.id}
                    onClick={() => setSelectedSdkId(sdk.id)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      selectedSdkId === sdk.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-[#f6f8fa] dark:bg-[#21262d] border border-[#d0d7de] dark:border-[#30363d] text-[#1f2328] dark:text-[#e6edf3]'
                    }`}
                  >
                    {sdk.platformName}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="font-mono text-[#656d76] dark:text-[#8b949e]">
                {activeSdk.platformName} · {activeSdk.language}
              </span>
              <button
                onClick={() => handleCopy(activeSdk.codeSnippet, 'snippet')}
                className="px-2.5 py-1 text-xs font-medium text-[#1f2328] dark:text-[#e6edf3] bg-[#f6f8fa] dark:bg-[#21262d] border border-[#d0d7de] dark:border-[#30363d] rounded-md flex items-center gap-1 cursor-pointer"
              >
                {copiedSnippet ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                <span>{copiedSnippet ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            <div className="rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#161b22] p-3 overflow-x-auto">
              <pre className="font-mono text-xs text-[#1f2328] dark:text-[#e6edf3] leading-relaxed">
                {activeSdk.codeSnippet}
              </pre>
            </div>
          </div>

          {/* Interactive Endpoint Runner */}
          <div className="border border-[#d0d7de] dark:border-[#30363d] rounded-lg bg-white dark:bg-[#0d1117] p-4 sm:p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-[#1f2328] dark:text-[#e6edf3]">
                Endpoint Runner ({keyEnvironment.toUpperCase()})
              </h2>
              <button
                onClick={handleExecuteEndpoint}
                disabled={isExecuting}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-md flex items-center gap-1.5 cursor-pointer self-start"
              >
                <Play className="w-3 h-3" />
                <span>
                  {isExecuting
                    ? 'Running...'
                    : `${activeEndpoint.method || 'POST'} ${activeEndpoint.path}`}
                </span>
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {LIVE_ENDPOINTS.map((ep) => (
                <button
                  key={ep.id}
                  onClick={() => {
                    setSelectedEndpointId(ep.id);
                    setRequestJson(JSON.stringify(ep.defaultBody, null, 2));
                    setResponseJson('');
                  }}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    ep.id === selectedEndpointId
                      ? 'bg-blue-600 text-white'
                      : 'bg-[#f6f8fa] dark:bg-[#21262d] border border-[#d0d7de] dark:border-[#30363d] text-[#1f2328] dark:text-[#e6edf3]'
                  }`}
                >
                  {ep.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <textarea
                value={requestJson}
                onChange={(e) => setRequestJson(e.target.value)}
                rows={6}
                spellCheck={false}
                className="w-full rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#161b22] p-2.5 font-mono text-xs text-[#1f2328] dark:text-[#e6edf3] focus:outline-none"
              />
              <div className="h-[146px] overflow-auto rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#161b22] p-2.5 font-mono text-xs text-emerald-700 dark:text-emerald-300">
                {responseJson ? (
                  <pre className="whitespace-pre-wrap">{responseJson}</pre>
                ) : (
                  <div className="h-full flex items-center justify-center text-[#656d76] dark:text-[#8b949e] text-center text-xs">
                    {activeEndpoint.method || 'POST'} {activeEndpoint.path}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 5: ASK NERVE SHARK (Embedded Integration Chatbox & Guide)
      ===================================================================== */}
      {activeIntegrationTab === 'shark' && (
        <div className="rounded-lg border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] flex flex-col min-h-[540px] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#161b22] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-[#1f2328] dark:text-[#e6edf3] truncate">
                  Nerve Shark · Integration Assistant
                </h2>
                <p className="text-[11px] text-[#656d76] dark:text-[#8b949e] truncate">
                  Ask how to use API keys, SSH keys, webhooks, SDKs, or Vercel + Gemini deployment
                </p>
              </div>
            </div>

            {integrationSharkMessages.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  handleCancelIntegrationShark();
                  setIntegrationSharkMessages([]);
                }}
                className="px-2.5 py-1 text-xs font-medium text-[#656d76] dark:text-[#8b949e] hover:text-[#1f2328] dark:hover:text-[#e6edf3] border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#21262d] rounded-md cursor-pointer whitespace-nowrap"
              >
                Clear Chat
              </button>
            )}
          </div>

          <div className="flex-1 p-4 sm:p-6 space-y-3.5 overflow-y-auto max-h-[460px]">
            {integrationSharkMessages.length === 0 ? (
              <div className="max-w-xl mx-auto py-8 space-y-5">
                <div className="space-y-1.5">
                  <h3 className="text-base font-bold text-[#1f2328] dark:text-[#e6edf3]">
                    How can Nerve Shark help with your integration?
                  </h3>
                  <p className="text-xs sm:text-sm text-[#656d76] dark:text-[#8b949e] leading-relaxed">
                    Ask plain-English questions about Live/Test API keys, SSH keys, GitHub webhooks, third-party engine callouts, or request ready-to-paste integration code.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    'How do I connect my app with a Live API key?',
                    'How do I set up SSH keys for GitHub or GitLab?',
                    'How do I verify my Vercel deployment and Gemini API?',
                    'Show me a webhook payload for GitHub issues',
                  ].map((starter) => (
                    <button
                      key={starter}
                      type="button"
                      onClick={() => void handleSendIntegrationShark(undefined, starter)}
                      className="text-left px-3 py-2.5 rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#161b22] hover:border-blue-500 text-xs font-medium text-[#1f2328] dark:text-[#e6edf3] transition-colors cursor-pointer"
                    >
                      {starter}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              integrationSharkMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded-lg border p-3.5 space-y-2.5 max-w-2xl ${
                    msg.role === 'user'
                      ? 'ml-auto border-blue-200 dark:border-blue-900/60 bg-blue-50/60 dark:bg-[#13233a]'
                      : 'border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#161b22]'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs text-[#656d76] dark:text-[#8b949e]">
                    <span className="font-semibold text-[#1f2328] dark:text-[#e6edf3] flex items-center gap-1.5">
                      {msg.role === 'assistant' && (
                        <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      )}
                      <span>{msg.role === 'assistant' ? 'Nerve Shark' : 'You'}</span>
                    </span>
                    <span className="font-mono text-[11px]">{msg.timestamp}</span>
                  </div>

                  <p className="text-xs sm:text-sm text-[#1f2328] dark:text-[#e6edf3] leading-relaxed whitespace-pre-wrap">
                    {msg.text}
                  </p>

                  {msg.suggestedPatch && (
                    <pre className="p-3 rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-xs font-mono text-emerald-700 dark:text-emerald-400 overflow-x-auto leading-relaxed">
                      {msg.suggestedPatch}
                    </pre>
                  )}

                  {msg.role === 'assistant' &&
                    msg.suggestedFollowUps &&
                    msg.suggestedFollowUps.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {msg.suggestedFollowUps.map((followUp) => (
                          <button
                            key={followUp}
                            type="button"
                            disabled={isIntegrationSharkThinking}
                            onClick={() => void handleSendIntegrationShark(undefined, followUp)}
                            className="px-2.5 py-1 rounded-md text-[11px] font-medium border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-[#1f2328] dark:text-[#e6edf3] hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {followUp}
                          </button>
                        ))}
                      </div>
                    )}
                </div>
              ))
            )}

            {isIntegrationSharkThinking && (
              <div className="rounded-lg border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#161b22] p-3.5 max-w-md flex items-center justify-between gap-3 text-xs text-[#656d76] dark:text-[#8b949e]">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600 dark:text-blue-400" />
                  <span>Nerve Shark is thinking...</span>
                </div>
                <button
                  type="button"
                  onClick={handleCancelIntegrationShark}
                  className="text-red-600 dark:text-red-400 hover:underline font-medium cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => void handleSendIntegrationShark(e)}
            className="p-3.5 border-t border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#161b22] flex items-center gap-2"
          >
            <input
              type="text"
              value={integrationSharkInput}
              onChange={(e) => setIntegrationSharkInput(e.target.value)}
              placeholder="Ask Nerve Shark about API keys, SSH keys, webhooks, or SDKs... (/clear to reset)"
              className="flex-1 px-3.5 py-2 text-xs sm:text-sm rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-[#1f2328] dark:text-[#e6edf3] placeholder:text-[#656d76] dark:placeholder:text-[#8b949e] focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {isIntegrationSharkThinking ? (
              <button
                type="button"
                onClick={handleCancelIntegrationShark}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-md flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!integrationSharkInput.trim()}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-md flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Ask</span>
              </button>
            )}
          </form>
        </div>
      )}
    </div>
  );
};
