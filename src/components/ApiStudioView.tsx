import React, { useState, useEffect } from 'react';
import {
  Play,
  Copy,
  Check,
  Key,
  Shield,
  Code2,
  Terminal,
  RefreshCw,
  Plus,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { ENGINE_SDK_SPECS } from '../data/mockWorkspaceData';
import { maskSecretKey, isKeySealed, sealKeyAfterUse } from '../utils/securityEncoding';

interface EndpointSpec {
  id: string;
  label: string;
  path: string;
  summary: string;
  defaultBody: Record<string, unknown>;
}

const API_ENDPOINTS: EndpointSpec[] = [
  {
    id: 'trust',
    label: '1. Mutual Follow & PoW Gate',
    path: '/api/v1/trust/verify-mutual',
    summary: 'Verify bilateral follow edges and commit Proof-of-Work before provisioning a P2P socket.',
    defaultBody: {
      initiatorHandle: 'primary-developer',
      recipientHandle: 'system-maintainer',
      initiatorFollowsRecipient: true,
      recipientFollowsInitiator: true,
      proofOfWorkCommits: 418,
      requireMinCommits: 15,
    },
  },
  {
    id: 'sovereignty',
    label: '2. Focus Switch Sovereignty',
    path: '/api/v1/sovereignty/status',
    summary: 'Pause direct messaging while keeping public PRs, issues, and CI webhooks 100% unrestricted.',
    defaultBody: {
      developerHandle: 'kernel-specialist',
      globalFocusMode: true,
      allowIncidentPingsFromMaintainedRepos: true,
    },
  },
  {
    id: 'syntax',
    label: '3. Deep-Link Syntax Parser',
    path: '/api/v1/syntax/parse',
    summary: 'Parse Git coordinates (repo#branch/file:L142) into live context cards and IDE URIs.',
    defaultBody: {
      text: 'Inspecting acme-cloud/edge-router#main/src/proxy/stream-handler.ts:L142 for stream crash',
    },
  },
  {
    id: 'codespaces',
    label: '4. Codespace Cloud Execution',
    path: '/api/v1/codespaces/execute',
    summary: 'Run test suites or git operations inside paired ephemeral cloud containers.',
    defaultBody: {
      command: 'npm test',
      repo: 'acme-cloud/edge-router',
      branch: 'fix/mobile-stream-guard',
      patchApplied: true,
    },
  },
  {
    id: 'copilot',
    label: '5. Multi-Party Nerve Shark Agent',
    path: '/api/v1/copilot/collaborate',
    summary: 'Synthesize shared AI patches with multi-developer thread context via server-side Gemini.',
    defaultBody: {
      prompt: 'Synthesize non-blocking stream guard before flushHeaders on line 142.',
      repo: 'acme-cloud/edge-router',
      branch: 'main',
      filePath: 'src/proxy/stream-handler.ts',
      participants: ['primary-developer', 'system-maintainer'],
    },
  },
  {
    id: 'incident',
    label: '6. Zero-Friction /bug Dispatch',
    path: '/api/v1/incidents/dispatch',
    summary: 'Package crash stack trace and line coordinates directly into maintainer code drawer.',
    defaultBody: {
      reporterHandle: 'primary-developer',
      targetRepo: 'acme-cloud/edge-router',
      branch: 'main',
      filePath: 'src/proxy/stream-handler.ts',
      lineNumber: 142,
      summary: 'Stream crash on mobile socket disconnect mid-chunk flush',
      clientPlatform: 'Nerve iOS 2.4 (arm64)',
    },
  },
  {
    id: 'pr_diff',
    label: '7. Pull Request Diff & Review',
    path: '/api/v1/pull-requests/diff',
    summary: 'Analyze unified/split diff additions, deletions, and line review comments.',
    defaultBody: {
      ticketId: 'INC-709',
      repo: 'acme-cloud/edge-router',
      branch: 'patch/inc-709',
      filePath: 'src/proxy/stream-handler.ts',
    },
  },
  {
    id: 'triage_logs',
    label: '8. Automated AI Incident Log Triage',
    path: '/api/v1/incidents/triage-logs',
    summary: 'Analyze CI failure logs with the AI triage engine to synthesize root-cause diagnoses and code fixes before human review.',
    defaultBody: {
      ticketId: 'INC-709',
      repo: 'acme-cloud/edge-router',
      branch: 'main',
      filePath: 'src/proxy/stream-handler.ts',
      lineNumber: 142,
      failureLogs: [
        'Error: ERR_STREAM_WRITE_AFTER_END at src/proxy/stream-handler.ts:142',
        'Process completed with exit code 1.',
      ],
    },
  },
  {
    id: 'ssh_generate',
    label: '9. Universal SSH Key Surface Auth',
    path: '/api/v1/ssh/generate',
    summary: 'Generate and register Ed25519 or RSA SSH public keys for authenticating local Git surfaces and any third-party app remote.',
    defaultBody: {
      title: 'Local Git Surface',
      targetRepo: 'owner/private-repo',
      keyType: 'ed25519',
    },
  },
  {
    id: 'p2p_datachannel',
    label: '10. WebRTC P2PDataChannel (16KB Backpressure)',
    path: '/api/v1/p2p/datachannel-stream',
    summary: 'Verify direct WebRTC RTCDataChannel chat and 16KB chunked file streaming with bufferedAmount backpressure monitoring.',
    defaultBody: {
      roomId: 'global-dev-room',
      channelLabel: 'nerve-e2ee-dc',
      chunkSizeBytes: 16384,
      highWatermarkBytes: 262144,
      lowWatermarkBytes: 65536,
    },
  },
  {
    id: 'engine_callout',
    label: '11. Third-Party Engine Callout Gateway',
    path: '/api/v1/engine/call',
    summary: 'CORS-enabled unified gateway allowing external third-party apps to invoke any Nerve engine module.',
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
    id: 'terminal_log_export',
    label: '12. Terminal Session Raw Log Export (.txt)',
    path: '/api/v1/terminal/export-logs',
    summary: 'Export active terminal session (Build or Logs) output as an ANSI-stripped raw UTF-8 text file for local review.',
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
    id: 'firebase_firestore',
    label: '13. Firebase Firestore & Auth Persistence',
    path: '/api/v1/firebase/sync-status',
    summary: 'Verify provisioned Firebase Auth and Firestore database (europe-west2) peer and workspace state synchronization.',
    defaultBody: {
      projectId: 'gen-lang-client-0310681320',
      firestoreDatabaseId: 'ai-studio-gitsurfacenative-a6673b36-a9a3-4ed1-b52e-1d3c6bf8ad06',
      region: 'europe-west2',
    },
  },
  {
    id: 'peer_lifecycle',
    label: '14. User Peer Search & Deletion (Firestore Sync)',
    path: '/api/v1/peers/manage',
    summary: 'Search, track, or delete any user peer across the search dropdown, peer bar, contributors grid, and Firestore github_peers collection.',
    defaultBody: {
      operation: 'delete',
      peerHandle: 'developer-b',
      ownerUid: 'authenticated-user',
    },
  },
  {
    id: 'github_oauth',
    label: '15. Dedicated GitHub OAuth Sign-In (githubProvider)',
    path: '/api/v1/auth/github-oauth',
    summary: 'Verify and configure dedicated GitHub OAuth popup sign-in using the Firebase githubProvider (read:user) instance.',
    defaultBody: {
      providerId: 'github.com',
      scopes: ['read:user'],
      syncFirestorePeers: true,
    },
  },
  {
    id: 'google_oauth',
    label: '16. Dedicated Google OAuth Sign-In (googleProvider)',
    path: '/api/v1/auth/google-oauth',
    summary: 'Verify and configure dedicated Google OAuth sign-in with Gmail access using the Firebase googleProvider instance.',
    defaultBody: {
      providerId: 'google.com',
      scopes: ['https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/gmail.send'],
      syncFirestorePeers: true,
    },
  },
  {
    id: 'github_ssh_keys',
    label: '17. GitHub Account SSH Keys Management (GitHub API)',
    path: '/api/v1/github/ssh-keys',
    summary: 'Manage authentication and signing SSH public keys directly on your GitHub account via GitHub API (/user/keys).',
    defaultBody: {
      title: 'Workstation ed25519',
      key: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH8qB24rXlZ9pQ9Z8g7eYf6m5l4k3j2h1g0f9e8d7c6b developer@macbook-pro',
      read_only: false,
    },
  },
  {
    id: 'third_party_ssh',
    label: '18. Third-Party Multi-Repo SSH Keys (GitLab, Bitbucket, Azure)',
    path: '/api/v1/ssh-keys/third-party',
    summary: 'Generate, register, and query Ed25519/RSA/ECDSA SSH keys and ~/.ssh/config host mappings for non-GitHub git repositories.',
    defaultBody: {
      provider: 'gitlab',
      title: 'GitLab CI/CD Production Deploy Key',
      keyType: 'ed25519',
      host: 'gitlab.com',
      publicKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGq7pB3jK0wL8mN2oP4rS6tU8vW0xY2zA4bC6dE8fG0h ci-runner@gitlab.com',
      purpose: 'both',
    },
  },
  {
    id: 'offline_flush',
    label: '19. Offline Queue Auto-Flush Engine (Service Worker Sync)',
    path: '/api/v1/offline/flush',
    summary: 'Background sync and periodic polling engine that automatically flushes localStorage queued actions when network is restored.',
    defaultBody: {
      queue: [
        {
          id: 'off_act_demo_01',
          type: 'bug_dispatch',
          createdAt: new Date().toISOString(),
          bugPayload: {
            reporterHandle: 'primary-developer',
            targetRepo: 'acme-cloud/edge-router',
            branch: 'main',
            filePath: 'src/proxy/stream-handler.ts',
            lineNumber: 142,
            summary: 'Stream crash on mobile disconnect during offline queue test',
            stackTrace: 'Error: ERR_STREAM_WRITE_AFTER_END at stream-handler.ts:142',
          },
        },
      ],
    },
  },
];

interface ApiStudioViewProps {
  apiKey?: string;
  onApiKeyChange?: (key: string) => void;
  isDark?: boolean;
}

export const ApiStudioView: React.FC<ApiStudioViewProps> = ({
  apiKey: externalApiKey,
  onApiKeyChange,
  isDark = true,
}) => {
  const [mode, setMode] = useState<'tester' | 'keys' | 'sdks'>('keys');
  const [apiKey, setApiKey] = useState<string>(
    externalApiKey || 'nrve_live_9a4f21b77c3e410a8809e6c1e95f1234'
  );
  const [keyOrgName, setKeyOrgName] = useState<string>('My Production Ecosystem');

  useEffect(() => {
    if (externalApiKey && externalApiKey !== apiKey) {
      setApiKey(externalApiKey);
    }
  }, [externalApiKey]);
  const [generatedKeys, setGeneratedKeys] = useState<Array<{ keyId: string; name: string; apiKey: string; createdAt: string }>>([
    {
      keyId: 'key_live_default_01',
      name: 'Default Production Key',
      apiKey: 'nrve_live_9a4f21b77c3e410a8809e6c1e95f1234',
      createdAt: 'Active',
    },
  ]);
  const [isGeneratingKey, setIsGeneratingKey] = useState<boolean>(false);

  const [selectedEndpointId, setSelectedEndpointId] = useState<string>(API_ENDPOINTS[0].id);
  const [requestJson, setRequestJson] = useState<string>(
    JSON.stringify(API_ENDPOINTS[0].defaultBody, null, 2)
  );
  const [responseJson, setResponseJson] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedSdkId, setSelectedSdkId] = useState<string>(ENGINE_SDK_SPECS[0].id);
  const [copiedKey, setCopiedKey] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [showKey, setShowKey] = useState<boolean>(false);
  const [keySealed, setKeySealed] = useState<boolean>(() => isKeySealed(apiKey));

  useEffect(() => {
    setKeySealed(isKeySealed(apiKey));
    if (isKeySealed(apiKey)) {
      setShowKey(false);
    }
  }, [apiKey]);

  const activeEndpoint = API_ENDPOINTS.find((e) => e.id === selectedEndpointId) || API_ENDPOINTS[0];
  const activeSdk = ENGINE_SDK_SPECS.find((s) => s.id === selectedSdkId) || ENGINE_SDK_SPECS[0];

  const handleCreateNewApiKey = async () => {
    setIsGeneratingKey(true);
    try {
      const res = await fetch('/api/v1/keys/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: keyOrgName || 'Production Engine Key',
          ownerOrg: 'Third-Party Deployer',
          scopes: ['*'],
        }),
      });
      const data = await res.json();
      if (data.apiKey) {
        setApiKey(data.apiKey);
        if (onApiKeyChange) {
          onApiKeyChange(data.apiKey);
        }
        setGeneratedKeys((prev) => [
          {
            keyId: data.keyId,
            name: data.name,
            apiKey: data.apiKey,
            createdAt: 'Just now',
          },
          ...prev,
        ]);
      }
    } catch (err) {
      console.error('Failed to create key:', err);
    } finally {
      setIsGeneratingKey(false);
    }
  };

  const handleSelectEndpoint = (ep: EndpointSpec) => {
    setSelectedEndpointId(ep.id);
    setRequestJson(JSON.stringify(ep.defaultBody, null, 2));
    setResponseJson('');
  };

  const handleExecuteEndpoint = async () => {
    setIsLoading(true);
    try {
      const parsedBody = JSON.parse(requestJson);
      const res = await fetch(activeEndpoint.path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(parsedBody),
      });
      const data = await res.json();
      setResponseJson(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setResponseJson(
        JSON.stringify({ error: 'Request execution error', details: err?.message }, null, 2)
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (text: string, isKey = false) => {
    if (isKey && keySealed) return;
    navigator.clipboard.writeText(text);
    if (isKey) {
      setCopiedKey(true);
      setShowKey(false);
      sealKeyAfterUse(text);
      setKeySealed(true);
      fetch('/api/v1/keys/seal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: text, targetApp: keyOrgName || 'External Integration' }),
      }).catch(() => {});
      setTimeout(() => setCopiedKey(false), 2000);
    } else {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
              NERVE PROTOCOL ENGINE v1.5
            </span>
            <span className="text-xs text-slate-500 font-mono">Universal Ecosystem Architecture</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
            API Keys & Third-Party Engine Integration Hub
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-3xl leading-relaxed">
            Generate production API keys and deploy the full Nerve developer work surface—including WebRTC 16KB P2PDataChannel streaming, automated AI incident log triage, D3 pipeline & 30-day CI telemetry, universal SSH keys, and third-party engine callouts.
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl self-start">
          <button
            onClick={() => setMode('keys')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
              mode === 'keys'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Deploy API Keys
          </button>
          <button
            onClick={() => setMode('tester')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
              mode === 'tester'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Live REST Endpoints
          </button>
          <button
            onClick={() => setMode('sdks')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
              mode === 'sdks'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Full SDK Deployments
          </button>
        </div>
      </div>

      {/* Mode 1: API Key Provisioning & Live Key Manager */}
      {mode === 'keys' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Key className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Issue Production Nerve API Key</span>
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Third-party systems use this key to authenticate requests across all 6 core P2P primitives.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={keyOrgName}
                  onChange={(e) => setKeyOrgName(e.target.value)}
                  placeholder="App or Organization Name..."
                  className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
                <button
                  onClick={handleCreateNewApiKey}
                  disabled={isGeneratingKey}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isGeneratingKey ? 'Generating...' : 'Issue New Key'}</span>
                </button>
              </div>
            </div>

            {/* Active Key Display */}
            <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <span className="text-[11px] font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider">
                  Active Deployment Key
                </span>
                <div className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100 truncate">
                  {keySealed ? maskSecretKey(apiKey) : apiKey}
                </div>
              </div>

              <button
                type="button"
                disabled={keySealed}
                onClick={() => handleCopy(apiKey, true)}
                className="px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey ? 'Copied Key!' : 'Copy Key'}</span>
              </button>
            </div>

            {/* Keys Table */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Active Provisioned Keys ({generatedKeys.length})
              </div>
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                {generatedKeys.map((k) => (
                  <div
                    key={k.keyId}
                    className="p-3 bg-white dark:bg-slate-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{k.name}</span>
                      <span className="font-mono text-slate-400">({k.keyId})</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[11px] text-slate-500">{k.apiKey.substring(0, 18)}...</span>
                      <button
                        onClick={() => {
                          setApiKey(k.apiKey);
                          handleCopy(k.apiKey, true);
                        }}
                        className="text-blue-600 dark:text-blue-400 hover:underline font-mono text-[11px] cursor-pointer"
                      >
                        Use in Sandbox
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Integration Architecture Callout */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1.5 shadow-sm">
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                1. Header Authentication
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-mono">
                Authorization: Bearer nrve_live_...
              </p>
              <div className="text-[11px] text-slate-500">
                Valid on all /api/v1/* routes with rate limits up to 1,200 req/min.
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1.5 shadow-sm">
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                2. Universal Peer & Repo Channels
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-mono">
                POST /api/v1/trust/verify-mutual
              </p>
              <div className="text-[11px] text-slate-500">
                Verifies bilateral follows and commit Proof-of-Work across all Git & repository channels.
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1.5 shadow-sm">
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                3. 3P Engine Gateway & P2PDataChannel
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-mono">
                POST /api/v1/engine/call
              </p>
              <div className="text-[11px] text-slate-500">
                Invokes AI incident triage, universal SSH auth, and 16KB WebRTC DataChannel streaming.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mode 2: Live REST Endpoints Sandbox */}
      {mode === 'tester' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          {/* Endpoint Picker */}
          <div className="md:col-span-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800 overflow-hidden shadow-sm">
            {API_ENDPOINTS.map((ep) => (
              <button
                key={ep.id}
                onClick={() => handleSelectEndpoint(ep)}
                className={`w-full text-left px-4 py-3.5 transition-colors cursor-pointer ${
                  ep.id === selectedEndpointId
                    ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-800 dark:text-slate-200'
                }`}
              >
                <div className="text-xs font-semibold">
                  {ep.label}
                </div>
                <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {ep.path}
                </div>
              </button>
            ))}
          </div>

          {/* Request & Response */}
          <div className="md:col-span-8 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-5 space-y-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs font-mono font-semibold text-blue-600 dark:text-blue-400">
                  POST {activeEndpoint.path}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  {activeEndpoint.summary}
                </div>
              </div>
              <button
                onClick={handleExecuteEndpoint}
                disabled={isLoading}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer shadow-sm"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{isLoading ? 'Executing...' : 'Send Live Request'}</span>
              </button>
            </div>

            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-950 p-2 rounded-lg truncate">
              Header: Authorization: Bearer {apiKey}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Request Payload (JSON)
                </div>
                <textarea
                  value={requestJson}
                  onChange={(e) => setRequestJson(e.target.value)}
                  rows={9}
                  spellCheck={false}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3 font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Live Response Output
                </div>
                <div className="h-[202px] overflow-auto rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 font-mono text-xs text-emerald-700 dark:text-emerald-300">
                  {responseJson ? (
                    <pre className="whitespace-pre-wrap">{responseJson}</pre>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-500 dark:text-slate-400 text-center text-xs">
                      Click "Send Live Request" to execute against the live server.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mode 3: Platform SDK Snippets */}
      {mode === 'sdks' && (
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-5 space-y-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {ENGINE_SDK_SPECS.map((sdk) => (
                <button
                  key={sdk.id}
                  onClick={() => setSelectedSdkId(sdk.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    selectedSdkId === sdk.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {sdk.platformName.split('&')[0].trim()}
                </button>
              ))}
            </div>

            <button
              onClick={() => handleCopy(activeSdk.codeSnippet)}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCode ? 'Copied Snippet' : 'Copy SDK Code'}</span>
            </button>
          </div>

          <div className="text-xs text-slate-600 dark:text-slate-400">
            {activeSdk.targetUseCase}
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 p-4 overflow-x-auto">
            <pre className="font-mono text-xs text-slate-800 dark:text-slate-200 leading-relaxed">
              {activeSdk.codeSnippet}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
