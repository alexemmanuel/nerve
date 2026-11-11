export interface DeveloperPeer {
  id: string;
  handle: string;
  name: string;
  role: string;
  organization: string;
  avatarUrl?: string;
  youFollowThem: boolean;
  theyFollowYou: boolean;
  proofOfWorkCommits: number;
  mergedPrs: number;
  maintainedRepos: string[];
  focusModeOptOut: boolean;
  statusText: string;
  activeBranch: string;
  avatarInitials: string;
}

export interface RepoFile {
  path: string;
  language: string;
  lastCommit: string;
  author: string;
  bugLine?: number;
  lines: string[];
  patchedLines?: string[];
}

export interface RepositoryContext {
  repo: string;
  branch: string;
  ciStatus: 'Passing' | 'Failing' | 'Running';
  latestCommit: string;
  openPrs: number;
  activeCodespaceId: string;
  description: string;
  files: Record<string, RepoFile>;
}

export interface IncidentTicket {
  ticketId: string;
  reporterHandle: string;
  targetRepo: string;
  branch: string;
  filePath: string;
  lineNumber: number;
  summary: string;
  stackTrace: string;
  clientPlatform: string;
  status: 'Open — Triage Live' | 'Pairing in Codespaces' | 'PR Merged — Resolved';
  createdAt: string;
}

export interface ChatReaction {
  emoji: string;
  count: number;
  users: string[];
}

export interface ChatMessage {
  id: string;
  senderHandle: string;
  senderName: string;
  senderRole: 'peer' | 'self' | 'copilot';
  timestamp: string;
  text: string;
  reactions?: ChatReaction[];
  parsedLinks?: Array<{
    raw: string;
    repo: string;
    branch: string;
    filePath: string;
    lineNumber: number;
  }>;
  incidentTicket?: IncidentTicket;
  copilotPatch?: {
    summary: string;
    suggestedPatch: string;
    recommendedTerminalCommand: string;
    prTitle: string;
    applied?: boolean;
  };
  sharedCodeSnippet?: {
    repo: string;
    branch: string;
    filePath: string;
    language: string;
    startLine: number;
    highlightedLine: number;
    lines: string[];
  };
}

export interface SdkPlatformSpec {
  id: string;
  platformName: string;
  category: string;
  targetUseCase: string;
  protocolEndpoint: string;
  language: string;
  architectureNotes: string;
  codeSnippet: string;
}

export const ENGINE_SDK_SPECS: SdkPlatformSpec[] = [
  {
    id: 'github-native',
    platformName: 'Node.js SDK',
    category: 'Backend & CLI',
    targetUseCase: 'Mutual-Follow P2P Verification & /bug Incident Dispatch',
    protocolEndpoint: 'POST /api/v1/trust/verify-mutual · POST /api/v1/incidents/dispatch',
    language: 'TypeScript',
    architectureNotes: 'Verifies mutual follow and commit Proof-of-Work before opening P2P sockets.',
    codeSnippet: `import { NerveClient } from "@nerve/sdk";

const nerve = new NerveClient({
  apiKey: process.env.NERVE_API_KEY,
  endpoint: "https://your-domain.com/api/v1",
});

export async function openPeerSession(initiator: string, recipient: string) {
  const trust = await nerve.trust.verifyMutual({
    initiatorHandle: initiator,
    recipientHandle: recipient,
    requireMinCommits: 15,
  });

  if (trust.verification.channelState !== "AUTHORIZED_P2P_SOCKET") {
    throw new Error(trust.verification.reason);
  }
  return trust;
}`,
  },
  {
    id: 'webrtc-e2ee-sdk',
    platformName: 'WebRTC P2PDataChannel',
    category: 'P2P DataChannel & 16KB Backpressure',
    targetUseCase: 'Direct WebRTC Chat & 16KB Chunked File Streaming with bufferedAmount Backpressure Monitoring',
    protocolEndpoint: 'WSS /socket.io · POST /api/v1/p2p/datachannel-stream · POST /api/v1/p2p/e2ee-verify',
    language: 'TypeScript',
    architectureNotes: 'Establishes direct RTCPeerConnection + RTCDataChannel (nerve-e2ee-dc) with 16KB (16,384-byte) encrypted chunks and 256KB/64KB bufferedAmount backpressure control.',
    codeSnippet: `import { useP2PDataChannel, CHUNK_SIZE_BYTES, MAX_BUFFER_HIGH_WATERMARK } from "./hooks/useP2PEngine";

export function PeerFileAndChatChannel({ roomId, passphrase, localHandle }: {
  roomId: string;
  passphrase: string;
  localHandle: string;
}) {
  const {
    rtcState,
    dataChannelState,
    bufferedAmountBytes,
    backpressurePaused,
    sendEncryptedChatMessage,
    sendEncryptedFileTransfer,
  } = useP2PDataChannel({
    roomId,
    passphrase,
    localHandle,
    localDisplayName: localHandle,
    transportMode: "hybrid",
  });

  // Streams file in strict 16KB (${'16384'}B) chunks, pausing when bufferedAmount > 256KB
  return { rtcState, dataChannelState, bufferedAmountBytes, backpressurePaused, sendEncryptedChatMessage, sendEncryptedFileTransfer };
}`,
  },
  {
    id: 'ai-triage-pipeline-sdk',
    platformName: 'AI Incident Triage SDK',
    category: 'Automated CI Log Triage & D3 Pipeline',
    targetUseCase: 'Analyzes CI failure logs to synthesize code fixes before human review and tracks Bug Reported -> PR Merged',
    protocolEndpoint: 'POST /api/v1/incidents/triage-logs · POST /api/v1/incidents/dispatch',
    language: 'TypeScript',
    architectureNotes: 'Feeds CI/CD failure stack traces into the automated triage engine to generate a root-cause diagnosis and unified code patch.',
    codeSnippet: `export async function triageCiFailureLogs(apiKey: string, ticketId: string, repo: string, logs: string[]) {
  const res = await fetch("https://your-domain.com/api/v1/incidents/triage-logs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": \`Bearer \${apiKey}\`,
    },
    body: JSON.stringify({
      ticketId,
      repo,
      branch: "main",
      filePath: "src/proxy/stream-handler.ts",
      lineNumber: 142,
      failureLogs: logs,
    }),
  });
  return res.json();
}`,
  },
  {
    id: 'universal-engine-gateway',
    platformName: '3P Engine & SSH SDK',
    category: 'Third-Party Callout & Universal SSH',
    targetUseCase: 'External apps call out any Nerve engine module via CORS gateway and register Ed25519/RSA SSH keys for any Git/app remote',
    protocolEndpoint: 'POST /api/v1/engine/call · GET /api/v1/engine/manifest · POST /api/v1/ssh/keys',
    language: 'TypeScript',
    architectureNotes: 'Supports universal repository channels (GitHub, GitLab, Bitbucket, Gitea, custom remotes) and one-time post-integration key sealing.',
    codeSnippet: `export async function invokeExternalNerveEngine(apiKey: string, integratorEmail: string) {
  const response = await fetch("https://your-domain.com/api/v1/engine/call", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": \`Bearer \${apiKey}\`,
      "X-Integrator-Email": integratorEmail,
    },
    body: JSON.stringify({
      engine: "p2p_datachannel",
      action: "execute",
      payload: { roomId: "global-dev-room", chunkSizeBytes: 16384, backpressureWatermark: 262144 },
    }),
  });
  return response.json();
}`,
  },
  {
    id: 'vscode-jetbrains',
    platformName: 'VS Code Extension',
    category: 'IDE Deep-Linking',
    targetUseCase: 'Jumps directly to repo#branch/file:L142 from chat links across any Git surface',
    protocolEndpoint: 'POST /api/v1/syntax/parse',
    language: 'TypeScript',
    architectureNotes: 'Registers vscode://nerve.open URI handler.',
    codeSnippet: `import * as vscode from "vscode";

export function activate() {
  vscode.window.registerUriHandler({
    async handleUri(uri: vscode.Uri) {
      const params = new URLSearchParams(uri.query);
      const filePath = params.get("path") ?? "src/index.ts";
      const line = Number(params.get("line") ?? 1);
      const root = vscode.workspace.workspaceFolders?.[0];
      if (!root) return;

      const doc = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(root.uri, filePath));
      const editor = await vscode.window.showTextDocument(doc);
      const pos = new vscode.Position(Math.max(0, line - 1), 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos));
    }
  });
}`,
  },
  {
    id: 'apple-xcode-cloud',
    platformName: 'Swift / iOS SDK',
    category: 'Mobile Triage',
    targetUseCase: 'Dispatches runtime stack traces via /bug syntax',
    protocolEndpoint: 'POST /api/v1/incidents/dispatch',
    language: 'Swift 6',
    architectureNotes: 'Sends crash traces to repository maintainers.',
    codeSnippet: `import Foundation

func dispatchIncident(apiKey: String, repo: String, file: String, line: Int, trace: String) async throws {
    var req = URLRequest(url: URL(string: "https://your-domain.com/api/v1/incidents/dispatch")!)
    req.httpMethod = "POST"
    req.setValue("Bearer \\(apiKey)", forHTTPHeaderField: "Authorization")
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    let body: [String: Any] = ["targetRepo": repo, "filePath": file, "lineNumber": line, "stackTrace": trace]
    req.httpBody = try JSONSerialization.data(withJSONObject: body)
    _ = try await URLSession.shared.data(for: req)
}`,
  },
  {
    id: 'pr-diff-sdk',
    platformName: 'PR Diff Review SDK',
    category: 'Incident Code Review',
    targetUseCase: 'Parses unified diff hunks, computes line-by-line additions and deletions, and stores inline comments',
    protocolEndpoint: 'POST /api/v1/pull-requests/diff',
    language: 'TypeScript',
    architectureNotes: 'Parses git unified diff output into structured line objects for unified and split views.',
    codeSnippet: `import { parseUnifiedDiff } from "@nerve/git-diff";

export function analyzePatchDiff(rawDiff: string, filename: string) {
  const files = parseUnifiedDiff(rawDiff, filename);
  const totalAdditions = files.reduce((acc, f) => acc + f.additions, 0);
  const totalDeletions = files.reduce((acc, f) => acc + f.deletions, 0);
  return { files, totalAdditions, totalDeletions };
}`,
  },
  {
    id: 'firebase-terminal-export-sdk',
    platformName: 'Firebase & Log Export SDK',
    category: 'GitHub OAuth, Firestore Peer Lifecycle & Log Triage',
    targetUseCase: 'Triggers GitHub OAuth sign-in via githubProvider, syncs/deletes peers in Firestore, and exports line-numbered session logs (.txt)',
    protocolEndpoint: 'POST /api/v1/auth/github-oauth · POST /api/v1/firebase/sync-status · POST /api/v1/peers/manage · POST /api/v1/terminal/export-logs',
    language: 'TypeScript',
    architectureNotes: 'Uses signInWithPopup(auth, githubProvider) with read:user scope, syncs Firestore (users_public & github_peers), and exports line-numbered logs.',
    codeSnippet: `import { auth, githubProvider, signInWithPopup, db, syncAuthenticatedUserAndPeers, deleteGitHubPeerFromFirestore } from "./firebase";

export async function signInWithGitHubAndManageSession(apiKey: string, instanceName: string, logs: string[], peerToRemove?: string) {
  const credential = await signInWithPopup(auth, githubProvider);
  const peers = await syncAuthenticatedUserAndPeers(credential.user);
  if (peerToRemove) {
    await deleteGitHubPeerFromFirestore(credential.user, peerToRemove);
  }
  const res = await fetch("https://your-domain.com/api/v1/terminal/export-logs", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": \`Bearer \${apiKey}\` },
    body: JSON.stringify({ instanceName, subTab: "build", logs }),
  });
  const data = await res.json();
  return { user: credential.user, peers, filename: data.filename, errorLineNumbers: data.errorLineNumbers, firestoreDb: db.app.options.projectId };
}`,
  },
  {
    id: 'google-oauth-sdk',
    platformName: 'Google OAuth SDK',
    category: 'Google OAuth & Gmail Integration',
    targetUseCase: 'Triggers dedicated Google OAuth sign-in flow via googleProvider with Gmail access token caching and peer sync',
    protocolEndpoint: 'POST /api/v1/auth/google-oauth · signInWithGoogleForGmail()',
    language: 'TypeScript',
    architectureNotes: 'Initializes GoogleAuthProvider with Gmail send scopes and syncs authenticated user peers in Firestore.',
    codeSnippet: `import { signInWithGoogleForGmail, syncAuthenticatedUserAndPeers } from "./firebase";

export async function authenticateWithGoogle() {
  const { user, userEmail, accessToken } = await signInWithGoogleForGmail();
  const peers = await syncAuthenticatedUserAndPeers(user);
  return { user, userEmail, accessToken, peers };
}`,
  },
  {
    id: 'github-ssh-keys-sdk',
    platformName: 'GitHub SSH Keys SDK',
    category: 'GitHub API SSH Key Management',
    targetUseCase: 'Manages authentication and commit-signing SSH public keys directly with GitHub via /user/keys',
    protocolEndpoint: 'GET /api/v1/github/ssh-keys · POST /api/v1/github/ssh-keys · DELETE /api/v1/github/ssh-keys/:id',
    language: 'TypeScript',
    architectureNotes: 'Lists, adds (Ed25519, RSA), and revokes GitHub account SSH keys with SHA256 fingerprint verification.',
    codeSnippet: `export async function manageGitHubSshKeys(apiKey: string, title: string, publicKey: string) {
  // Add new SSH public key to GitHub account
  const addRes = await fetch("https://your-domain.com/api/v1/github/ssh-keys", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": \`Bearer \${apiKey}\` },
    body: JSON.stringify({ title, key: publicKey, read_only: false }),
  });
  const added = await addRes.json();

  // List all registered GitHub account SSH keys
  const listRes = await fetch("https://your-domain.com/api/v1/github/ssh-keys", {
    headers: { "Authorization": \`Bearer \${apiKey}\` },
  });
  const allKeys = await listRes.json();
  return { addedKey: added.key, allKeys: allKeys.keys };
}`,
  },
  {
    id: 'third-party-ssh-sdk',
    platformName: 'Third-Party Multi-Repo SSH SDK',
    category: 'Universal Git SSH Key Management',
    targetUseCase: 'Generates, manages, and provisions Ed25519/RSA/ECDSA SSH keys for GitLab, Bitbucket, Azure DevOps, Gitea, and custom git hosts',
    protocolEndpoint: 'GET /api/v1/ssh-keys/third-party · POST /api/v1/ssh-keys/third-party · DELETE /api/v1/ssh-keys/third-party/:id',
    language: 'TypeScript',
    architectureNotes: 'Outputs OpenSSH key pairs, generates ~/.ssh/config host mappings, and computes SHA256/MD5 fingerprints for non-GitHub git remotes.',
    codeSnippet: `export async function provisionThirdPartySshKey(apiKey: string, provider: 'gitlab' | 'bitbucket' | 'azure_devops' | 'gitea' | 'custom', title: string, keyType: 'ed25519' | 'rsa' | 'ecdsa', publicKey: string) {
  const res = await fetch("https://your-domain.com/api/v1/ssh-keys/third-party", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": \`Bearer \${apiKey}\` },
    body: JSON.stringify({ provider, title, keyType, publicKey, purpose: "both" }),
  });
  return await res.json();
}`,
  },
  {
    id: 'offline-sync-worker-sdk',
    platformName: 'Background Service Worker & Offline Sync Engine',
    category: 'Resilient Offline State & Queue Flusher',
    targetUseCase: 'Service worker background sync with periodic polling to auto-flush localStorage queued actions the moment network is restored',
    protocolEndpoint: 'POST /api/v1/offline/flush · navigator.serviceWorker · Background Sync API',
    language: 'TypeScript',
    architectureNotes: 'Listens for online transition and sync tags (nerve-flush-offline-queue), immediately flushes batch incidents/messages to backend with instant UI toast feedback.',
    codeSnippet: `export async function triggerOfflineQueueSync(apiKey: string, queue: any[]) {
  const res = await fetch("https://your-domain.com/api/v1/offline/flush", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": \`Bearer \${apiKey}\` },
    body: JSON.stringify({ queue }),
  });
  const data = await res.json();
  return { flushedCount: data.flushedCount, success: data.success, timestamp: data.timestamp };
}`,
  },
];

