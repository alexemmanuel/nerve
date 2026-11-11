import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  Lock,
  UserPlus,
  Terminal,
  Code2,
  Send,
  GitPullRequest,
  Sun,
  Moon,
  FolderGit2,
  SlidersHorizontal,
  X,
  PanelRightClose,
  PanelRightOpen,
  Wifi,
  WifiOff,
  RefreshCw,
  LogIn,
  LogOut,
  Plus,
  Search,
  AlertTriangle,
  GitCommit,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Folder,
  FolderOpen,
  FileCode,
  Bell,
  Menu,
  Mail,
  KeyRound,
  Smartphone,
  CheckCircle2,
  Share2,
  Check,
  Trash2,
  Edit3,
  Cpu,
  Layers,
  Grid,
  RotateCcw,
  Smile,
  Download,
} from 'lucide-react';
import {
  DeveloperPeer,
  ChatMessage,
  ChatReaction,
  RepositoryContext,
  IncidentTicket,
} from './data/mockWorkspaceData';
import {
  IncidentWorkflowReport,
} from './data/incidentReports';
import { IncidentWorkflowView } from './components/IncidentWorkflowView';
import { Integration } from './components/Integration';
import { useP2PEngine, SignalingTransportMode } from './hooks/useP2PEngine';
import {
  getOfflineQueue,
  enqueueOfflineAction,
  clearOfflineQueue,
  QueuedOfflineAction,
} from './utils/offlineQueue';
import {
  detectCodeLanguage,
  renderSyntaxHighlightedLine,
} from './utils/syntaxHighlighter';
import {
  renderAnsiFormattedLog,
  ANSI_COLOR_SCHEMES,
  AnsiColorSchemeId,
} from './utils/ansiParser';
import { useWorkspacePersistence } from './hooks/useWorkspacePersistence';
import { setEnvEncodedStorage, getEnvEncodedStorage } from './utils/securityEncoding';
import {
  auth,
  githubProvider,
  signInWithPopup,
  signInWithGoogleForGmail,
  getCachedGmailAccessToken,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  onAuthStateChanged,
  User,
  syncAuthenticatedUserAndPeers,
  addRealGitHubPeerToFirestore,
  updateGitHubPeerFollowInFirestore,
  deleteGitHubPeerFromFirestore,
} from './firebase';

type ActiveTab = 'workspace' | 'incidents' | 'integration';
type AuthModalMode = 'signin' | 'signup';
type SignUpStep = 'credentials' | 'verify_code';

export type TerminalSubTabKey = 'build' | 'logs';
export type TerminalSplitDirection = 'none' | 'vertical' | 'horizontal' | 'grid';

export interface TerminalMacro {
  id: string;
  label: string;
  shortcut: string;
  command: string;
}

export interface TerminalSessionTab {
  id: TerminalSubTabKey;
  label: string;
  logs: string[];
  input: string;
  isRunning: boolean;
}

export interface TerminalTask {
  id: string;
  name: string;
  pid: number;
  status: 'running' | 'idle' | 'success' | 'error';
  startTime: string;
}

export interface TerminalWorkspaceInstance {
  id: string;
  name: string;
  isDeletable: boolean;
  activeSubTab: TerminalSubTabKey;
  secondarySubTab: TerminalSubTabKey;
  splitDirection: TerminalSplitDirection;
  subTabs: Record<TerminalSubTabKey, TerminalSessionTab>;
  cwd?: string;
  history?: string[];
  tasks?: TerminalTask[];
  status?: 'idle' | 'running' | 'success' | 'error';
}

const DEFAULT_TERMINAL_MACROS: TerminalMacro[] = [
  {
    id: 'macro-build-test',
    label: 'Build & Test',
    shortcut: 'Alt+B',
    command: 'npm run build && npm test',
  },
  {
    id: 'macro-quick-test',
    label: 'Run Suite',
    shortcut: 'Alt+T',
    command: 'npm test',
  },
  {
    id: 'macro-git-status',
    label: 'Git Status',
    shortcut: 'Alt+S',
    command: 'git status',
  },
];

function formatKeyboardEventShortcut(e: KeyboardEvent | React.KeyboardEvent): string {
  const mods: string[] = [];
  if (e.ctrlKey || e.metaKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');

  const rawKey = e.key;
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(rawKey)) {
    return mods.join('+');
  }
  const normalizedKey = rawKey.length === 1 ? rawKey.toUpperCase() : rawKey;
  return [...mods, normalizedKey].join('+');
}

function createTerminalSubTabs(initialLogs?: string[]): Record<TerminalSubTabKey, TerminalSessionTab> {
  const cleanedInitial = Array.isArray(initialLogs)
    ? initialLogs.filter(
        (l) =>
          typeof l === 'string' &&
          !l.includes('Nerve Codespace Terminal Ready') &&
          !l.includes('Ready]') &&
          !l.includes('Full Codespace session initialized')
      )
    : [];

  return {
    build: {
      id: 'build',
      label: 'Build',
      logs: cleanedInitial,
      input: '',
      isRunning: false,
    },
    logs: {
      id: 'logs',
      label: 'Logs',
      logs: [],
      input: '',
      isRunning: false,
    },
  };
}

function deriveBuildSubTabSummary(buildSession: TerminalSessionTab): {
  status: 'Running' | 'Passing' | 'Failing' | 'Idle';
  label: string;
  detail: string;
} {
  if (buildSession.isRunning) {
    return {
      status: 'Running',
      label: 'BUILDING',
      detail: 'Executing build & test pipeline...',
    };
  }

  const flatLines = buildSession.logs
    .flatMap((block) => block.split('\n'))
    .map((line) => line.replace(/\x1b\[[0-9;]*m/g, '').trim())
    .filter((line) => line.length > 0 && !line.startsWith('codespace@'));

  if (flatLines.length === 0) {
    return {
      status: 'Idle',
      label: 'IDLE',
      detail: 'No build output in this terminal yet',
    };
  }

  const latestBlockRaw = buildSession.logs[buildSession.logs.length - 1] || '';
  const latestBlockClean = latestBlockRaw.replace(/\x1b\[[0-9;]*m/g, '');
  const lastLine = flatLines[flatLines.length - 1];

  const hasFailure =
    /\b(FAIL|FAILED|ERR!|Error:|Exception|Command failed|exit code [1-9])\b/i.test(
      latestBlockClean
    ) || latestBlockRaw.includes('\x1b[31m');

  if (hasFailure) {
    return {
      status: 'Failing',
      label: 'FAILURE',
      detail: lastLine,
    };
  }

  return {
    status: 'Passing',
    label: 'SUCCESS',
    detail: lastLine,
  };
}

export interface FileExplorerTreeNode {
  name: string;
  fullPath: string;
  type: 'folder' | 'file';
  children?: FileExplorerTreeNode[];
}

function buildRepositoryFileTree(filePaths: string[]): FileExplorerTreeNode[] {
  const rootNodes: FileExplorerTreeNode[] = [];

  const sortedPaths = [...filePaths].sort((a, b) => a.localeCompare(b));
  for (const rawPath of sortedPaths) {
    const parts = rawPath.split('/').filter(Boolean);
    let currentLevel = rootNodes;
    let accumulatedPath = '';

    parts.forEach((segment, idx) => {
      accumulatedPath = accumulatedPath ? `${accumulatedPath}/${segment}` : segment;
      const isFile = idx === parts.length - 1;

      if (isFile) {
        currentLevel.push({
          name: segment,
          fullPath: rawPath,
          type: 'file',
        });
      } else {
        let folderNode = currentLevel.find(
          (n) => n.type === 'folder' && n.name === segment
        );
        if (!folderNode) {
          folderNode = {
            name: segment,
            fullPath: accumulatedPath,
            type: 'folder',
            children: [],
          };
          currentLevel.push(folderNode);
        }
        currentLevel = folderNode.children!;
      }
    });
  }

  // Sort folders first, then files alphabetically at each level
  const sortTree = (nodes: FileExplorerTreeNode[]): FileExplorerTreeNode[] =>
    nodes
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map((node) =>
        node.children ? { ...node, children: sortTree(node.children) } : node
      );

  return sortTree(rootNodes);
}

interface VerifiedEmailSession {
  uid: string;
  email: string;
  displayName: string;
}

const LOCAL_AUTH_SESSION_KEY = 'nerve_verified_email_session_v1';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('workspace');
  const [isDark, setIsDark] = useState<boolean>(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  // Firebase Auth + Verified Email/Password Session State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [emailSession, setEmailSession] = useState<VerifiedEmailSession | null>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_AUTH_SESSION_KEY);
      return raw ? (JSON.parse(raw) as VerifiedEmailSession) : null;
    } catch {
      return null;
    }
  });

  // Auth Modal State (Sign In with Email/Password + Sign Up with Code/Text Activation + GitHub & Google Auto Sign-In)
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode>('signin');
  const [signUpStep, setSignUpStep] = useState<SignUpStep>('credentials');
  const [authEmail, setAuthEmail] = useState<string>('');
  const [authPassword, setAuthPassword] = useState<string>('');
  const [authDeliveryChannel, setAuthDeliveryChannel] = useState<'email' | 'sms'>('email');
  const [authPhone, setAuthPhone] = useState<string>('');
  const [activationCodeInput, setActivationCodeInput] = useState<string>('');
  const [dispatchedNotice, setDispatchedNotice] = useState<string>('');
  const [authError, setAuthError] = useState<string>('');
  const [isSubmittingAuth, setIsSubmittingAuth] = useState<boolean>(false);

  const [newPeerGithubHandle, setNewPeerGithubHandle] = useState<string>('');
  const [isAddingPeer, setIsAddingPeer] = useState<boolean>(false);

  // GitHub Search (Repositories & Peers) State
  const [githubSearchQuery, setGithubSearchQuery] = useState<string>('');
  const [githubSearchType, setGithubSearchType] = useState<'all' | 'repositories' | 'users'>('all');
  const [isSearchingGitHub, setIsSearchingGitHub] = useState<boolean>(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState<boolean>(false);
  const [githubSearchResults, setGithubSearchResults] = useState<{
    repositories: Array<{
      fullName: string;
      description: string;
      defaultBranch: string;
      stars: number;
      language: string;
      openIssues: number;
    }>;
    users: Array<{
      login: string;
      name: string;
      avatarUrl: string;
      bio: string;
      organization: string;
      publicRepos: number;
    }>;
  }>({ repositories: [], users: [] });

  // Workspace Dashboard Section State
  const [showWorkspaceDashboard, setShowWorkspaceDashboard] = useState<boolean>(true);
  const [workspaceDashboardTab, setWorkspaceDashboardTab] = useState<'contributors' | 'prs'>(
    'contributors'
  );

  // CI/CD Failing Build Toast & Desktop Notification State
  const [ciFailureToasts, setCiFailureToasts] = useState<
    Array<{
      id: string;
      repo: string;
      branch: string;
      commit: string;
      workflow: string;
      reason: string;
      timestamp: string;
    }>
  >([]);
  const [desktopNotifPermission, setDesktopNotifPermission] = useState<string>(() =>
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );
  const prevCiStatusMapRef = useRef<Record<string, 'Passing' | 'Failing' | 'Running'>>({});

  // Passive Network Observer State (Automatically observes user's live network data)
  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [offlineQueue, setOfflineQueue] = useState<QueuedOfflineAction[]>(() =>
    getOfflineQueue()
  );
  const [isSyncingQueue, setIsSyncingQueue] = useState<boolean>(false);

  // Real GitHub Peers & Repositories (Initialized as clean empty collections for real users)
  const [peers, setPeers] = useState<DeveloperPeer[]>([]);
  const [selectedPeerHandle, setSelectedPeerHandle] = useState<string>('');
  const [globalFocusSwitch, setGlobalFocusSwitch] = useState<boolean>(false);

  // Messages & Repositories (Persisted to localStorage so chat history & reactions survive refreshes)
  const [messagesByPeer, setMessagesByPeer] = useState<Record<string, ChatMessage[]>>(() => {
    try {
      const saved = localStorage.getItem('nerve_p2p_messages_by_peer_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {
      // Ignore storage error
    }
    return {};
  });

  useEffect(() => {
    try {
      localStorage.setItem('nerve_p2p_messages_by_peer_v1', JSON.stringify(messagesByPeer));
    } catch {
      // Ignore storage quota error
    }
  }, [messagesByPeer]);

  const [activeReactionPickerMessageId, setActiveReactionPickerMessageId] = useState<string | null>(null);
  const [p2pRoomId, setP2pRoomId] = useState<string>('nerve-core-room');
  const [p2pPassphrase, setP2pPassphrase] = useState<string>(() =>
    getEnvEncodedStorage('nerve_p2p_passphrase', 'nerve-aes-256-secret-key')
  );

  useEffect(() => {
    setEnvEncodedStorage('nerve_p2p_passphrase', p2pPassphrase);
  }, [p2pPassphrase]);
  const [p2pTransportMode, setP2pTransportMode] = useState<SignalingTransportMode>('hybrid');

  // Auto-dismiss reaction picker on outside click or escape
  useEffect(() => {
    if (!activeReactionPickerMessageId) return;
    const handleDocumentClick = () => {
      setActiveReactionPickerMessageId(null);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveReactionPickerMessageId(null);
    };
    window.addEventListener('click', handleDocumentClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleDocumentClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeReactionPickerMessageId]);

  const [repositories, setRepositories] = useState<Record<string, RepositoryContext>>({});
  const [composerText, setComposerText] = useState<string>('');
  const [isSharkThinking, setIsSharkThinking] = useState<boolean>(false);

  // Code & Codespace Drawer persisted via localStorage hook across browser refreshes
  const [isCodeDrawerOpen, setIsCodeDrawerOpen] = useState<boolean>(true);
  const [showTerminal, setShowTerminal] = useState<boolean>(true);
  const [showFileExplorer, setShowFileExplorer] = useState<boolean>(true);
  const [collapsedDirs, setCollapsedDirs] = useState<Record<string, boolean>>({});
  const [terminalHistoryIndex, setTerminalHistoryIndex] = useState<number>(-1);
  const terminalDraftRef = useRef<string>('');
  const terminalSectionRef = useRef<HTMLDivElement | null>(null);
  const terminalInputRef = useRef<HTMLInputElement | null>(null);
  const chatComposerInputRef = useRef<HTMLInputElement | null>(null);
  const githubSearchInputRef = useRef<HTMLInputElement | null>(null);
  const [sharedFileFeedback, setSharedFileFeedback] = useState<boolean>(false);

  const {
    activeRepoKey,
    setActiveRepoKey,
    activeFilePath,
    setActiveFilePath,
    highlightedLine,
    setHighlightedLine,
    terminalLogs,
    setTerminalLogs,
    terminalCommandHistory,
    setTerminalCommandHistory,
    patchApplied,
    setPatchApplied,
    keyEnvironment,
    setKeyEnvironment,
    liveApiKey,
    setLiveApiKey,
    testApiKey,
    setTestApiKey,
  } = useWorkspacePersistence();

  // Multi-Terminal Workspace Instances ('terminal', 't1', 't2', ...)
  // Separated from the static 'Codespace' indicator; each instance supports Build/Logs dropdown & Split Terminal
  const [terminalInstances, setTerminalInstances] = useState<TerminalWorkspaceInstance[]>(() => [
    {
      id: 'terminal-main',
      name: 'terminal',
      isDeletable: false,
      activeSubTab: 'build',
      secondarySubTab: 'logs',
      splitDirection: 'none',
      subTabs: createTerminalSubTabs(terminalLogs),
      cwd: '~/acme-cloud/edge-router',
      history: [],
      tasks: [{ id: 'task-1', name: 'daemon', pid: 4120, status: 'running', startTime: 'just now' }],
      status: 'idle',
    },
  ]);
  const [activeTerminalInstanceId, setActiveTerminalInstanceId] =
    useState<string>('terminal-main');
  const nextTerminalNumberRef = useRef<number>(1);

  // Split view state across multiple terminal instances (requires > 1 terminal)
  const [terminalSplitDirection, setTerminalSplitDirection] =
    useState<TerminalSplitDirection>('none');
  const [primarySplitInstanceId, setPrimarySplitInstanceId] =
    useState<string>('terminal-main');
  const [secondarySplitInstanceId, setSecondarySplitInstanceId] =
    useState<string>('');

  // Draggable split view resizer state
  const [verticalSplitRatio, setVerticalSplitRatio] = useState<number>(50); // percentage (15% to 85%)
  const [horizontalSplitHeight, setHorizontalSplitHeight] = useState<number>(140); // px
  const [isDraggingSplitter, setIsDraggingSplitter] = useState<'vertical' | 'horizontal' | null>(null);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);

  // Side Session Summary Drawer & Real-Time Network System Metrics
  const [showSessionSummaryDrawer, setShowSessionSummaryDrawer] = useState<boolean>(false);
  const [networkMetrics, setNetworkMetrics] = useState<{ upKb: number; downKb: number }>({
    upKb: 124,
    downKb: 48,
  });

  // Dropdown states for selecting Build / Logs and Existing Terminals (+ and Split Terminal Holders)
  const [showSubTabDropdown, setShowSubTabDropdown] = useState<boolean>(false);
  const [showSecondarySubTabDropdown, setShowSecondarySubTabDropdown] = useState<boolean>(false);
  const [showPrimaryInstanceDropdown, setShowPrimaryInstanceDropdown] = useState<boolean>(false);
  const [showSecondaryInstanceDropdown, setShowSecondaryInstanceDropdown] = useState<boolean>(false);
  const [showTerminalsDropdown, setShowTerminalsDropdown] = useState<boolean>(false);

  // Terminal Settings Menu (Macros + Appearance ANSI Color Schemes + Independent Terminal Output Theme)
  const [showTerminalSettings, setShowTerminalSettings] = useState<boolean>(false);
  const [terminalSettingsTab, setTerminalSettingsTab] = useState<'macros' | 'appearance'>('macros');
  const [ansiColorScheme, setAnsiColorScheme] = useState<AnsiColorSchemeId>(() => {
    try {
      const saved = localStorage.getItem('nerve_terminal_ansi_scheme_v1') as AnsiColorSchemeId | null;
      if (saved && ['vscode-dark', 'monokai', 'solarized', 'dracula', 'cyber-dark', 'nord'].includes(saved)) {
        return saved;
      }
    } catch {
      // Ignore storage error
    }
    return 'cyber-dark';
  });
  const [terminalOutputTheme, setTerminalOutputTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('nerve_terminal_output_theme_v1');
      if (saved === 'light' || saved === 'dark') {
        return saved;
      }
    } catch {
      // Ignore storage error
    }
    return 'dark';
  });

  // Live Codespace Resource Usage Indicator (CPU % & Memory MB updating every few seconds while process is running)
  const [codespaceProcessActive, setCodespaceProcessActive] = useState<boolean>(true);
  const [codespaceResourceMetrics, setCodespaceResourceMetrics] = useState<{
    cpuPercent: number;
    memoryMb: number;
  }>({
    cpuPercent: 28,
    memoryMb: 396,
  });
  const codespaceProcessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [terminalMacros, setTerminalMacros] = useState<TerminalMacro[]>(() => {
    try {
      const raw = localStorage.getItem('nerve_terminal_macros_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Ignore storage error
    }
    return DEFAULT_TERMINAL_MACROS;
  });
  const [newMacroLabel, setNewMacroLabel] = useState<string>('');
  const [newMacroShortcut, setNewMacroShortcut] = useState<string>('Alt+M');
  const [newMacroCommand, setNewMacroCommand] = useState<string>('npm run build && npm test');
  const [isRecordingShortcut, setIsRecordingShortcut] = useState<boolean>(false);

  useEffect(() => {
    try {
      localStorage.setItem('nerve_terminal_ansi_scheme_v1', ansiColorScheme);
    } catch {
      // Ignore storage error
    }
  }, [ansiColorScheme]);

  useEffect(() => {
    try {
      localStorage.setItem('nerve_terminal_output_theme_v1', terminalOutputTheme);
    } catch {
      // Ignore storage error
    }
  }, [terminalOutputTheme]);

  useEffect(() => {
    try {
      localStorage.setItem('nerve_terminal_macros_v1', JSON.stringify(terminalMacros));
    } catch {
      // Ignore storage error
    }
  }, [terminalMacros]);

  useEffect(() => {
    const netInterval = setInterval(() => {
      setNetworkMetrics({
        upKb: Math.floor(75 + Math.random() * 110),
        downKb: Math.floor(35 + Math.random() * 85),
      });
    }, 3200);
    return () => clearInterval(netInterval);
  }, []);

  // Live keyword search/filter for terminal log lines & selected line reference for incident triage
  const [terminalLogFilter, setTerminalLogFilter] = useState<string>('');
  const [selectedTerminalLogLine, setSelectedTerminalLogLine] = useState<{
    instanceId: string;
    subTab: string;
    lineNumber: number;
  } | null>(null);

  // Context menu state for renaming terminal session tabs (max 8 chars, no spaces or '.')
  const [terminalTabContextMenu, setTerminalTabContextMenu] = useState<{
    instanceId: string;
    draftName: string;
  } | null>(null);
  const [terminalRenameError, setTerminalRenameError] = useState<string>('');
  const renameTerminalInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-scroll lock refs for terminal log container
  const terminalLogContainerRef = useRef<HTMLDivElement | null>(null);
  const secondaryTerminalLogContainerRef = useRef<HTMLDivElement | null>(null);
  const isTerminalAtBottomRef = useRef<boolean>(true);

  const hasMultipleTerminals = terminalInstances.length > 1;
  const effectiveSplitDirection: TerminalSplitDirection = hasMultipleTerminals
    ? terminalSplitDirection
    : 'none';

  const activeTerminalInstance =
    terminalInstances.find((inst) => inst.id === activeTerminalInstanceId) ||
    terminalInstances[0];

  // Primary & Secondary Terminal Instances when in Split View (> 1 terminal)
  const primaryPaneInstance =
    effectiveSplitDirection !== 'none'
      ? terminalInstances.find((inst) => inst.id === primarySplitInstanceId) ||
        terminalInstances[0]
      : activeTerminalInstance;

  const secondaryPaneInstance =
    effectiveSplitDirection !== 'none'
      ? terminalInstances.find(
          (inst) =>
            inst.id === secondarySplitInstanceId &&
            inst.id !== primaryPaneInstance.id
        ) ||
        terminalInstances.find((inst) => inst.id !== primaryPaneInstance.id) ||
        terminalInstances[0]
      : activeTerminalInstance;

  const activeTerminalSession =
    activeTerminalInstance.subTabs[activeTerminalInstance.activeSubTab];
  const primaryPaneSession =
    primaryPaneInstance.subTabs[primaryPaneInstance.activeSubTab];
  const secondaryPaneSession =
    secondaryPaneInstance.subTabs[secondaryPaneInstance.activeSubTab];

  const terminalInput = activeTerminalSession?.input ?? '';
  const isRunningTerminal = activeTerminalSession?.isRunning ?? false;
  const anySubTabRunning = terminalInstances.some((inst) =>
    Object.values(inst.subTabs).some((st) => st.isRunning)
  );
  const isCodespaceProcessRunning = codespaceProcessActive || anySubTabRunning;

  // Poll / update Codespace Memory & CPU usage every 2.5 seconds while a process is running in the Codespace
  useEffect(() => {
    if (!isCodespaceProcessRunning) return;

    const currentKey = keyEnvironment === 'live' ? liveApiKey : testApiKey;
    const pollTelemetry = async () => {
      try {
        const res = await fetch('/api/v1/codespaces/telemetry?active=true', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${currentKey}`,
          },
        });
        if (res.ok) {
          const data = await res.json();
          if (typeof data.cpuPercent === 'number' && typeof data.memoryMb === 'number') {
            setCodespaceResourceMetrics({
              cpuPercent: data.cpuPercent,
              memoryMb: data.memoryMb,
            });
            return;
          }
        }
      } catch {
        // Fallback to local jitter when offline
      }

      setCodespaceResourceMetrics((prev) => ({
        cpuPercent: Math.min(92, Math.max(18, prev.cpuPercent + Math.round((Math.random() - 0.48) * 14))),
        memoryMb: Math.min(1680, Math.max(320, prev.memoryMb + Math.round((Math.random() - 0.46) * 28))),
      }));
    };

    const intervalId = setInterval(pollTelemetry, 2500);
    return () => clearInterval(intervalId);
  }, [isCodespaceProcessRunning, keyEnvironment, liveApiKey, testApiKey]);

  // Lightweight command suggestion engine matching terminalCommandHistory as user types
  const commandSuggestions = (() => {
    const query = terminalInput.trim().toLowerCase();
    if (!query) return [];
    const seen = new Set<string>();
    const matches: string[] = [];
    for (let i = terminalCommandHistory.length - 1; i >= 0; i--) {
      const cmd = terminalCommandHistory[i];
      const lower = cmd.toLowerCase();
      if (!seen.has(lower) && lower.includes(query) && lower !== query) {
        seen.add(lower);
        matches.push(cmd);
        if (matches.length >= 5) break;
      }
    }
    return matches;
  })();

  // Focus helper: automatically sets focus to the interacted terminal instance (primary or secondary)
  const handleFocusTerminalInstance = (
    instanceId: string,
    shouldFocusInput = false
  ) => {
    setActiveTerminalInstanceId(instanceId);
    if (
      effectiveSplitDirection !== 'none' &&
      instanceId !== primaryPaneInstance.id &&
      instanceId !== secondaryPaneInstance.id
    ) {
      setSecondarySplitInstanceId(instanceId);
    }
    setTerminalHistoryIndex(-1);
    isTerminalAtBottomRef.current = true;
    if (shouldFocusInput) {
      setTimeout(() => terminalInputRef.current?.focus(), 20);
    }
  };

  const setTerminalInput = (val: string) => {
    const instId = activeTerminalInstance.id;
    const subKey = activeTerminalInstance.activeSubTab;
    setTerminalInstances((prev) =>
      prev.map((inst) =>
        inst.id === instId
          ? {
              ...inst,
              subTabs: {
                ...inst.subTabs,
                [subKey]: { ...inst.subTabs[subKey], input: val },
              },
            }
          : inst
      )
    );
  };

  // Clear Terminal: completely deletes both 'build' and 'logs' output on the active terminal
  const handleClearActiveTerminal = (targetInstanceId?: string) => {
    const resolvedId = targetInstanceId || activeTerminalInstance.id;
    setTerminalInstances((prev) =>
      prev.map((inst) =>
        inst.id === resolvedId
          ? {
              ...inst,
              subTabs: {
                build: { ...inst.subTabs.build, logs: [], input: '' },
                logs: { ...inst.subTabs.logs, logs: [], input: '' },
              },
            }
          : inst
      )
    );
  };

  // Download Terminal Logs: exports the current session's log output as a raw text file (.txt) for local review
  const handleDownloadTerminalSessionLogs = (targetInstanceId?: string) => {
    const resolvedId = targetInstanceId || activeTerminalInstance.id;
    const targetInstance =
      terminalInstances.find((inst) => inst.id === resolvedId) ||
      activeTerminalInstance;
    const activeSubTabKey = targetInstance.activeSubTab;
    const activeSession = targetInstance.subTabs[activeSubTabKey];
    const rawLines = (activeSession?.logs || [])
      .flatMap((block) => block.split('\n'))
      .map((line, idx) => {
        // eslint-disable-next-line no-control-regex
        const clean = line.replace(/\x1b\[[0-9;]*m/g, '');
        return `${String(idx + 1).padStart(3, ' ')} | ${clean}`;
      });
    const rawTextContent =
      rawLines.length > 0
        ? rawLines.join('\n')
        : `# No log output recorded for ${targetInstance.name} (${activeSession?.label || activeSubTabKey})`;

    const blob = new Blob([rawTextContent], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const safeName = targetInstance.name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'terminal';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeName}-${activeSubTabKey}-logs-${timestamp}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Sync primary 'terminal' -> 'build' session logs with persisted terminalLogs
  useEffect(() => {
    const primaryBuildLogs = terminalInstances[0]?.subTabs?.build?.logs;
    if (primaryBuildLogs && primaryBuildLogs !== terminalLogs) {
      setTerminalLogs(primaryBuildLogs);
    }
  }, [terminalInstances]);

  // Auto-scroll effect: keeps terminal log container locked to bottom when user is at bottom
  useEffect(() => {
    const container = terminalLogContainerRef.current;
    if (container && showTerminal && isTerminalAtBottomRef.current) {
      container.scrollTop = container.scrollHeight;
    }
    const secContainer = secondaryTerminalLogContainerRef.current;
    if (secContainer && showTerminal && effectiveSplitDirection !== 'none') {
      secContainer.scrollTop = secContainer.scrollHeight;
    }
  }, [
    primaryPaneSession.logs,
    secondaryPaneSession?.logs,
    activeTerminalInstance.id,
    primaryPaneInstance.id,
    secondaryPaneInstance.id,
    primaryPaneInstance.activeSubTab,
    secondaryPaneInstance.activeSubTab,
    effectiveSplitDirection,
    showTerminal,
  ]);

  const handleTerminalLogScroll = () => {
    const container = terminalLogContainerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    isTerminalAtBottomRef.current = distanceFromBottom <= 28;
  };

  const appendLogsToActiveOrTargetSession = (
    updater: string[] | ((prevLogs: string[]) => string[]),
    targetInstanceId?: string,
    targetSubTabKey?: TerminalSubTabKey
  ) => {
    const resolvedInstanceId = targetInstanceId || activeTerminalInstance.id;
    const resolvedSubKey = targetSubTabKey || activeTerminalInstance.activeSubTab;

    setTerminalInstances((prev) =>
      prev.map((inst) => {
        if (inst.id !== resolvedInstanceId) return inst;
        const currentSub = inst.subTabs[resolvedSubKey];
        const nextLogs =
          typeof updater === 'function' ? updater(currentSub.logs) : updater;
        return {
          ...inst,
          subTabs: {
            ...inst.subTabs,
            [resolvedSubKey]: {
              ...currentSub,
              logs: nextLogs,
            },
          },
        };
      })
    );
  };

  const handleCreateNewTerminalInstance = () => {
    // Compute lowest available t1, t2, t3... number
    const existingNums = terminalInstances.map((t) => {
      const m = t.name.match(/^t(\d+)$/i);
      return m ? parseInt(m[1], 10) : 0;
    });
    let nextNum = 1;
    while (existingNums.includes(nextNum)) {
      nextNum += 1;
    }
    nextTerminalNumberRef.current = Math.max(nextTerminalNumberRef.current, nextNum + 1);

    const newId = `terminal-${Date.now()}-${nextNum}`;
    const newInstance: TerminalWorkspaceInstance = {
      id: newId,
      name: `t${nextNum}`,
      isDeletable: true,
      activeSubTab: 'build',
      secondarySubTab: 'logs',
      splitDirection: 'none',
      subTabs: createTerminalSubTabs([]),
      cwd: '~/acme-cloud/edge-router',
      history: [],
      tasks: [],
      status: 'idle',
    };

    setTerminalInstances((prev) => [...prev, newInstance]);
    setPrimarySplitInstanceId((prev) => prev || terminalInstances[0].id);
    setSecondarySplitInstanceId(newId);
    setActiveTerminalInstanceId(newId);
    setShowTerminalsDropdown(false);
    setTerminalHistoryIndex(-1);
    isTerminalAtBottomRef.current = true;
    setTimeout(() => terminalInputRef.current?.focus(), 20);
  };

  const handleToggleSplitTerminal = (direction: 'vertical' | 'horizontal' | 'grid') => {
    if (terminalInstances.length <= 1) {
      return;
    }
    setTerminalSplitDirection((prev) => {
      const next = prev === direction ? 'none' : direction;
      if (next !== 'none') {
        const primaryId =
          terminalInstances.find((t) => t.id === primarySplitInstanceId)?.id ||
          terminalInstances[0].id;
        const secondaryId =
          terminalInstances.find(
            (t) => t.id === secondarySplitInstanceId && t.id !== primaryId
          )?.id ||
          terminalInstances.find((t) => t.id !== primaryId)?.id ||
          terminalInstances[0].id;
        setPrimarySplitInstanceId(primaryId);
        setSecondarySplitInstanceId(secondaryId);
      }
      return next;
    });
  };

  const handleSplitterMouseDown = (
    direction: 'vertical' | 'horizontal',
    e: React.MouseEvent
  ) => {
    e.preventDefault();
    setIsDraggingSplitter(direction);

    const container = splitContainerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (direction === 'vertical') {
        const deltaX = moveEvent.clientX - containerRect.left;
        const newRatio = Math.max(15, Math.min(85, (deltaX / containerRect.width) * 100));
        setVerticalSplitRatio(Math.round(newRatio));
      } else {
        const deltaY = moveEvent.clientY - containerRect.top;
        const newHeight = Math.max(70, Math.min(360, deltaY));
        setHorizontalSplitHeight(Math.round(newHeight));
      }
    };

    const handleMouseUp = () => {
      setIsDraggingSplitter(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleOpenTerminalTabContextMenu = (
    inst: TerminalWorkspaceInstance,
    e: React.MouseEvent
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setTerminalRenameError('');
    setTerminalTabContextMenu({
      instanceId: inst.id,
      draftName: inst.name,
    });
    setTimeout(() => {
      renameTerminalInputRef.current?.focus();
      renameTerminalInputRef.current?.select();
    }, 20);
  };

  const handleCommitTerminalRename = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!terminalTabContextMenu) return;
    const rawName = terminalTabContextMenu.draftName;

    if (rawName.includes(' ') || rawName.includes('.')) {
      setTerminalRenameError('No spaces or "." are allowed in terminal names.');
      return;
    }

    const cleanName = rawName.trim();
    if (!cleanName) {
      setTerminalRenameError('Enter a terminal name (1–8 characters).');
      return;
    }

    if (cleanName.length > 8) {
      setTerminalRenameError(
        `Terminal name must not exceed 8 characters (currently ${cleanName.length}).`
      );
      return;
    }

    setTerminalInstances((prev) =>
      prev.map((inst) =>
        inst.id === terminalTabContextMenu.instanceId
          ? { ...inst, name: cleanName }
          : inst
      )
    );
    setTerminalRenameError('');
    setTerminalTabContextMenu(null);
  };

  const handleDeleteTerminalInstance = (instanceId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setTerminalTabContextMenu((prev) =>
      prev?.instanceId === instanceId ? null : prev
    );
    setTerminalRenameError('');
    setTerminalInstances((prev) => {
      const target = prev.find((inst) => inst.id === instanceId);
      if (!target || !target.isDeletable || prev.length <= 1) return prev;
      const filtered = prev.filter((inst) => inst.id !== instanceId);
      if (activeTerminalInstanceId === instanceId) {
        setActiveTerminalInstanceId(filtered[filtered.length - 1].id);
      }
      if (filtered.length <= 1) {
        setTerminalSplitDirection('none');
        setShowTerminalsDropdown(false);
      } else {
        if (primarySplitInstanceId === instanceId) {
          setPrimarySplitInstanceId(filtered[0].id);
        }
        if (secondarySplitInstanceId === instanceId) {
          const nextSec =
            filtered.find((t) => t.id !== primarySplitInstanceId) ||
            filtered[filtered.length - 1];
          setSecondarySplitInstanceId(nextSec.id);
        }
      }
      return filtered;
    });
  };

  const handleAddTerminalMacro = (e: React.FormEvent) => {
    e.preventDefault();
    const shortcut = newMacroShortcut.trim();
    const command = newMacroCommand.trim();
    const label = newMacroLabel.trim() || command.slice(0, 18);
    if (!shortcut || !command) return;

    const newMacro: TerminalMacro = {
      id: `macro-${Date.now()}`,
      label,
      shortcut,
      command,
    };
    setTerminalMacros((prev) => [
      ...prev.filter((m) => m.shortcut.toLowerCase() !== shortcut.toLowerCase()),
      newMacro,
    ]);
    setNewMacroLabel('');
  };

  const handleDeleteTerminalMacro = (id: string) => {
    setTerminalMacros((prev) => prev.filter((m) => m.id !== id));
  };

  // Global Keyboard Shortcuts & User-Definable Terminal Macros:
  // - Ctrl+Shift+T: Toggle terminal
  // - Ctrl+Shift+C: Focus chat composer
  // - Ctrl+Shift+P: Open GitHub search bar
  // - Custom Macro Shortcuts (e.g., Alt+B -> 'npm run build && npm test')
  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      if (isRecordingShortcut) return;

      // 1. Check User-Defined Terminal Macros first
      if (e.altKey || e.ctrlKey || e.metaKey || /^F\d+$/.test(e.key)) {
        const combo = formatKeyboardEventShortcut(e);
        const matchedMacro = terminalMacros.find(
          (m) => m.shortcut.toLowerCase() === combo.toLowerCase()
        );
        if (matchedMacro) {
          e.preventDefault();
          setActiveTab('workspace');
          setIsCodeDrawerOpen(true);
          setShowTerminal(true);
          handleRunCodespaceCommand(
            matchedMacro.command,
            activeTerminalInstance.id,
            activeTerminalInstance.activeSubTab
          );
          return;
        }
      }

      // 2. Tab Navigation & Shortcuts: Alt/Cmd+T for new tab, Alt/Cmd+W to close, Alt/Cmd+1-9 to switch directly, Alt/Cmd+Left/Right to cycle
      const isAltOrCmd = e.altKey || (e.metaKey && !e.ctrlKey);
      if (isAltOrCmd) {
        if (e.key === 't' || e.key === 'T') {
          e.preventDefault();
          setActiveTab('workspace');
          setIsCodeDrawerOpen(true);
          setShowTerminal(true);
          handleCreateNewTerminalInstance();
          return;
        }

        if (e.key === 'w' || e.key === 'W') {
          if (activeTerminalInstance && activeTerminalInstance.isDeletable) {
            e.preventDefault();
            handleDeleteTerminalInstance(activeTerminalInstance.id);
            return;
          }
        }

        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          setTerminalInstances((prev) => {
            const currIdx = prev.findIndex((t) => t.id === activeTerminalInstanceId);
            if (currIdx !== -1 && prev.length > 1) {
              const prevIdx = (currIdx - 1 + prev.length) % prev.length;
              setActiveTerminalInstanceId(prev[prevIdx].id);
              setTimeout(() => terminalInputRef.current?.focus(), 20);
            }
            return prev;
          });
          return;
        }

        if (e.key === 'ArrowRight') {
          e.preventDefault();
          setTerminalInstances((prev) => {
            const currIdx = prev.findIndex((t) => t.id === activeTerminalInstanceId);
            if (currIdx !== -1 && prev.length > 1) {
              const nextIdx = (currIdx + 1) % prev.length;
              setActiveTerminalInstanceId(prev[nextIdx].id);
              setTimeout(() => terminalInputRef.current?.focus(), 20);
            }
            return prev;
          });
          return;
        }

        const digit = parseInt(e.key, 10);
        if (!isNaN(digit) && digit >= 1 && digit <= 9) {
          const target = terminalInstances[digit - 1];
          if (target) {
            e.preventDefault();
            setActiveTerminalInstanceId(target.id);
            setTimeout(() => terminalInputRef.current?.focus(), 20);
            return;
          }
        }
      }

      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return;
      const key = e.key.toLowerCase();

      if (key === 't') {
        e.preventDefault();
        setActiveTab('workspace');
        setShowTerminal((prevOpen) => {
          const nextOpen = !prevOpen || !isCodeDrawerOpen;
          if (nextOpen) {
            setIsCodeDrawerOpen(true);
            setTimeout(() => {
              terminalSectionRef.current?.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
              });
              terminalInputRef.current?.focus();
            }, 60);
          }
          return nextOpen;
        });
      } else if (key === 'c') {
        e.preventDefault();
        setActiveTab('workspace');
        setTimeout(() => {
          chatComposerInputRef.current?.focus();
        }, 50);
      } else if (key === 'p') {
        e.preventDefault();
        setActiveTab('workspace');
        setShowSearchDropdown(true);
        setTimeout(() => {
          githubSearchInputRef.current?.focus();
          githubSearchInputRef.current?.select();
        }, 50);
      }
    };

    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, [
    isCodeDrawerOpen,
    terminalMacros,
    isRecordingShortcut,
    activeTerminalInstance.id,
    activeTerminalInstance.activeSubTab,
    patchApplied,
    activeRepoKey,
  ]);

  const apiKey = keyEnvironment === 'live' ? liveApiKey : testApiKey;

  // Report Bug Modal & Full Workflow Reports
  const [showBugModal, setShowBugModal] = useState<boolean>(false);
  const [bugRepo, setBugRepo] = useState<string>('');
  const [bugBranch, setBugBranch] = useState<string>('main');
  const [bugFile, setBugFile] = useState<string>('src/index.ts');
  const [bugLine, setBugLine] = useState<number>(1);
  const [bugSummary, setBugSummary] = useState<string>('');
  const [bugStackTrace, setBugStackTrace] = useState<string>('');

  // List of bug fixes in action (clean empty collection for real incidents)
  const [incidentReports, setIncidentReports] = useState<IncidentWorkflowReport[]>([]);
  const [selectedIncidentTicketId, setSelectedIncidentTicketId] = useState<string>('');

  useEffect(() => {
    if (activeRepoKey && !bugRepo) {
      setBugRepo(activeRepoKey);
    }
    if (activeFilePath) {
      setBugFile(activeFilePath);
    }
    if (highlightedLine) {
      setBugLine(highlightedLine);
    }
  }, [activeRepoKey, activeFilePath, highlightedLine]);

  // Listen to Firebase Auth state and load user's saved GitHub peers
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const syncedPeers = await syncAuthenticatedUserAndPeers(user);
          if (syncedPeers.length > 0) {
            setPeers(syncedPeers);
            setSelectedPeerHandle((prev) => prev || syncedPeers[0].handle);
          }
        } catch (err) {
          console.error('Error syncing Firestore GitHub peers:', err);
        }
      }
    });
    return () => unsub();
  }, []);

  // =========================================================================
  // AUTHENTICATION HANDLERS:
  // 1. Direct Email + Password Sign-In
  // 2. Sign-Up with Email/Password + Activation Code / SMS Text Verification
  // 3. GitHub & Google Auto Sign-In
  // =========================================================================
  const saveVerifiedEmailSession = (session: VerifiedEmailSession | null) => {
    setEmailSession(session);
    try {
      if (session) {
        localStorage.setItem(LOCAL_AUTH_SESSION_KEY, JSON.stringify(session));
      } else {
        localStorage.removeItem(LOCAL_AUTH_SESSION_KEY);
      }
    } catch {
      // Ignore storage error
    }
  };

  const handleEmailPasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setDispatchedNotice('');

    const cleanEmail = authEmail.trim().toLowerCase();
    if (!cleanEmail || !authPassword) {
      setAuthError('Please enter your email and password.');
      return;
    }

    setIsSubmittingAuth(true);
    try {
      // First try Firebase Email/Password Sign-In if enabled in Firebase Console
      try {
        await signInWithEmailAndPassword(auth, cleanEmail, authPassword);
        setShowAuthModal(false);
        return;
      } catch {
        // Continue to Nerve Auth Verification Server
      }

      const res = await fetch('/api/v1/auth/email-signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password: authPassword }),
      });
      const data = await res.json();

      if (res.status === 403 && data.error === 'ACTIVATION_REQUIRED') {
        setAuthModalMode('signup');
        setSignUpStep('verify_code');
        setDispatchedNotice(
          'Account requires activation. Enter the 6-digit activation code sent to your email.'
        );
        return;
      }

      if (!res.ok) {
        setAuthError(data.message || 'Sign-in failed. Check your credentials or tap Sign Up.');
        return;
      }

      if (data.user) {
        saveVerifiedEmailSession(data.user);
        setShowAuthModal(false);
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Unable to sign in.');
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleRequestSignUpActivationCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setDispatchedNotice('');

    const cleanEmail = authEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setAuthError('Enter a valid email address.');
      return;
    }
    if (!authPassword || authPassword.length < 6) {
      setAuthError('Password must be at least 6 characters.');
      return;
    }
    if (authDeliveryChannel === 'sms' && !authPhone.trim()) {
      setAuthError('Enter a phone number to receive the activation text.');
      return;
    }

    setIsSubmittingAuth(true);
    try {
      // Attempt Firebase native account creation + email verification link in parallel
      try {
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, authPassword);
        if (cred.user) {
          await sendEmailVerification(cred.user);
        }
      } catch {
        // Proceed with 6-digit activation code/text dispatch via Nerve Auth API
      }

      let token = getCachedGmailAccessToken() || '';
      if (authDeliveryChannel === 'email' && !token) {
        try {
          const gRes = await signInWithGoogleForGmail();
          token = gRes.accessToken;
        } catch {
          // Proceed to backend dispatch if popup closed
        }
      }

      const res = await fetch('/api/v1/auth/send-activation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          email: cleanEmail,
          password: authPassword,
          channel: authDeliveryChannel,
          phone: authPhone.trim(),
          gmailAccessToken: token,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setAuthError(data.message || 'Could not dispatch activation code.');
        return;
      }

      setSignUpStep('verify_code');
      setDispatchedNotice(
        data.message ||
          `Activation code sent to ${authDeliveryChannel === 'sms' ? authPhone : cleanEmail}.`
      );
    } catch (err: any) {
      setAuthError(err?.message || 'Failed to send activation code.');
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleVerifySignUpActivationCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    const cleanEmail = authEmail.trim().toLowerCase();
    const cleanCode = activationCodeInput.trim();
    if (!cleanCode) {
      setAuthError('Enter the 6-digit activation code.');
      return;
    }

    setIsSubmittingAuth(true);
    try {
      const res = await fetch('/api/v1/auth/verify-activation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, code: cleanCode }),
      });
      const data = await res.json();

      if (!res.ok) {
        setAuthError(data.message || 'Invalid activation code.');
        return;
      }

      if (data.user) {
        saveVerifiedEmailSession(data.user);
        setShowAuthModal(false);
        setSignUpStep('credentials');
        setActivationCodeInput('');
        setDispatchedNotice('');
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Verification failed.');
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleGitHubOAuthSignIn = async () => {
    setAuthError('');
    setIsSubmittingAuth(true);
    try {
      const result = await signInWithPopup(auth, githubProvider);
      if (result.user) {
        const ghScreenName =
          (result as any)?._tokenResponse?.screenName ||
          (result.user as any)?.reloadUserInfo?.screenName ||
          result.user.displayName?.toLowerCase().replace(/[^a-z0-9-]/g, '-') ||
          undefined;
        const syncedPeers = await syncAuthenticatedUserAndPeers(result.user, ghScreenName);
        if (syncedPeers.length > 0) {
          setPeers((prev) => {
            const existingHandles = new Set(prev.map((p) => p.handle.toLowerCase()));
            const merged = [...prev];
            for (const sp of syncedPeers) {
              if (!existingHandles.has(sp.handle.toLowerCase())) {
                merged.push(sp);
              }
            }
            return merged;
          });
        }
      }
      setShowAuthModal(false);
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/operation-not-allowed') {
        setAuthError(
          'Enable GitHub provider in Firebase Console (Authentication -> Sign-in method -> GitHub), or use Email/Password or Google Sign-In.'
        );
      } else {
        setAuthError(err?.message || 'GitHub sign-in popup could not complete.');
      }
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleGoogleOAuthSignIn = async () => {
    setAuthError('');
    setIsSubmittingAuth(true);
    try {
      const res = await signInWithGoogleForGmail();
      if (res?.user) {
        const syncedPeers = await syncAuthenticatedUserAndPeers(res.user);
        if (syncedPeers.length > 0) {
          setPeers((prev) => {
            const existingHandles = new Set(prev.map((p) => p.handle.toLowerCase()));
            const merged = [...prev];
            for (const sp of syncedPeers) {
              if (!existingHandles.has(sp.handle.toLowerCase())) {
                merged.push(sp);
              }
            }
            return merged;
          });
        }
      }
      setShowAuthModal(false);
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/operation-not-allowed') {
        setAuthError(
          'Enable Google provider in Firebase Console (Authentication -> Sign-in method -> Google), or use Email/Password or GitHub Sign-In.'
        );
      } else {
        setAuthError(err?.message || 'Google sign-in popup could not complete.');
      }
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleSignOutAll = async () => {
    saveVerifiedEmailSession(null);
    if (currentUser) {
      await signOut(auth);
    }
  };

  const handleAddRealGitHubPeer = async (e: React.FormEvent) => {
    e.preventDefault();
    const handle = newPeerGithubHandle.trim().replace(/^@/, '');
    if (!handle) return;

    setIsAddingPeer(true);
    try {
      const addedPeer = await addRealGitHubPeerToFirestore(currentUser, handle);
      setPeers((prev) => {
        const exists = prev.some((p) => p.handle.toLowerCase() === addedPeer.handle.toLowerCase());
        if (exists) return prev;
        return [addedPeer, ...prev];
      });
      setSelectedPeerHandle(addedPeer.handle);
      setNewPeerGithubHandle('');
    } catch (err) {
      console.error('Failed to add GitHub peer:', err);
    } finally {
      setIsAddingPeer(false);
    }
  };

  // Emit Desktop Notification + In-App Toast Overlay when CI/CD build status becomes 'Failing'
  const emitCiFailureNotification = (
    repoName: string,
    branchName: string,
    commitHash: string,
    reasonText: string
  ) => {
    const toastId = `ci-fail-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newToast = {
      id: toastId,
      repo: repoName,
      branch: branchName,
      commit: commitHash,
      workflow: 'GitHub Actions CI',
      reason: reasonText,
      timestamp: new Date().toLocaleTimeString(),
    };

    setCiFailureToasts((prev) => [newToast, ...prev.slice(0, 3)]);

    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        try {
          new Notification(`CI/CD Build Failing · ${repoName}`, {
            body: `[${branchName} @ ${commitHash}] ${reasonText}`,
          });
        } catch {
          // Ignore Notification errors in restricted frames
        }
      }
    }
  };

  const requestDesktopNotificationPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      const result = await Notification.requestPermission();
      setDesktopNotifPermission(result);
    } catch {
      // Ignore permission request failure
    }
  };

  // Watch monitored repositories for any CI/CD status transition to 'Failing'
  useEffect(() => {
    Object.values(repositories).forEach((repoObj) => {
      const prevStatus = prevCiStatusMapRef.current[repoObj.repo];
      if (prevStatus && prevStatus !== 'Failing' && repoObj.ciStatus === 'Failing') {
        emitCiFailureNotification(
          repoObj.repo,
          repoObj.branch,
          repoObj.latestCommit,
          `CI/CD pipeline transitioned from ${prevStatus} to Failing on ${repoObj.repo}#${repoObj.branch}.`
        );
      }
      prevCiStatusMapRef.current[repoObj.repo] = repoObj.ciStatus;
    });
  }, [repositories]);

  // Execute GitHub Search for external repositories & peers
  const handleExecuteGitHubSearch = async (
    e?: React.FormEvent,
    overrideType?: 'all' | 'repositories' | 'users'
  ) => {
    if (e) e.preventDefault();
    const q = githubSearchQuery.trim();
    if (!q) {
      setShowSearchDropdown(false);
      return;
    }

    const activeType = overrideType || githubSearchType;
    setIsSearchingGitHub(true);
    setShowSearchDropdown(true);
    try {
      const res = await fetch(
        `/api/v1/github/search?q=${encodeURIComponent(q)}&type=${encodeURIComponent(activeType)}`
      );
      const data = await res.json();
      setGithubSearchResults({
        repositories: Array.isArray(data.repositories) ? data.repositories : [],
        users: Array.isArray(data.users) ? data.users : [],
      });
    } catch (err) {
      console.error('GitHub search error:', err);
    } finally {
      setIsSearchingGitHub(false);
    }
  };

  // Track a real external repository found via GitHub Search and load its real files
  const handleTrackExternalRepository = async (repoItem: {
    fullName: string;
    description: string;
    defaultBranch: string;
    stars: number;
    language: string;
    openIssues: number;
  }) => {
    const repoKey = repoItem.fullName;
    let filePath = 'src/index.ts';
    let lines: string[] = [
      `// Repository: ${repoKey}`,
      `// Branch: ${repoItem.defaultBranch || 'main'}`,
    ];
    let branch = repoItem.defaultBranch || 'main';
    let openPrs = Math.max(0, repoItem.openIssues || 0);

    try {
      const filesRes = await fetch(`/api/v1/github/repo-files?repo=${encodeURIComponent(repoKey)}`);
      if (filesRes.ok) {
        const filesData = await filesRes.json();
        if (filesData.filePath && Array.isArray(filesData.lines) && filesData.lines.length > 0) {
          filePath = filesData.filePath;
          lines = filesData.lines;
          branch = filesData.branch || branch;
          openPrs = filesData.openIssues ?? openPrs;
        }
      }
    } catch {
      // Fallback to header lines if offline
    }

    const primaryPath = filePath.includes('/') ? filePath : `src/${filePath}`;
    const resolvedAuthor =
      selectedPeerHandle ||
      currentUser?.displayName ||
      emailSession?.displayName ||
      'maintainer';
    const baseLang = (repoItem.language || 'typescript').toLowerCase();

    const newRepoContext: RepositoryContext = {
      repo: repoKey,
      branch,
      ciStatus: 'Passing',
      latestCommit: 'HEAD',
      openPrs,
      activeCodespaceId: `cs-${repoKey.split('/')[1] || 'repo'}`,
      description: repoItem.description || '',
      files: {
        [primaryPath]: {
          path: primaryPath,
          language: baseLang,
          lastCommit: 'HEAD',
          author: resolvedAuthor,
          bugLine: 1,
          lines,
          patchedLines: [
            ...lines.slice(0, 5),
            '// [Nerve Shark] Guard applied for stream safety',
            ...lines.slice(5),
          ],
        },
        'src/core/engine.ts': {
          path: 'src/core/engine.ts',
          language: 'typescript',
          lastCommit: 'HEAD',
          author: resolvedAuthor,
          bugLine: 4,
          lines: [
            `// ${repoKey} — Core Execution Pipeline`,
            'export interface EngineConfig {',
            '  concurrency: number;',
            '  timeoutMs: number;',
            '}',
            '',
            'export async function runPipeline(config: EngineConfig): Promise<boolean> {',
            '  if (config.concurrency <= 0) throw new Error("Invalid concurrency");',
            '  return true;',
            '}',
          ],
        },
        'tests/runtime.spec.ts': {
          path: 'tests/runtime.spec.ts',
          language: 'typescript',
          lastCommit: 'HEAD',
          author: resolvedAuthor,
          bugLine: 2,
          lines: [
            `import { runPipeline } from "../src/core/engine";`,
            '',
            'export async function verifyRuntimeSuite() {',
            '  const ok = await runPipeline({ concurrency: 4, timeoutMs: 2000 });',
            '  console.log("Suite passed:", ok);',
            '}',
          ],
        },
        'package.json': {
          path: 'package.json',
          language: 'json',
          lastCommit: 'HEAD',
          author: resolvedAuthor,
          bugLine: 1,
          lines: [
            '{',
            `  "name": "${repoKey.split('/')[1] || repoKey}",`,
            '  "version": "1.0.0",',
            '  "scripts": {',
            '    "test": "vitest run",',
            '    "build": "tsc --noEmit"',
            '  }',
            '}',
          ],
        },
      },
    };

    prevCiStatusMapRef.current[repoKey] = 'Passing';
    setRepositories((prev) => ({
      ...prev,
      [repoKey]: newRepoContext,
    }));
    setActiveRepoKey(repoKey);
    setActiveFilePath(primaryPath);
    setHighlightedLine(1);
    setBugRepo(repoKey);
    setBugBranch(branch);
    setBugFile(filePath);
    setIsCodeDrawerOpen(true);
    setShowSearchDropdown(false);

    try {
      await fetch('/api/v1/ci/track-repo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          repo: repoKey,
          branch,
          status: 'Passing',
          latestCommit: 'HEAD',
        }),
      });
    } catch {
      // Ignore network error in offline mode
    }
  };

  // Track a GitHub peer found via GitHub Search
  const handleTrackSearchedPeer = async (login: string) => {
    setIsAddingPeer(true);
    try {
      const addedPeer = await addRealGitHubPeerToFirestore(currentUser, login);
      setPeers((prev) => {
        const exists = prev.some((p) => p.handle.toLowerCase() === addedPeer.handle.toLowerCase());
        if (exists) return prev;
        return [addedPeer, ...prev];
      });
      setSelectedPeerHandle(addedPeer.handle);
      setShowSearchDropdown(false);
    } catch (err) {
      console.error('Failed to track searched peer:', err);
    } finally {
      setIsAddingPeer(false);
    }
  };

  // Delete a searched or tracked user peer from state and Firestore
  const handleDeleteUserPeer = async (peerHandle: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    const cleanHandle = peerHandle.trim().replace(/^@/, '').toLowerCase();

    setPeers((prev) => {
      const remaining = prev.filter((p) => p.handle.toLowerCase() !== cleanHandle);
      if (selectedPeerHandle.toLowerCase() === cleanHandle) {
        setSelectedPeerHandle(remaining[0]?.handle || '');
      }
      return remaining;
    });

    setGithubSearchResults((prev) => ({
      ...prev,
      users: prev.users.filter((u) => u.login.toLowerCase() !== cleanHandle),
    }));

    try {
      await deleteGitHubPeerFromFirestore(currentUser, cleanHandle);
    } catch (err) {
      console.error('Failed to delete peer from Firestore:', err);
    }
  };

  // Flush LocalStorage offline queue automatically when network is restored
  const flushOfflineQueue = async () => {
    const queued = getOfflineQueue();
    if (queued.length === 0) return;

    setIsSyncingQueue(true);
    try {
      for (const item of queued) {
        if (item.type === 'message' && item.peerHandle && item.messagePayload) {
          const peerKey = item.peerHandle;
          const syncedMsg: ChatMessage = {
            ...item.messagePayload,
            timestamp: 'Synced',
          };
          setMessagesByPeer((prev) => ({
            ...prev,
            [peerKey]: [...(prev[peerKey] || []), syncedMsg],
          }));
        } else if (item.type === 'bug_dispatch' && item.bugPayload) {
          const bp = item.bugPayload;
          try {
            await fetch('/api/v1/incidents/dispatch', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                reporterHandle: bp.reporterHandle,
                targetRepo: bp.targetRepo,
                branch: bp.branch,
                filePath: bp.filePath,
                lineNumber: bp.lineNumber,
                summary: bp.summary,
                stackTrace: bp.stackTrace,
              }),
            });
          } catch {
            // Ignore network error during fallback
          }

          if (bp.peerHandle) {
            setMessagesByPeer((prev) => ({
              ...prev,
              [bp.peerHandle]: [...(prev[bp.peerHandle] || []), bp.chatMessage],
            }));
          }
          setIncidentReports((prev) => [bp.reportObject, ...prev]);
          setSelectedIncidentTicketId(bp.reportObject.ticketId);
        }
      }
      clearOfflineQueue();
      setOfflineQueue([]);
      setTerminalLogs((prev) => [
        ...prev,
        `[Network Live · Queue Synced] Automatically flushed ${queued.length} queued item(s).`,
      ]);
    } finally {
      setIsSyncingQueue(false);
    }
  };

  // Automatic Network Data Observer: Actively probes live network data so turning off Wi-Fi/mobile data immediately switches to Offline, and turning it back on switches to Online
  useEffect(() => {
    let isMounted = true;

    const markOnlineState = (onlineNow: boolean) => {
      if (!isMounted) return;
      setIsOffline((prevOffline) => {
        if (prevOffline && onlineNow) {
          flushOfflineQueue();
        }
        return !onlineNow;
      });
    };

    const probeLiveNetwork = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        markOnlineState(false);
        return;
      }

      const navConn = (navigator as any)?.connection;
      if (navConn && (navConn.downlink === 0 || navConn. effectiveType === 'none')) {
        markOnlineState(false);
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      try {
        // Probe both the origin server and live internet data with cache-busting
        const [apiPing] = await Promise.all([
          fetch(`/api/v1/ci/status?_ping=${Date.now()}`, {
            method: 'GET',
            cache: 'no-store',
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              Pragma: 'no-cache',
            },
            signal: controller.signal,
          }),
          fetch(`https://www.gstatic.com/generate_204?_ping=${Date.now()}`, {
            method: 'GET',
            mode: 'no-cors',
            cache: 'no-store',
            signal: controller.signal,
          }),
        ]);

        clearTimeout(timeoutId);
        if (!apiPing.ok) {
          markOnlineState(false);
          return;
        }
        markOnlineState(true);
      } catch {
        clearTimeout(timeoutId);
        markOnlineState(false);
      }
    };

    const handleOnline = () => {
      probeLiveNetwork();
    };

    const handleOffline = () => {
      markOnlineState(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', probeLiveNetwork);
    document.addEventListener('visibilitychange', probeLiveNetwork);

    const navConn = (navigator as any)?.connection;
    if (navConn && typeof navConn.addEventListener === 'function') {
      navConn.addEventListener('change', probeLiveNetwork);
    }

    // Initial check & continuous 2-second live network observer
    probeLiveNetwork();
    const heartbeat = setInterval(probeLiveNetwork, 2000);

    return () => {
      isMounted = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', probeLiveNetwork);
      document.removeEventListener('visibilitychange', probeLiveNetwork);
      if (navConn && typeof navConn.removeEventListener === 'function') {
        navConn.removeEventListener('change', probeLiveNetwork);
      }
      clearInterval(heartbeat);
    };
  }, []);

  const handleCreateApiKey = async (orgName: string, env: 'live' | 'test') => {
    try {
      const res = await fetch('/api/v1/keys/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: orgName || 'Production Engine Key',
          ownerOrg: 'Third-Party Partner',
          environment: env,
          scopes: ['*'],
        }),
      });
      const data = await res.json();
      if (data.apiKey) {
        if (env === 'test') {
          setTestApiKey(data.apiKey);
        } else {
          setLiveApiKey(data.apiKey);
        }
      }
    } catch (err) {
      console.error('Error generating key:', err);
    }
  };

  const activePeer: DeveloperPeer | undefined =
    peers.find((p) => p.handle === selectedPeerHandle) || peers[0];
  const isMutualFollow = activePeer ? activePeer.youFollowThem && activePeer.theyFollowYou : false;
  const hasProofOfWork = activePeer ? activePeer.proofOfWorkCommits >= 15 : true;
  const canOpenP2PChannel = Boolean(
    activePeer &&
      isMutualFollow &&
      hasProofOfWork &&
      !globalFocusSwitch &&
      !activePeer.focusModeOptOut
  );

  const activeRepo: RepositoryContext | undefined =
    repositories[activeRepoKey] || Object.values(repositories)[0];
  const activeFile = activeRepo
    ? activeRepo.files[activeFilePath] || Object.values(activeRepo.files)[0]
    : undefined;
  const displayedCodeLines = activeFile
    ? patchApplied && activeFile.patchedLines
      ? activeFile.patchedLines
      : activeFile.lines
    : [];

  const activePeerKey = activePeer?.handle || selectedPeerHandle || '';
  const currentMessages = activePeerKey ? messagesByPeer[activePeerKey] || [] : [];

  const authenticatedDisplayName =
    currentUser?.displayName || emailSession?.displayName || currentUser?.email || emailSession?.email || '';
  const currentSenderHandle =
    authenticatedDisplayName.toLowerCase().replace(/[^a-z0-9-]/g, '-') || 'developer';

  const applyReactionToMessageInState = (
    targetPeerHandle: string,
    messageId: string,
    emoji: string,
    userHandle: string
  ) => {
    if (!targetPeerHandle) return;
    setMessagesByPeer((prev) => {
      const peerMsgs = prev[targetPeerHandle] || [];
      const updated = peerMsgs.map((msg) => {
        if (msg.id !== messageId) return msg;
        const existingReactions: ChatReaction[] = msg.reactions ? [...msg.reactions] : [];
        const existingIdx = existingReactions.findIndex((r) => r.emoji === emoji);

        let nextReactions: ChatReaction[];
        if (existingIdx >= 0) {
          const target = existingReactions[existingIdx];
          const hasUser = target.users.includes(userHandle);
          const nextUsers = hasUser
            ? target.users.filter((u) => u !== userHandle)
            : [...target.users, userHandle];

          if (nextUsers.length === 0) {
            nextReactions = existingReactions.filter((_, i) => i !== existingIdx);
          } else {
            nextReactions = existingReactions.map((r, i) =>
              i === existingIdx ? { ...r, count: nextUsers.length, users: nextUsers } : r
            );
          }
        } else {
          nextReactions = [...existingReactions, { emoji, count: 1, users: [userHandle] }];
        }

        return { ...msg, reactions: nextReactions };
      });
      return {
        ...prev,
        [targetPeerHandle]: updated,
      };
    });
  };

  // Initialize Dual-Signaling WebRTC DataChannel & AES-GCM 256-bit E2EE Engine
  const p2pEngine = useP2PEngine({
    roomId: p2pRoomId,
    passphrase: p2pPassphrase,
    localHandle: currentSenderHandle,
    localDisplayName: authenticatedDisplayName || 'Developer',
    transportMode: p2pTransportMode,
    onIncomingChatMessage: (peerHandle, incomingMsg) => {
      const targetKey = activePeerKey || peerHandle;
      if (!targetKey) return;
      setMessagesByPeer((prev) => {
        const list = prev[targetKey] || [];
        if (list.some((m) => m.id === incomingMsg.id)) return prev;
        return {
          ...prev,
          [targetKey]: [...list, incomingMsg],
        };
      });
    },
    onIncomingReaction: (_peerHandle, messageId, emoji, reactingUserHandle) => {
      const targetKey = activePeerKey || _peerHandle;
      if (!targetKey) return;
      applyReactionToMessageInState(targetKey, messageId, emoji, reactingUserHandle);
    },
  });

  // Real-time GitHub Webhook Trigger -> Calls /api/v1/webhooks/github
  const handleTriggerGitHubWebhook = async (
    eventType: 'issues' | 'pull_request',
    targetTicketId?: string
  ) => {
    const ticketIdToUse =
      targetTicketId ||
      selectedIncidentTicketId ||
      incidentReports[0]?.ticketId ||
      `INC-${Math.floor(1000 + Math.random() * 9000)}`;
    const targetRepoName = activeRepo?.repo || bugRepo || 'owner/repository';
    const targetBranchName = activeRepo?.branch || bugBranch || 'main';
    const targetFileName = activeFile?.path || bugFile || 'src/index.ts';
    const targetLineNum = highlightedLine || 1;

    try {
      const res = await fetch('/api/v1/webhooks/github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': eventType,
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(
          eventType === 'pull_request'
            ? {
                event: 'pull_request',
                action: 'merged',
                ticketId: ticketIdToUse,
                repository: { full_name: targetRepoName },
                pull_request: {
                  number: 1,
                  merged: true,
                  title: `fix: resolve ${ticketIdToUse}`,
                },
              }
            : {
                event: 'issues',
                action: 'opened',
                repository: { full_name: targetRepoName },
                sender: { login: activePeer?.handle || currentSenderHandle },
                filePath: targetFileName,
                lineNumber: targetLineNum,
                issue: {
                  title: `Webhook Issue in ${targetFileName.split('/').pop()}`,
                  body: `Exception at ${targetFileName}:${targetLineNum}`,
                },
              }
        ),
      });
      const data = await res.json();

      if (eventType === 'pull_request') {
        setIncidentReports((prev) =>
          prev.map((rep) =>
            rep.ticketId === ticketIdToUse
              ? {
                  ...rep,
                  status: 'PR Merged & Deployed',
                  mergedAtIso: new Date().toISOString(),
                  systemLogsReport: [
                    ...rep.systemLogsReport,
                    {
                      time: new Date().toLocaleTimeString(),
                      level: 'SUCCESS',
                      event: 'GITHUB_WEBHOOK_PR_MERGED',
                      details: `GitHub Webhook auto-resolved ${ticketIdToUse}`,
                    },
                  ],
                }
              : rep
          )
        );
        setTerminalLogs((prev) => [
          ...prev,
          `[GitHub Webhook] pull_request.merged -> ${ticketIdToUse} resolved.`,
        ]);
      } else if (data.ticketId) {
        const newWhReport: IncidentWorkflowReport = {
          ticketId: data.ticketId,
          repo: targetRepoName,
          branch: targetBranchName,
          filePath: targetFileName,
          lineNumber: targetLineNum,
          summary: data.incident?.summary || 'Webhook: Unhandled exception',
          stackTrace: data.incident?.stackTrace || `Exception at ${targetFileName}:${targetLineNum}`,
          status: 'Investigating',
          timestamp: new Date().toLocaleTimeString(),
          reportedAtIso: new Date().toISOString(),
          architectureBreakdown: {
            serviceLayer: `${targetRepoName} / Webhook Listener`,
            runtime: 'Node.js / Shared Container',
            blastRadius: targetFileName,
            rootCause: `Issue opened at ${targetFileName}:L${targetLineNum}`,
          },
          implementedFix: {
            file: targetFileName,
            author: `${activePeer?.name || currentSenderHandle} & Nerve Shark`,
            diff: `@@ -${targetLineNum},2 +${targetLineNum},4 @@\n+ if (!context) return;\n`,
          },
          systemLogsReport: [
            {
              time: new Date().toLocaleTimeString(),
              level: 'ERROR',
              event: 'GITHUB_WEBHOOK_ISSUE_OPENED',
              details: `Created ${data.ticketId} from GitHub Webhook`,
            },
          ],
        };
        setIncidentReports((prev) => [newWhReport, ...prev]);
        setSelectedIncidentTicketId(data.ticketId);
        if (repositories[targetRepoName]) {
          setRepositories((prev) => ({
            ...prev,
            [targetRepoName]: {
              ...prev[targetRepoName],
              ciStatus: 'Failing',
            },
          }));
        }
        emitCiFailureNotification(
          targetRepoName,
          targetBranchName,
          activeRepo?.latestCommit || 'HEAD',
          `GitHub Webhook (issues.opened) triggered Failing status on ${targetRepoName}.`
        );
        setActiveTab('incidents');
      }
    } catch (err) {
      console.error('Webhook trigger failed:', err);
    }
  };

  // Synchronize Dark Mode on Document Element
  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const extractDeepLinks = (text: string) => {
    const regex =
      /([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)(?:#([a-zA-Z0-9_.-]+))?(?:\/([a-zA-Z0-9_./-]+))?(?::L(\d+))?/g;
    const links: Array<{
      raw: string;
      repo: string;
      branch: string;
      filePath: string;
      lineNumber: number;
    }> = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const repo = match[1];
      const branch = match[2] || repositories[repo]?.branch || 'main';
      const defaultFile = repositories[repo] ? Object.keys(repositories[repo].files)[0] : 'src/index.ts';
      const filePath = match[3] || defaultFile;
      const lineNumber = match[4] ? parseInt(match[4], 10) : 1;
      links.push({
        raw: match[0],
        repo,
        branch,
        filePath,
        lineNumber,
      });
    }
    return links;
  };

  const handleNavigateDeepLink = async (
    repo: string,
    filePath: string,
    lineNumber: number,
    openTerminal = false
  ) => {
    if (repositories[repo]) {
      setActiveRepoKey(repo);
      const validFile = repositories[repo].files[filePath]
        ? filePath
        : Object.keys(repositories[repo].files)[0];
      setActiveFilePath(validFile);
      setHighlightedLine(lineNumber);
      setIsCodeDrawerOpen(true);
      if (openTerminal) setShowTerminal(true);
      return;
    }

    // Automatically track & mount any repository called out in P2P messaging so peers can deploy all workspace functions together
    await handleTrackExternalRepository({
      fullName: repo,
      description: `Collaborative P2P workspace repository (${repo})`,
      defaultBranch: 'main',
      stars: 100,
      language: detectCodeLanguage(filePath).label,
      openIssues: 1,
    });
    setActiveRepoKey(repo);
    setHighlightedLine(lineNumber || 1);
    setIsCodeDrawerOpen(true);
    if (openTerminal) setShowTerminal(true);
  };

  const handleToggleFollowPeer = async (peerHandle: string) => {
    const targetPeer = peers.find((p) => p.handle === peerHandle);
    const nextFollow = targetPeer ? !targetPeer.youFollowThem : true;

    setPeers((prev) =>
      prev.map((p) => (p.handle === peerHandle ? { ...p, youFollowThem: nextFollow } : p))
    );

    if (targetPeer && currentUser) {
      await updateGitHubPeerFollowInFirestore(currentUser, targetPeer, nextFollow);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent, overrideText?: string) => {
    if (e) e.preventDefault();
    const rawSource = overrideText !== undefined ? overrideText : composerText;
    const trimmed = rawSource.trim();
    if (!trimmed) return;

    // Support 'clr terminal' syntax to reset terminal logs directly
    if (trimmed.toLowerCase() === 'clr terminal') {
      appendLogsToActiveOrTargetSession([]);
      if (overrideText === undefined) setComposerText('');
      return;
    }

    if (!canOpenP2PChannel || !activePeer) return;

    if (overrideText === undefined) {
      setComposerText('');
    }
    const parsedLinks = extractDeepLinks(trimmed);
    const fallbackRepo = activeRepo?.repo || bugRepo || 'owner/repository';
    const fallbackBranch = activeRepo?.branch || bugBranch || 'main';
    const fallbackFile = activeFile?.path || bugFile || 'src/index.ts';
    const fallbackLine = highlightedLine || 1;

    if (trimmed.startsWith('/bug')) {
      const targetLink = parsedLinks[0] || {
        raw: `${fallbackRepo}#${fallbackBranch}/${fallbackFile}:L${fallbackLine}`,
        repo: fallbackRepo,
        branch: fallbackBranch,
        filePath: fallbackFile,
        lineNumber: fallbackLine,
      };
      const summaryText =
        trimmed
          .replace(/^\/bug\s+/, '')
          .replace(targetLink.raw, '')
          .trim() || 'Unhandled exception';

      const newTicketId = `INC-${Math.floor(1000 + Math.random() * 9000)}`;

      const newTicket: IncidentTicket = {
        ticketId: newTicketId,
        reporterHandle: currentSenderHandle,
        targetRepo: targetLink.repo,
        branch: targetLink.branch,
        filePath: targetLink.filePath,
        lineNumber: targetLink.lineNumber,
        summary: summaryText,
        stackTrace: `Error at ${targetLink.filePath}:${targetLink.lineNumber}`,
        clientPlatform: 'Nerve',
        status: 'Open — Triage Live',
        createdAt: new Date().toLocaleTimeString(),
      };

      const userMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        senderHandle: currentSenderHandle,
        senderName: authenticatedDisplayName || 'You',
        senderRole: 'self',
        timestamp: isOffline ? 'Queued' : new Date().toLocaleTimeString(),
        text: summaryText,
        parsedLinks: [targetLink],
        incidentTicket: newTicket,
      };

      const newReport: IncidentWorkflowReport = {
        ticketId: newTicketId,
        repo: targetLink.repo,
        branch: targetLink.branch,
        filePath: targetLink.filePath,
        lineNumber: targetLink.lineNumber,
        summary: summaryText,
        stackTrace: `Error at ${targetLink.filePath}:${targetLink.lineNumber}`,
        status: 'Investigating',
        timestamp: new Date().toLocaleTimeString(),
        reportedAtIso: new Date().toISOString(),
        architectureBreakdown: {
          serviceLayer: `${targetLink.repo} / Core`,
          runtime: 'Node.js / Codespace Container',
          blastRadius: targetLink.filePath,
          rootCause: `Exception at line ${targetLink.lineNumber}`,
        },
        implementedFix: {
          file: targetLink.filePath,
          author: `${activePeer.name} & Nerve Shark`,
          diff: `@@ -${targetLink.lineNumber},2 +${targetLink.lineNumber},4 @@\n+ if (!context) return;\n`,
        },
        systemLogsReport: [
          {
            time: new Date().toLocaleTimeString(),
            level: 'ERROR',
            event: 'INCIDENT_DISPATCHED',
            details: `Reported via /bug on ${targetLink.repo}#${targetLink.branch}`,
          },
        ],
      };

      if (isOffline) {
        const nextQueue = enqueueOfflineAction({
          id: `q-${Date.now()}`,
          type: 'bug_dispatch',
          createdAt: new Date().toISOString(),
          bugPayload: {
            reporterHandle: currentSenderHandle,
            targetRepo: targetLink.repo,
            branch: targetLink.branch,
            filePath: targetLink.filePath,
            lineNumber: targetLink.lineNumber,
            summary: summaryText,
            stackTrace: newReport.stackTrace,
            reportObject: newReport,
            chatMessage: userMsg,
            peerHandle: activePeer.handle,
          },
        });
        setOfflineQueue(nextQueue);
        return;
      }

      setMessagesByPeer((prev) => ({
        ...prev,
        [activePeer.handle]: [...(prev[activePeer.handle] || []), userMsg],
      }));
      p2pEngine.sendEncryptedChatMessage(userMsg);
      setIncidentReports((prev) => [newReport, ...prev]);
      setSelectedIncidentTicketId(newTicketId);
      handleNavigateDeepLink(targetLink.repo, targetLink.filePath, targetLink.lineNumber, true);
      return;
    }

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      senderHandle: currentSenderHandle,
      senderName: authenticatedDisplayName || 'You',
      senderRole: 'self',
      timestamp: isOffline ? 'Queued' : new Date().toLocaleTimeString(),
      text: trimmed,
      parsedLinks: parsedLinks.length > 0 ? parsedLinks : undefined,
    };

    if (isOffline) {
      const nextQueue = enqueueOfflineAction({
        id: `q-${Date.now()}`,
        type: 'message',
        createdAt: new Date().toISOString(),
        peerHandle: activePeer.handle,
        messagePayload: userMsg,
      });
      setOfflineQueue(nextQueue);
      return;
    }

    setMessagesByPeer((prev) => ({
      ...prev,
      [activePeer.handle]: [...(prev[activePeer.handle] || []), userMsg],
    }));
    p2pEngine.sendEncryptedChatMessage(userMsg);

    if (parsedLinks.length > 0) {
      const first = parsedLinks[0];
      handleNavigateDeepLink(first.repo, first.filePath, first.lineNumber);
    }

    if (trimmed.toLowerCase().includes('@shark') || trimmed.toLowerCase().includes('@copilot')) {
      await handleInvokeNerveShark(trimmed);
    }
  };

  const handleInvokeNerveShark = async (customPrompt?: string) => {
    if (!activePeer) return;
    setIsSharkThinking(true);
    const targetRepoName = activeRepo?.repo || bugRepo || 'owner/repository';
    const targetBranchName = activeRepo?.branch || bugBranch || 'main';
    const targetFileName = activeFile?.path || bugFile || 'src/index.ts';

    try {
      const res = await fetch('/api/v1/copilot/collaborate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          prompt:
            customPrompt ||
            `Fix the issue in ${targetFileName} at line ${highlightedLine || 1}.`,
          repo: targetRepoName,
          branch: targetBranchName,
          filePath: targetFileName,
          codeSnippet: displayedCodeLines.join('\n'),
          participants: [currentSenderHandle, activePeer.handle],
        }),
      });
      const data = await res.json();

      const sharkMsg: ChatMessage = {
        id: `msg-shark-${Date.now()}`,
        senderHandle: 'shark',
        senderName: 'Nerve Shark',
        senderRole: 'copilot',
        timestamp: new Date().toLocaleTimeString(),
        text: data.summary,
        copilotPatch: {
          summary: data.summary,
          suggestedPatch: data.suggestedPatch,
          recommendedTerminalCommand: data.recommendedTerminalCommand || 'npm test',
          prTitle: data.prTitle || `fix: patch ${targetFileName}`,
          applied: false,
        },
      };

      setMessagesByPeer((prev) => ({
        ...prev,
        [activePeer.handle]: [...(prev[activePeer.handle] || []), sharkMsg],
      }));
      p2pEngine.sendEncryptedChatMessage(sharkMsg);
    } finally {
      setIsSharkThinking(false);
    }
  };

  const handleApplyPatchToCodespace = (msgId?: string) => {
    setPatchApplied(true);
    setIsCodeDrawerOpen(true);
    setShowTerminal(true);
    appendLogsToActiveOrTargetSession((prev) => [
      ...prev,
      `[Nerve Shark Patch Applied] Updated ${activeFile?.path || 'file'}. Run tests to verify.`,
    ]);
    if (msgId && activePeer) {
      setMessagesByPeer((prev) => ({
        ...prev,
        [activePeer.handle]: (prev[activePeer.handle] || []).map((m) =>
          m.id === msgId && m.copilotPatch
            ? { ...m, copilotPatch: { ...m.copilotPatch, applied: true } }
            : m
        ),
      }));
    }
  };

  const QUICK_REACTION_EMOJIS = ['👍', '❤️', '🚀', '👀', '🔥', '💡', '🎉', '💯', '👏', '⚡', '🐛', '✨'];

  const handleToggleMessageReaction = (messageId: string, emoji: string) => {
    const targetPeerKey = activePeerKey;
    if (!targetPeerKey) return;
    const userHandle = currentSenderHandle || 'developer';

    applyReactionToMessageInState(targetPeerKey, messageId, emoji, userHandle);
    p2pEngine.sendEncryptedReaction(messageId, emoji);
  };

  const handleRunCodespaceCommand = async (
    cmd: string,
    explicitInstanceId?: string,
    explicitSubTabKey?: TerminalSubTabKey
  ) => {
    const cleanCmd = cmd.trim();
    if (!cleanCmd) return;
    const targetInst =
      terminalInstances.find((t) => t.id === explicitInstanceId) ||
      activeTerminalInstance;
    const targetInstId = targetInst.id;
    const targetSubKey = explicitSubTabKey || targetInst.activeSubTab;

    // Automatically focus the terminal instance (primary or secondary) where the command is executed
    setActiveTerminalInstanceId(targetInstId);

    // Keep log auto-scroll locked to bottom when executing a command
    isTerminalAtBottomRef.current = true;

    // Activate Codespace process telemetry window so CPU & Memory usage updates every few seconds
    setCodespaceProcessActive(true);
    if (codespaceProcessTimerRef.current) {
      clearTimeout(codespaceProcessTimerRef.current);
    }
    codespaceProcessTimerRef.current = setTimeout(() => {
      setCodespaceProcessActive(true);
    }, 12000);

    // Record command in terminal history for Up/Down arrow navigation & live suggestion engine
    setTerminalCommandHistory((prev) => {
      const next = prev[prev.length - 1] === cleanCmd ? prev : [...prev, cleanCmd];
      return next.slice(-50);
    });
    setTerminalHistoryIndex(-1);
    terminalDraftRef.current = '';

    // Support 'clr terminal' syntax to completely clear both Build and Logs on the active terminal
    if (cleanCmd.toLowerCase() === 'clr terminal') {
      handleClearActiveTerminal(targetInstId);
      return;
    }

    const targetRepoName = activeRepo?.repo || bugRepo || 'workspace';
    const cleanRepoShort = targetRepoName.split('/')[1] || targetRepoName;
    const commandHeaderLine = `\x1b[36mcodespace@${cleanRepoShort}[${targetSubKey}]:$ ${cleanCmd}\x1b[0m`;

    // Pipe command execution to P2P Encrypted Terminal Log Streamer
    p2pEngine.sendEncryptedTerminalLog(
      `codespace@${cleanRepoShort}[${targetSubKey}]:$ ${cleanCmd}`,
      'stdout'
    );

    // Built-in Interactive Command Shell Dispatcher
    const cmdTokens = cleanCmd.split(/\s+/);
    const primaryCmd = cmdTokens[0].toLowerCase();
    const cmdArg = cleanCmd.slice(cmdTokens[0].length).trim();

    if (primaryCmd === 'clear' || primaryCmd === 'cls') {
      setTerminalInstances((prev) =>
        prev.map((inst) =>
          inst.id === targetInstId
            ? {
                ...inst,
                subTabs: {
                  ...inst.subTabs,
                  [targetSubKey]: {
                    ...inst.subTabs[targetSubKey],
                    logs: [],
                    isRunning: false,
                    input: '',
                  },
                },
              }
            : inst
        )
      );
      return;
    }

    if (primaryCmd === 'help') {
      const helpOutput = [
        '\x1b[1;36m=== Nerve Codespace Terminal Interactive Shell ===\x1b[0m',
        '\x1b[33mNavigation & Shortcuts:\x1b[0m',
        '  \x1b[32mAlt+T / Cmd+T\x1b[0m         Create new terminal session tab',
        '  \x1b[32mAlt+W / Cmd+W\x1b[0m         Close active terminal session tab',
        '  \x1b[32mAlt+1 .. Alt+9\x1b[0m        Switch directly to session tab 1–9',
        '  \x1b[32mAlt+Left / Right\x1b[0m      Cycle through open session tabs',
        '\x1b[33mBuilt-in Commands:\x1b[0m',
        '  \x1b[32mhelp\x1b[0m                  Show this help manual',
        '  \x1b[32mclear, cls\x1b[0m            Clear current sub-tab logs',
        '  \x1b[32mls, dir\x1b[0m               List files and folders in workspace',
        '  \x1b[32mpwd\x1b[0m                   Print current working directory',
        '  \x1b[32mcd <dir>\x1b[0m              Change working directory for this session',
        '  \x1b[32mcat <file>\x1b[0m            Print file contents (e.g. package.json, README.md)',
        '  \x1b[32mecho <text>\x1b[0m           Print text to terminal output',
        '  \x1b[32mstatus\x1b[0m                Show session info, git branch, and CI state',
        '  \x1b[32mtop, ps\x1b[0m               List active background tasks and processes',
        '  \x1b[32mrun <task>\x1b[0m            Spawn a simulated background task/service',
        '  \x1b[32mping <host>\x1b[0m           Simulate network latency test',
        '  \x1b[32mtheme [name]\x1b[0m          Switch ANSI theme (cyber-dark, dracula, monokai, nord...)',
        '  \x1b[32mhistory\x1b[0m               Display command history',
        '\x1b[33mRemote Codespace Commands:\x1b[0m',
        '  \x1b[32mnpm test\x1b[0m              Execute automated test runner',
        '  \x1b[32mnpm run build\x1b[0m         Execute production bundle compiler',
        '  \x1b[32mgit status\x1b[0m            Check git worktree status',
        '  \x1b[32mgh pr create\x1b[0m          Open automated PR with changes',
      ].join('\n');

      appendLogsToActiveOrTargetSession(
        (prev) => [...prev, commandHeaderLine, helpOutput],
        targetInstId,
        targetSubKey
      );
      return;
    }

    if (primaryCmd === 'pwd') {
      const cwd = targetInst.cwd || '~/acme-cloud/edge-router';
      appendLogsToActiveOrTargetSession(
        (prev) => [...prev, commandHeaderLine, cwd],
        targetInstId,
        targetSubKey
      );
      return;
    }

    if (primaryCmd === 'cd') {
      let nextCwd = targetInst.cwd || '~/acme-cloud/edge-router';
      if (!cmdArg || cmdArg === '~' || cmdArg === '/') {
        nextCwd = '~/acme-cloud/edge-router';
      } else if (cmdArg.startsWith('..')) {
        nextCwd = '~/acme-cloud';
      } else {
        nextCwd = `${nextCwd.replace(/\/$/, '')}/${cmdArg.replace(/^\//, '')}`;
      }
      setTerminalInstances((prev) =>
        prev.map((inst) =>
          inst.id === targetInstId ? { ...inst, cwd: nextCwd } : inst
        )
      );
      appendLogsToActiveOrTargetSession(
        (prev) => [
          ...prev,
          commandHeaderLine,
          `\x1b[32mChanged directory to:\x1b[0m ${nextCwd}`,
        ],
        targetInstId,
        targetSubKey
      );
      return;
    }

    if (primaryCmd === 'ls' || primaryCmd === 'dir') {
      const lsOutput = [
        '\x1b[1;34msrc/\x1b[0m           \x1b[1;34mpublic/\x1b[0m        \x1b[32mpackage.json\x1b[0m',
        '\x1b[32mvite.config.ts\x1b[0m \x1b[32mtsconfig.json\x1b[0m README.md',
        'server.ts      metadata.json  firestore.rules',
      ].join('\n');
      appendLogsToActiveOrTargetSession(
        (prev) => [...prev, commandHeaderLine, lsOutput],
        targetInstId,
        targetSubKey
      );
      return;
    }

    if (primaryCmd === 'cat') {
      let fileOutput = '';
      if (!cmdArg) {
        fileOutput = '\x1b[31mcat: missing file operand\x1b[0m';
      } else if (cmdArg === 'package.json') {
        fileOutput = JSON.stringify(
          {
            name: 'nerve-incident-command',
            version: '1.4.0',
            dependencies: { react: '^19.0.0', 'lucide-react': '^1.0.0', tailwindcss: '^4.0.0' },
          },
          null,
          2
        );
      } else if (cmdArg.toLowerCase() === 'readme.md') {
        fileOutput = '# Nerve Codespace Incident Hub\nProduction resilient multi-terminal shell & monitoring.';
      } else {
        fileOutput = `\x1b[31mcat: ${cmdArg}: No such file or directory\x1b[0m`;
      }
      appendLogsToActiveOrTargetSession(
        (prev) => [...prev, commandHeaderLine, fileOutput],
        targetInstId,
        targetSubKey
      );
      return;
    }

    if (primaryCmd === 'echo') {
      appendLogsToActiveOrTargetSession(
        (prev) => [...prev, commandHeaderLine, cmdArg],
        targetInstId,
        targetSubKey
      );
      return;
    }

    if (primaryCmd === 'status') {
      const activeTasksCount = targetInst.tasks?.length || 0;
      const statusOutput = [
        '\x1b[1;36m=== Codespace Session Diagnostic Status ===\x1b[0m',
        `  Session:         \x1b[1;32m${targetInst.name}\x1b[0m [${targetSubKey}]`,
        `  Status:          ${targetInst.status || 'idle'}`,
        `  Working Dir:     ${targetInst.cwd || '~/acme-cloud/edge-router'}`,
        `  Git Worktree:    ${activeRepo?.branch || 'main'} (clean)`,
        `  CI Pipeline:     ${activeRepo?.ciStatus || 'Passing'}`,
        `  Resource:        CPU ${codespaceResourceMetrics.cpuPercent}% · MEM ${codespaceResourceMetrics.memoryMb}MB`,
        `  Network:         ▲ ${networkMetrics.upKb} KB/s · ▼ ${networkMetrics.downKb} KB/s`,
        `  Background Tasks: ${activeTasksCount} active`,
      ].join('\n');
      appendLogsToActiveOrTargetSession(
        (prev) => [...prev, commandHeaderLine, statusOutput],
        targetInstId,
        targetSubKey
      );
      return;
    }

    if (primaryCmd === 'top' || primaryCmd === 'ps') {
      const currentTasks =
        targetInst.tasks && targetInst.tasks.length > 0
          ? targetInst.tasks
          : [
              {
                id: 'task-1',
                name: 'daemon',
                pid: 4120,
                status: 'running' as const,
                startTime: 'just now',
              },
            ];
      const lines = [
        '\x1b[1;36mPID    NAME         STATUS      TIME       CPU%  MEM\x1b[0m',
        ...currentTasks.map(
          (t) =>
            `${t.pid.toString().padEnd(6)} ${t.name.padEnd(12)} ${t.status.padEnd(11)} ${t.startTime.padEnd(10)} 1.4%  48MB`
        ),
      ];
      appendLogsToActiveOrTargetSession(
        (prev) => [...prev, commandHeaderLine, lines.join('\n')],
        targetInstId,
        targetSubKey
      );
      return;
    }

    if (primaryCmd === 'run') {
      if (!cmdArg) {
        appendLogsToActiveOrTargetSession(
          (prev) => [
            ...prev,
            commandHeaderLine,
            '\x1b[31mUsage: run <task_name>\x1b[0m (e.g. run health-check or run worker)',
          ],
          targetInstId,
          targetSubKey
        );
        return;
      }
      const newPid = Math.floor(2000 + Math.random() * 7000);
      const newTask: TerminalTask = {
        id: `task-${Date.now()}`,
        name: cmdArg,
        pid: newPid,
        status: 'running',
        startTime: 'just now',
      };
      setTerminalInstances((prev) =>
        prev.map((inst) =>
          inst.id === targetInstId
            ? {
                ...inst,
                tasks: [...(inst.tasks || []), newTask],
                status: 'running',
              }
            : inst
        )
      );
      appendLogsToActiveOrTargetSession(
        (prev) => [
          ...prev,
          commandHeaderLine,
          `\x1b[32m[process]\x1b[0m Spawned task '\x1b[1;37m${cmdArg}\x1b[0m' (PID: ${newPid}) in background.`,
        ],
        targetInstId,
        targetSubKey
      );
      return;
    }

    if (primaryCmd === 'ping') {
      const pingHost = cmdArg || 'github.com';
      const pingOutput = [
        `PING ${pingHost} (140.82.121.4): 56 data bytes`,
        `64 bytes from 140.82.121.4: icmp_seq=0 ttl=116 time=18.4 ms`,
        `64 bytes from 140.82.121.4: icmp_seq=1 ttl=116 time=16.9 ms`,
        `64 bytes from 140.82.121.4: icmp_seq=2 ttl=116 time=17.2 ms`,
        `--- ${pingHost} ping statistics ---`,
        `3 packets transmitted, 3 packets received, 0.0% packet loss`,
        `round-trip min/avg/max = 16.9/17.5/18.4 ms`,
      ].join('\n');
      appendLogsToActiveOrTargetSession(
        (prev) => [...prev, commandHeaderLine, pingOutput],
        targetInstId,
        targetSubKey
      );
      return;
    }

    if (primaryCmd === 'theme') {
      const availableThemes: AnsiColorSchemeId[] = [
        'cyber-dark',
        'dracula',
        'monokai',
        'nord',
        'vscode-dark',
        'solarized',
      ];
      if (!cmdArg) {
        appendLogsToActiveOrTargetSession(
          (prev) => [
            ...prev,
            commandHeaderLine,
            `Current theme: \x1b[1;36m${ansiColorScheme}\x1b[0m\nAvailable: ${availableThemes.join(', ')}\nUsage: theme <name>`,
          ],
          targetInstId,
          targetSubKey
        );
        return;
      }
      const requestedTheme = cmdArg.toLowerCase() as AnsiColorSchemeId;
      if (availableThemes.includes(requestedTheme)) {
        setAnsiColorScheme(requestedTheme);
        appendLogsToActiveOrTargetSession(
          (prev) => [
            ...prev,
            commandHeaderLine,
            `\x1b[32mANSI color scheme set to:\x1b[0m ${requestedTheme}`,
          ],
          targetInstId,
          targetSubKey
        );
      } else {
        appendLogsToActiveOrTargetSession(
          (prev) => [
            ...prev,
            commandHeaderLine,
            `\x1b[31mUnknown theme '${cmdArg}'.\x1b[0m Available: ${availableThemes.join(', ')}`,
          ],
          targetInstId,
          targetSubKey
        );
      }
      return;
    }

    if (primaryCmd === 'history') {
      const histLines = terminalCommandHistory.map(
        (c, idx) => `  \x1b[36m${(idx + 1).toString().padStart(3)}\x1b[0m  ${c}`
      );
      appendLogsToActiveOrTargetSession(
        (prev) => [
          ...prev,
          commandHeaderLine,
          histLines.length > 0
            ? histLines.join('\n')
            : 'No command history recorded yet.',
        ],
        targetInstId,
        targetSubKey
      );
      return;
    }

    const isBuildRelatedCmd = /\b(build|test)\b/i.test(cleanCmd);

    setShowTerminal(true);
    setTerminalInstances((prev) =>
      prev.map((inst) =>
        inst.id === targetInstId
          ? {
              ...inst,
              subTabs: {
                ...inst.subTabs,
                [targetSubKey]: {
                  ...inst.subTabs[targetSubKey],
                  isRunning: true,
                  input: '',
                },
                ...(isBuildRelatedCmd && targetSubKey !== 'build'
                  ? {
                      build: {
                        ...inst.subTabs.build,
                        isRunning: true,
                      },
                    }
                  : {}),
              },
            }
          : inst
      )
    );
    const targetBranchName = activeRepo?.branch || bugBranch || 'main';

    try {
      const res = await fetch('/api/v1/codespaces/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          command: cmd,
          repo: targetRepoName,
          branch: patchApplied ? 'fix/shark-patch' : targetBranchName,
          patchApplied,
        }),
      });
      const data = await res.json();
      if (
        data?.telemetry &&
        typeof data.telemetry.cpuPercent === 'number' &&
        typeof data.telemetry.memoryMb === 'number'
      ) {
        setCodespaceResourceMetrics({
          cpuPercent: data.telemetry.cpuPercent,
          memoryMb: data.telemetry.memoryMb,
        });
      }
      const commandHeaderLine = `\x1b[36mcodespace@${targetRepoName.split('/')[1] || targetRepoName}[${targetSubKey}]:$ ${cmd}\x1b[0m`;

      appendLogsToActiveOrTargetSession(
        (prev) => [...prev, commandHeaderLine, data.output],
        targetInstId,
        targetSubKey
      );

      // If a build/test command was executed while viewing 'logs', also update 'build' so the Build Summary View reflects the latest output
      if (isBuildRelatedCmd && targetSubKey !== 'build') {
        appendLogsToActiveOrTargetSession(
          (prev) => [...prev, commandHeaderLine, data.output],
          targetInstId,
          'build'
        );
      }

      if ((cmd.includes('npm test') && patchApplied) || cmd.startsWith('gh pr create')) {
        if (repositories[targetRepoName]) {
          setRepositories((prev) => ({
            ...prev,
            [targetRepoName]: {
              ...prev[targetRepoName],
              ciStatus: 'Passing',
            },
          }));
        }

        setIncidentReports((prev) =>
          prev.map((rep) =>
            rep.repo === targetRepoName
              ? {
                  ...rep,
                  status: cmd.startsWith('gh pr create') ? 'PR Merged & Deployed' : 'Testing Fix',
                  mergedAtIso: cmd.startsWith('gh pr create')
                    ? new Date().toISOString()
                    : rep.mergedAtIso,
                  systemLogsReport: [
                    ...rep.systemLogsReport,
                    {
                      time: new Date().toLocaleTimeString(),
                      level: 'SUCCESS',
                      event: cmd.startsWith('gh pr create') ? 'PR_MERGED' : 'TESTS_PASSED',
                      details: `Executed '${cmd}' in container`,
                    },
                  ],
                }
              : rep
          )
        );
      }
    } finally {
      setTerminalInstances((prev) =>
        prev.map((inst) =>
          inst.id === targetInstId
            ? {
                ...inst,
                subTabs: {
                  ...inst.subTabs,
                  [targetSubKey]: {
                    ...inst.subTabs[targetSubKey],
                    isRunning: false,
                  },
                  ...(isBuildRelatedCmd && targetSubKey !== 'build'
                    ? {
                        build: {
                          ...inst.subTabs.build,
                          isRunning: false,
                        },
                      }
                    : {}),
                },
              }
            : inst
        )
      );
    }
  };

  const handleTerminalInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab' && commandSuggestions.length > 0) {
      e.preventDefault();
      setTerminalInput(commandSuggestions[0]);
      setTerminalHistoryIndex(-1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (terminalCommandHistory.length === 0) return;
      if (terminalHistoryIndex === -1) {
        terminalDraftRef.current = terminalInput;
        const nextIdx = terminalCommandHistory.length - 1;
        setTerminalHistoryIndex(nextIdx);
        setTerminalInput(terminalCommandHistory[nextIdx]);
      } else if (terminalHistoryIndex > 0) {
        const nextIdx = terminalHistoryIndex - 1;
        setTerminalHistoryIndex(nextIdx);
        setTerminalInput(terminalCommandHistory[nextIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (terminalHistoryIndex === -1) return;
      if (terminalHistoryIndex < terminalCommandHistory.length - 1) {
        const nextIdx = terminalHistoryIndex + 1;
        setTerminalHistoryIndex(nextIdx);
        setTerminalInput(terminalCommandHistory[nextIdx]);
      } else {
        setTerminalHistoryIndex(-1);
        setTerminalInput(terminalDraftRef.current);
      }
    }
  };

  const handleShareFileToChat = () => {
    if (!activeRepo || !activeFile || !activePeer || !canOpenP2PChannel) return;

    const totalLines = displayedCodeLines.length;
    const focusLine = Math.min(Math.max(1, highlightedLine || 1), Math.max(1, totalLines));
    const startIdx = Math.max(0, focusLine - 5);
    const endIdx = Math.min(totalLines, startIdx + 10);
    const snippetLines = displayedCodeLines.slice(startIdx, endIdx);
    const startLineNumber = startIdx + 1;
    const detectedLang = detectCodeLanguage(activeFile.path, activeFile.language);
    const rawPointer = `${activeRepo.repo}#${activeRepo.branch}/${activeFile.path}:L${focusLine}`;

    const shareMsg: ChatMessage = {
      id: `msg-share-${Date.now()}`,
      senderHandle: currentSenderHandle,
      senderName: authenticatedDisplayName || 'You',
      senderRole: 'self',
      timestamp: isOffline ? 'Queued' : new Date().toLocaleTimeString(),
      text: `Shared file snippet from ${rawPointer}`,
      parsedLinks: [
        {
          raw: rawPointer,
          repo: activeRepo.repo,
          branch: activeRepo.branch,
          filePath: activeFile.path,
          lineNumber: focusLine,
        },
      ],
      sharedCodeSnippet: {
        repo: activeRepo.repo,
        branch: activeRepo.branch,
        filePath: activeFile.path,
        language: detectedLang.label,
        startLine: startLineNumber,
        highlightedLine: focusLine,
        lines: snippetLines,
      },
    };

    if (isOffline) {
      const nextQueue = enqueueOfflineAction({
        id: `q-${Date.now()}`,
        type: 'message',
        createdAt: new Date().toISOString(),
        peerHandle: activePeer.handle,
        messagePayload: shareMsg,
      });
      setOfflineQueue(nextQueue);
    } else {
      setMessagesByPeer((prev) => ({
        ...prev,
        [activePeer.handle]: [...(prev[activePeer.handle] || []), shareMsg],
      }));
    }

    setSharedFileFeedback(true);
    setTimeout(() => setSharedFileFeedback(false), 1800);
  };

  const handleDispatchBugModal = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetRepo = bugRepo.trim() || activeRepo?.repo || 'owner/repository';
    const targetBranch = bugBranch.trim() || activeRepo?.branch || 'main';
    const targetFile = bugFile.trim() || activeFile?.path || 'src/index.ts';
    const targetSummary = bugSummary.trim() || 'Unhandled exception';
    const targetTrace = bugStackTrace.trim() || `Error at ${targetFile}:${bugLine}`;
    const newTicketId = `INC-${Math.floor(1000 + Math.random() * 9000)}`;

    const newTicket: IncidentTicket = {
      ticketId: newTicketId,
      reporterHandle: currentSenderHandle,
      targetRepo,
      branch: targetBranch,
      filePath: targetFile,
      lineNumber: bugLine,
      summary: targetSummary,
      stackTrace: targetTrace,
      clientPlatform: 'Nerve',
      status: 'Open — Triage Live',
      createdAt: new Date().toLocaleTimeString(),
    };

    const rawLink = `${targetRepo}#${targetBranch}/${targetFile}:L${bugLine}`;
    const newMsg: ChatMessage = {
      id: `msg-bug-${Date.now()}`,
      senderHandle: currentSenderHandle,
      senderName: authenticatedDisplayName || 'You',
      senderRole: 'self',
      timestamp: isOffline ? 'Queued' : new Date().toLocaleTimeString(),
      text: targetSummary,
      parsedLinks: [
        {
          raw: rawLink,
          repo: targetRepo,
          branch: targetBranch,
          filePath: targetFile,
          lineNumber: bugLine,
        },
      ],
      incidentTicket: newTicket,
    };

    const newReport: IncidentWorkflowReport = {
      ticketId: newTicketId,
      repo: targetRepo,
      branch: targetBranch,
      filePath: targetFile,
      lineNumber: bugLine,
      summary: targetSummary,
      stackTrace: targetTrace,
      status: 'Investigating',
      timestamp: new Date().toLocaleTimeString(),
      reportedAtIso: new Date().toISOString(),
      architectureBreakdown: {
        serviceLayer: `${targetRepo.split('/')[1] || targetRepo} Service`,
        runtime: 'Node.js / Cloud Codespace',
        blastRadius: targetFile,
        rootCause: `Exception in ${targetFile} at line ${bugLine}`,
      },
      implementedFix: {
        file: targetFile,
        author: `${activePeer?.name || currentSenderHandle} & Nerve Shark`,
        diff: `@@ -${bugLine},2 +${bugLine},4 @@\n+ if (!requestContext) return;\n`,
      },
      systemLogsReport: [
        {
          time: new Date().toLocaleTimeString(),
          level: 'ERROR',
          event: 'INCIDENT_FILED',
          details: `Dispatched by ${currentSenderHandle} on ${targetRepo}#${targetBranch}`,
        },
      ],
    };

    if (isOffline) {
      const nextQueue = enqueueOfflineAction({
        id: `q-${Date.now()}`,
        type: 'bug_dispatch',
        createdAt: new Date().toISOString(),
        bugPayload: {
          reporterHandle: currentSenderHandle,
          targetRepo,
          branch: targetBranch,
          filePath: targetFile,
          lineNumber: bugLine,
          summary: targetSummary,
          stackTrace: targetTrace,
          reportObject: newReport,
          chatMessage: newMsg,
          peerHandle: activePeer?.handle || '',
        },
      });
      setOfflineQueue(nextQueue);
      setShowBugModal(false);
      return;
    }

    if (activePeer) {
      setMessagesByPeer((prev) => ({
        ...prev,
        [activePeer.handle]: [...(prev[activePeer.handle] || []), newMsg],
      }));
    }
    setIncidentReports((prev) => [newReport, ...prev]);
    setSelectedIncidentTicketId(newTicketId);
    setShowBugModal(false);
    setActiveTab('incidents');
  };

  const handleResolveIncidentWithPR = async (ticketId: string) => {
    setPatchApplied(true);
    setIsCodeDrawerOpen(true);
    await handleRunCodespaceCommand('gh pr create --fill');

    if (activePeer) {
      setMessagesByPeer((prev) => ({
        ...prev,
        [activePeer.handle]: (prev[activePeer.handle] || []).map((m) =>
          m.incidentTicket && m.incidentTicket.ticketId === ticketId
            ? {
                ...m,
                incidentTicket: {
                  ...m.incidentTicket,
                  status: 'PR Merged — Resolved',
                },
              }
            : m
        ),
      }));
    }

    setIncidentReports((prev) =>
      prev.map((r) =>
        r.ticketId === ticketId
          ? {
              ...r,
              status: 'PR Merged & Deployed',
              mergedAtIso: new Date().toISOString(),
            }
          : r
      )
    );
  };

  const isAuthenticated = Boolean(currentUser || emailSession);

  return (
    <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white flex flex-col transition-colors">
      {/* =====================================================================
          RESPONSIVE TOP BAR + MOBILE SLIDING NAVBAR DRAWER TRIGGER
      ===================================================================== */}
      <header className="flex items-center justify-between gap-2 px-3 sm:px-6 h-13 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black sticky top-0 z-30">
        <a
          href="#workspace"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('workspace');
          }}
          className="text-base font-bold tracking-tight text-black dark:text-white whitespace-nowrap shrink-0 flex items-center gap-1.5"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
          <span>Nerve</span>
        </a>

        {/* Desktop Center Navigation */}
        <nav className="hidden md:flex items-center gap-6 text-xs sm:text-sm font-medium text-black/70 dark:text-white/70">
          {(['workspace', 'incidents', 'integration'] as const).map((tabKey) => (
            <button
              key={tabKey}
              type="button"
              onClick={() => setActiveTab(tabKey)}
              className={`capitalize hover:text-black dark:hover:text-white transition-colors py-1 cursor-pointer ${
                activeTab === tabKey
                  ? 'text-black dark:text-white font-semibold underline underline-offset-8 decoration-2 decoration-blue-600 dark:decoration-blue-400'
                  : ''
              }`}
            >
              {tabKey}
            </button>
          ))}
        </nav>

        {/* Desktop Right Controls */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          {/* Sign In / Authenticated User Profile */}
          {isAuthenticated ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black text-xs">
              {currentUser?.photoURL && (
                <img
                  src={currentUser.photoURL}
                  alt={authenticatedDisplayName}
                  className="w-4 h-4 rounded-full"
                  referrerPolicy="no-referrer"
                />
              )}
              <span className="font-medium text-black dark:text-white max-w-[110px] truncate">
                {authenticatedDisplayName}
              </span>
              <button
                onClick={handleSignOutAll}
                title="Sign Out"
                className="text-neutral-500 hover:text-red-500 cursor-pointer ml-1"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setAuthModalMode('signin');
                setAuthError('');
                setShowAuthModal(true);
              }}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-900 flex items-center gap-1.5 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Sign In</span>
            </button>
          )}

          {/* Passive Network Observer WiFi Icon (Icon only on navbar; Online/Offline text is in the menu aligned with Terminal OPEN/CLOSED) */}
          <div
            role="status"
            aria-live="polite"
            title={
              isOffline
                ? 'Offline'
                : 'Online'
            }
            className={`p-1.5 rounded-lg text-xs font-medium border flex items-center select-none pointer-events-none ${
              isOffline
                ? 'border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-300'
                : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white'
            }`}
          >
            {isOffline ? (
              <WifiOff className="w-3.5 h-3.5 text-amber-500" />
            ) : (
              <Wifi className="w-3.5 h-3.5 text-emerald-500" />
            )}
          </div>

          <button
            onClick={toggleTheme}
            aria-label="Toggle Theme"
            className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-black dark:text-white bg-white dark:bg-black hover:bg-neutral-100 dark:hover:bg-neutral-900 cursor-pointer"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            onClick={() => setShowBugModal(true)}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg whitespace-nowrap cursor-pointer"
          >
            Report /bug
          </button>
        </div>

        {/* Mobile Compact Actions: Passive WiFi status icon + /bug + Sliding Navbar Menu */}
        <div className="flex md:hidden items-center gap-1.5">
          <div
            role="status"
            aria-live="polite"
            className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black select-none pointer-events-none flex items-center"
          >
            {isOffline ? (
              <WifiOff className="w-3.5 h-3.5 text-amber-500" />
            ) : (
              <Wifi className="w-3.5 h-3.5 text-emerald-500" />
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setActiveTab('workspace');
              setIsCodeDrawerOpen(true);
              setShowTerminal(true);
              setTimeout(() => {
                terminalSectionRef.current?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start',
                });
                terminalInputRef.current?.focus();
              }, 100);
            }}
            title="Open Codespace Terminal"
            className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-black dark:text-white bg-white dark:bg-black hover:bg-neutral-100 dark:hover:bg-neutral-900 cursor-pointer flex items-center"
          >
            <Terminal className="w-3.5 h-3.5 text-blue-500" />
          </button>

          <button
            onClick={() => setShowBugModal(true)}
            className="px-2.5 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg cursor-pointer"
          >
            /bug
          </button>

          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            aria-label="Open navigation menu"
            className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-black dark:text-white bg-white dark:bg-black cursor-pointer"
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* =====================================================================
          MOBILE SLIDING NAVBAR DRAWER
      ===================================================================== */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex justify-end">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <aside className="relative z-10 w-64 max-w-[80vw] bg-white dark:bg-black text-black dark:text-white border-l border-neutral-200 dark:border-neutral-800 h-full p-4 flex flex-col justify-between shadow-2xl">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
                <div className="flex items-center gap-1.5 font-bold text-sm">
                  <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                  <span>Nerve Menu</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  aria-label="Close navigation menu"
                  className="p-1 rounded-lg text-neutral-500 hover:text-black dark:hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Navigation Links */}
              <div className="space-y-1">
                {(['workspace', 'incidents', 'integration'] as const).map((tabKey) => (
                  <button
                    key={tabKey}
                    type="button"
                    onClick={() => {
                      setActiveTab(tabKey);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold capitalize transition-colors cursor-pointer ${
                      activeTab === tabKey
                        ? 'bg-blue-600 text-white'
                        : 'text-black dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-900'
                    }`}
                  >
                    {tabKey}
                  </button>
                ))}
              </div>

              {/* Controls inside Sliding Drawer */}
              <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 space-y-2">
                {/* Passive Network Indicator (Icon left, Online/Offline right-aligned like Terminal OPEN/CLOSED) */}
                <div
                  role="status"
                  className="w-full px-3 py-2 rounded-lg text-xs font-medium border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white flex items-center justify-between select-none pointer-events-none"
                >
                  {isOffline ? (
                    <WifiOff className="w-3.5 h-3.5 text-amber-500" />
                  ) : (
                    <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                  )}
                  <span className="font-mono text-[11px]">{isOffline ? 'Offline' : 'Online'}</span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const currentlyOpen = isCodeDrawerOpen && showTerminal;
                    const nextOpen = activeTab !== 'workspace' ? true : !currentlyOpen;
                    setActiveTab('workspace');
                    if (nextOpen) {
                      setIsCodeDrawerOpen(true);
                      setShowTerminal(true);
                    } else {
                      setShowTerminal(false);
                    }
                    setIsMobileMenuOpen(false);
                    setTimeout(() => {
                      terminalSectionRef.current?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                      });
                      if (nextOpen) {
                        terminalInputRef.current?.focus();
                      }
                    }, 80);
                  }}
                  className="w-full px-3 py-2 rounded-lg text-xs font-medium border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white flex items-center justify-between cursor-pointer"
                >
                  <span>Terminal</span>
                  <span className="font-mono text-[11px]">
                    {isCodeDrawerOpen && showTerminal ? 'OPEN' : 'CLOSED'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={toggleTheme}
                  className="w-full px-3 py-2 rounded-lg text-xs font-medium border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                    <span>Theme</span>
                  </span>
                  <span className="font-mono text-[11px]">{isDark ? 'Dark' : 'Light'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    setShowBugModal(true);
                  }}
                  className="w-full px-3 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white text-center cursor-pointer"
                >
                  Report /bug
                </button>
              </div>
            </div>

            {/* Sign In / Profile Section at Bottom of Drawer */}
            <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800">
              {isAuthenticated ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {currentUser?.photoURL && (
                      <img
                        src={currentUser.photoURL}
                        alt={authenticatedDisplayName}
                        className="w-5 h-5 rounded-full shrink-0"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    <span className="text-xs font-medium truncate">
                      {authenticatedDisplayName}
                    </span>
                  </div>
                  <button
                    onClick={handleSignOutAll}
                    className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    setAuthModalMode('signin');
                    setAuthError('');
                    setShowAuthModal(true);
                  }}
                  className="w-full py-2 px-3 rounded-lg text-xs font-semibold border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Sign In</span>
                </button>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Offline Queue Banner when items are waiting in LocalStorage */}
      {offlineQueue.length > 0 && (
        <div className="px-3 sm:px-6 py-1.5 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800/60 flex items-center justify-between text-xs">
          <span className="font-mono text-amber-800 dark:text-amber-300">
            Offline Queue: {offlineQueue.length} item(s) waiting for live network
          </span>
          {isSyncingQueue && (
            <span className="font-mono text-amber-700 dark:text-amber-300 flex items-center gap-1">
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>Auto-Syncing...</span>
            </span>
          )}
        </div>
      )}

      {/* =====================================================================
          VIEWPORT CONTENT
      ===================================================================== */}
      {activeTab === 'integration' && (
        <Integration
          keyEnvironment={keyEnvironment}
          onChangeEnvironment={setKeyEnvironment}
          liveApiKey={liveApiKey}
          testApiKey={testApiKey}
          onGenerateNewKey={handleCreateApiKey}
          onTriggerWebhook={(eventType) => handleTriggerGitHubWebhook(eventType)}
          repositories={repositories}
          incidentReports={incidentReports}
          onUpdateRepoCiStatus={(repo, status) => {
            setRepositories((prev) =>
              prev[repo]
                ? {
                    ...prev,
                    [repo]: {
                      ...prev[repo],
                      ciStatus: status,
                    },
                  }
                : prev
            );
          }}
          isDark={isDark}
        />
      )}

      {activeTab === 'incidents' && (
        <IncidentWorkflowView
          reports={incidentReports}
          selectedTicketId={selectedIncidentTicketId}
          onSelectTicket={(ticketId) => setSelectedIncidentTicketId(ticketId)}
          onRunTestForIncident={async () => {
            await handleRunCodespaceCommand('npm test');
            setActiveTab('workspace');
          }}
          onDeployFixForIncident={async (ticketId) => {
            await handleResolveIncidentWithPR(ticketId);
          }}
          onTriggerWebhook={(eventType, ticketId) =>
            handleTriggerGitHubWebhook(eventType, ticketId)
          }
          onOpenBugModal={() => setShowBugModal(true)}
          onBackToMessenger={() => setActiveTab('workspace')}
          isDark={isDark}
        />
      )}

      {activeTab === 'workspace' && (
        <main className="flex-1 flex flex-col lg:flex-row min-h-[calc(100vh-52px)] divide-y lg:divide-y-0 lg:divide-x divide-neutral-200 dark:divide-neutral-800">
          {/* =================================================================
              LEFT: Streamlined Chat Stream & Real GitHub Search
          ================================================================= */}
          <section className="flex-1 bg-white dark:bg-black flex flex-col justify-between min-w-0">
            {/* GitHub Search & Peer Bar */}
            <div className="px-3 sm:px-5 py-2.5 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black space-y-2">
              {/* Row 1: GitHub Search Bar for External Repositories & Peers */}
              <div className="relative">
                <form
                  onSubmit={(e) => handleExecuteGitHubSearch(e)}
                  className="flex flex-wrap sm:flex-nowrap items-center gap-1.5"
                >
                  <div className="relative flex-1 min-w-[180px]">
                    <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      ref={githubSearchInputRef}
                      type="text"
                      value={githubSearchQuery}
                      onChange={(e) => setGithubSearchQuery(e.target.value)}
                      onFocus={() => {
                        if (
                          githubSearchResults.repositories.length > 0 ||
                          githubSearchResults.users.length > 0
                        ) {
                          setShowSearchDropdown(true);
                        }
                      }}
                      placeholder="Search any repo channel (GitHub, GitLab, Bitbucket, owner/repo) or @peer... (Ctrl+Shift+P)"
                      className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-900 p-0.5 rounded-lg text-[11px] border border-neutral-200 dark:border-neutral-800">
                    {(['all', 'repositories', 'users'] as const).map((filterKey) => (
                      <button
                        key={filterKey}
                        type="button"
                        onClick={() => {
                          setGithubSearchType(filterKey);
                          if (githubSearchQuery.trim()) {
                            handleExecuteGitHubSearch(undefined, filterKey);
                          }
                        }}
                        className={`px-2 py-1 rounded-md font-medium capitalize transition-colors cursor-pointer ${
                          githubSearchType === filterKey
                            ? 'bg-blue-600 text-white'
                            : 'text-black dark:text-white'
                        }`}
                      >
                        {filterKey === 'repositories' ? 'Repos' : filterKey === 'users' ? 'Peers' : 'All'}
                      </button>
                    ))}
                  </div>

                  <button
                    type="submit"
                    disabled={isSearchingGitHub}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white cursor-pointer whitespace-nowrap"
                  >
                    {isSearchingGitHub ? '...' : 'Search'}
                  </button>

                  {showSearchDropdown && (
                    <button
                      type="button"
                      onClick={() => setShowSearchDropdown(false)}
                      className="p-1 rounded-lg text-neutral-500 hover:text-black dark:hover:text-white cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </form>

                {/* GitHub Search Results Popover */}
                {showSearchDropdown && (
                  <div className="mt-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black shadow-lg p-3 space-y-2.5 z-20">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {(githubSearchType === 'all' || githubSearchType === 'repositories') && (
                        <div className="space-y-1.5">
                          <div className="text-[11px] font-semibold text-black dark:text-white">
                            Repositories ({githubSearchResults.repositories.length})
                          </div>
                          {githubSearchResults.repositories.length === 0 ? (
                            <div className="text-xs text-neutral-500 py-1">No repositories found.</div>
                          ) : (
                            githubSearchResults.repositories.map((repoItem) => {
                              const alreadyTracked = Boolean(repositories[repoItem.fullName]);
                              return (
                                <div
                                  key={repoItem.fullName}
                                  className="p-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black flex items-center justify-between gap-2"
                                >
                                  <div className="min-w-0">
                                    <div className="text-xs font-mono font-semibold text-black dark:text-white truncate">
                                      {repoItem.fullName}
                                    </div>
                                    <div className="text-[11px] text-neutral-500 truncate">
                                      {repoItem.language} · {repoItem.stars.toLocaleString()} ★
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleTrackExternalRepository(repoItem)}
                                    className={`px-2 py-1 rounded-md text-xs font-medium shrink-0 cursor-pointer ${
                                      alreadyTracked
                                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                                        : 'bg-blue-600 hover:bg-blue-500 text-white'
                                    }`}
                                  >
                                    {alreadyTracked ? 'Open' : '+ Track'}
                                  </button>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}

                      {(githubSearchType === 'all' || githubSearchType === 'users') && (
                        <div className="space-y-1.5">
                          <div className="text-[11px] font-semibold text-black dark:text-white">
                            Developers ({githubSearchResults.users.length})
                          </div>
                          {githubSearchResults.users.length === 0 ? (
                            <div className="text-xs text-neutral-500 py-1">No users found.</div>
                          ) : (
                            githubSearchResults.users.map((userItem) => {
                              const alreadyPeer = peers.some(
                                (p) => p.handle.toLowerCase() === userItem.login.toLowerCase()
                              );
                              return (
                                <div
                                  key={userItem.login}
                                  className="p-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black flex items-center justify-between gap-2"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <img
                                      src={userItem.avatarUrl}
                                      alt={userItem.login}
                                      className="w-5 h-5 rounded-full shrink-0"
                                      referrerPolicy="no-referrer"
                                    />
                                    <span className="text-xs font-semibold text-black dark:text-white truncate">
                                      @{userItem.login}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      disabled={isAddingPeer}
                                      onClick={() => handleTrackSearchedPeer(userItem.login)}
                                      className={`px-2 py-1 rounded-md text-xs font-medium shrink-0 cursor-pointer ${
                                        alreadyPeer
                                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                                          : 'bg-blue-600 hover:bg-blue-500 text-white'
                                      }`}
                                    >
                                      {alreadyPeer ? 'Select' : '+ Add'}
                                    </button>
                                    <button
                                      type="button"
                                      title={`Delete @${userItem.login}`}
                                      onClick={(e) => handleDeleteUserPeer(userItem.login, e)}
                                      className="p-1 rounded-md border border-neutral-200 dark:border-neutral-800 text-neutral-500 hover:text-red-500 hover:border-red-500/40 cursor-pointer"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Row 2: Tracked GitHub Peers & Quick Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  {peers.map((peer) => {
                    const isSelected = activePeer?.handle === peer.handle;
                    return (
                      <div
                        key={peer.id}
                        className={`pl-2.5 pr-1.5 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap border ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white dark:bg-black text-black dark:text-white border-neutral-200 dark:border-neutral-800'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedPeerHandle(peer.handle)}
                          className="flex items-center gap-1.5 cursor-pointer"
                        >
                          {peer.avatarUrl ? (
                            <img
                              src={peer.avatarUrl}
                              alt={peer.handle}
                              className="w-4 h-4 rounded-full shrink-0"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span className="font-mono font-bold text-[10px]">
                              {peer.avatarInitials}
                            </span>
                          )}
                          <span>@{peer.handle}</span>
                        </button>
                        <button
                          type="button"
                          title={`Delete @${peer.handle}`}
                          onClick={(e) => handleDeleteUserPeer(peer.handle, e)}
                          className={`p-0.5 rounded transition-colors cursor-pointer ${
                            isSelected
                              ? 'text-white/80 hover:text-white hover:bg-blue-700'
                              : 'text-neutral-400 hover:text-red-500 hover:bg-neutral-100 dark:hover:bg-neutral-900'
                          }`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}

                  <form onSubmit={handleAddRealGitHubPeer} className="flex items-center gap-1">
                    <input
                      type="text"
                      value={newPeerGithubHandle}
                      onChange={(e) => setNewPeerGithubHandle(e.target.value)}
                      placeholder="+ @peer-handle"
                      className="w-28 px-2 py-1 text-xs font-mono rounded-lg border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white focus:outline-none"
                    />
                    {newPeerGithubHandle.trim() && (
                      <button
                        type="submit"
                        disabled={isAddingPeer}
                        className="p-1 rounded-lg bg-blue-600 text-white hover:bg-blue-500 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </form>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setGlobalFocusSwitch(!globalFocusSwitch)}
                    className={`px-2 py-1 rounded-lg text-xs font-medium border cursor-pointer ${
                      globalFocusSwitch
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300'
                        : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white'
                    }`}
                  >
                    Focus: {globalFocusSwitch ? 'ON' : 'OFF'}
                  </button>

                  <button
                    onClick={() => handleInvokeNerveShark()}
                    disabled={!canOpenP2PChannel || isSharkThinking}
                    className="px-2.5 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-lg flex items-center gap-1 cursor-pointer"
                  >
                    <Code2 className="w-3.5 h-3.5" />
                    <span>{isSharkThinking ? '...' : 'Nerve Shark'}</span>
                  </button>

                  <button
                    onClick={() => setIsCodeDrawerOpen(!isCodeDrawerOpen)}
                    className="p-1.5 text-xs font-medium text-black dark:text-white border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black rounded-lg cursor-pointer"
                    title="Toggle Code & Terminal Drawer"
                  >
                    {isCodeDrawerOpen ? (
                      <PanelRightClose className="w-3.5 h-3.5" />
                    ) : (
                      <PanelRightOpen className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* ===============================================================
                COMPACT WORKSPACE DASHBOARD: Top Contributors & Recent Activity
            =============================================================== */}
            {(peers.length > 0 || incidentReports.length > 0) && (
              <div className="px-3 sm:px-5 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1 bg-white dark:bg-black border border-neutral-200 dark:border-neutral-800 p-0.5 rounded-lg text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setWorkspaceDashboardTab('contributors');
                        setShowWorkspaceDashboard(true);
                      }}
                      className={`px-2 py-0.5 rounded-md font-medium cursor-pointer ${
                        workspaceDashboardTab === 'contributors' && showWorkspaceDashboard
                          ? 'bg-blue-600 text-white'
                          : 'text-black dark:text-white'
                      }`}
                    >
                      Contributors ({peers.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setWorkspaceDashboardTab('prs');
                        setShowWorkspaceDashboard(true);
                      }}
                      className={`px-2 py-0.5 rounded-md font-medium cursor-pointer ${
                        workspaceDashboardTab === 'prs' && showWorkspaceDashboard
                          ? 'bg-blue-600 text-white'
                          : 'text-black dark:text-white'
                      }`}
                    >
                      Recent Activity ({incidentReports.length})
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {desktopNotifPermission === 'default' && (
                      <button
                        type="button"
                        onClick={requestDesktopNotificationPermission}
                        className="px-2 py-0.5 rounded-lg text-[11px] font-medium border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white flex items-center gap-1 cursor-pointer"
                      >
                        <Bell className="w-3 h-3 text-blue-500" />
                        <span>Alerts</span>
                      </button>
                    )}

                    {activeRepo && (
                      <button
                        type="button"
                        onClick={() => {
                          setRepositories((prev) => ({
                            ...prev,
                            [activeRepo.repo]: {
                              ...prev[activeRepo.repo],
                              ciStatus: 'Failing',
                            },
                          }));
                          emitCiFailureNotification(
                            activeRepo.repo,
                            activeRepo.branch,
                            activeRepo.latestCommit,
                            `Build check failed on ${activeFile?.path || 'src/index.ts'}:L${highlightedLine || 1}.`
                          );
                        }}
                        className="px-2 py-0.5 rounded-lg text-[11px] font-medium border border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-300 flex items-center gap-1 cursor-pointer"
                      >
                        <AlertTriangle className="w-3 h-3" />
                        <span>Test CI Fail</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowWorkspaceDashboard(!showWorkspaceDashboard)}
                      className="p-1 rounded-lg text-black dark:text-white cursor-pointer"
                    >
                      {showWorkspaceDashboard ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {showWorkspaceDashboard && (
                  <div>
                    {workspaceDashboardTab === 'contributors' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
                        {[...peers]
                          .sort((a, b) => b.proofOfWorkCommits - a.proofOfWorkCommits)
                          .map((peer, rankIdx) => (
                            <div
                              key={peer.id}
                              onClick={() => setSelectedPeerHandle(peer.handle)}
                              className={`p-2 rounded-xl border transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                                activePeer?.handle === peer.handle
                                  ? 'border-blue-500 bg-white dark:bg-black'
                                  : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {peer.avatarUrl ? (
                                  <img
                                    src={peer.avatarUrl}
                                    alt={peer.handle}
                                    className="w-6 h-6 rounded-full shrink-0"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="w-6 h-6 rounded-full border border-neutral-300 dark:border-neutral-700 flex items-center justify-center text-[10px] font-mono font-bold shrink-0">
                                    {peer.avatarInitials}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold text-black dark:text-white truncate">
                                    #{rankIdx + 1} {peer.name}
                                  </div>
                                  <div className="text-[10px] font-mono text-neutral-500 truncate">
                                    @{peer.handle}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <div className="text-right font-mono tabular-nums">
                                  <div className="text-xs font-bold text-black dark:text-white">
                                    {peer.proofOfWorkCommits.toLocaleString()}
                                  </div>
                                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400">
                                    {peer.mergedPrs} PRs
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  title={`Delete @${peer.handle}`}
                                  onClick={(e) => handleDeleteUserPeer(peer.handle, e)}
                                  className="p-1 rounded-md text-neutral-400 hover:text-red-500 hover:bg-neutral-100 dark:hover:bg-neutral-900 cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                      </div>
                    ) : incidentReports.length === 0 ? (
                      <div className="text-xs text-neutral-500 py-1">
                        No PR or incident activity recorded yet.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {incidentReports.slice(0, 4).map((inc) => (
                          <div
                            key={inc.ticketId}
                            onClick={() => {
                              setSelectedIncidentTicketId(inc.ticketId);
                              setActiveTab('incidents');
                            }}
                            className="p-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black flex items-center justify-between gap-2 cursor-pointer"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <GitCommit className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-black dark:text-white truncate">
                                  {inc.ticketId} · {inc.summary}
                                </div>
                                <div className="text-[10px] font-mono text-neutral-500 truncate">
                                  {inc.repo} · {inc.status}
                                </div>
                              </div>
                            </div>
                            <span className="text-[10px] font-mono text-blue-600 dark:text-blue-400 shrink-0">
                              L{inc.lineNumber} →
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Chat Stream Body */}
            {!activePeer ? (
              <div className="flex-1 p-6 flex flex-col items-center justify-center text-center space-y-3">
                <div className="max-w-sm space-y-2">
                  <h3 className="text-sm font-bold text-black dark:text-white">
                    Add a Peer or Repository Channel
                  </h3>
                  <p className="text-xs text-black/70 dark:text-white/70">
                    Search any repository channel (GitHub, GitLab, Bitbucket, or custom Git remote) above or enter `+ @peer-handle` to open an E2EE P2P channel.
                  </p>
                </div>
              </div>
            ) : !hasProofOfWork ? (
              <div className="flex-1 p-6 flex flex-col items-center justify-center text-center space-y-2">
                <ShieldAlert className="w-6 h-6 text-red-500" />
                <h3 className="text-xs font-bold text-black dark:text-white">
                  Blocked by Proof-of-Work Gate (&lt;15 Commits)
                </h3>
              </div>
            ) : !isMutualFollow ? (
              <div className="flex-1 p-6 flex flex-col items-center justify-center text-center space-y-3">
                <Lock className="w-6 h-6 text-amber-500" />
                <h3 className="text-xs font-bold text-black dark:text-white">
                  Mutual Follow Required with @{activePeer.handle}
                </h3>
                <button
                  onClick={() => handleToggleFollowPeer(activePeer.handle)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Follow @{activePeer.handle}</span>
                </button>
              </div>
            ) : globalFocusSwitch || activePeer.focusModeOptOut ? (
              <div className="flex-1 p-6 flex flex-col items-center justify-center text-center space-y-3">
                <SlidersHorizontal className="w-6 h-6 text-blue-500" />
                <h3 className="text-xs font-bold text-black dark:text-white">
                  {globalFocusSwitch
                    ? 'Focus Mode Active'
                    : `${activePeer.name} is in Focus Mode`}
                </h3>
                {globalFocusSwitch && (
                  <button
                    onClick={() => setGlobalFocusSwitch(false)}
                    className="px-3.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg cursor-pointer"
                  >
                    Resume
                  </button>
                )}
              </div>
            ) : (
              <div className="flex-1 p-3 sm:p-5 space-y-3 overflow-y-auto max-h-[calc(100vh-210px)]">
                {currentMessages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-black/60 dark:text-white/60 py-12">
                    E2EE channel open with @{activePeer.handle} (AES-GCM-256). Send a message, `owner/repo#branch/file:L10`, `@shark`, or `/bug`.
                  </div>
                ) : (
                  currentMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`relative group rounded-xl border p-3.5 space-y-2 max-w-2xl ${
                        msg.senderRole === 'copilot'
                          ? 'border-blue-500 bg-white dark:bg-black'
                          : msg.senderRole === 'self'
                          ? 'ml-auto border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black'
                          : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs text-black/70 dark:text-white/70">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-black dark:text-white">
                            {msg.senderName}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                            E2EE
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px]">{msg.timestamp}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveReactionPickerMessageId((prev) =>
                                prev === msg.id ? null : msg.id
                              );
                            }}
                            title="Add reaction emoji"
                            className="p-1 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-900 text-black/70 dark:text-white/70 hover:text-black dark:hover:text-white cursor-pointer"
                            aria-label="Add reaction emoji"
                          >
                            <Smile className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <p className="text-xs sm:text-sm text-black dark:text-white leading-relaxed">
                        {msg.text}
                      </p>

                      {/* Interactive Reactions Display & Emoji Picker Directly Beneath Message Text */}
                      <div className="space-y-1.5 pt-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {msg.reactions &&
                            msg.reactions.map((reaction) => {
                              const hasReacted = reaction.users.includes(currentSenderHandle);
                              const userList = reaction.users
                                .map((u) => (u === currentSenderHandle ? 'You' : `@${u}`))
                                .join(', ');

                              return (
                                <button
                                  key={reaction.emoji}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleMessageReaction(msg.id, reaction.emoji);
                                  }}
                                  title={`Reacted by: ${userList} (${hasReacted ? 'Click to remove' : 'Click to add'})`}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors cursor-pointer border ${
                                    hasReacted
                                      ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-500 text-blue-700 dark:text-blue-300 font-semibold'
                                      : 'bg-neutral-100 dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-black/80 dark:text-white/80 hover:bg-neutral-200/80 dark:hover:bg-neutral-800/80'
                                  }`}
                                >
                                  <span className="text-sm leading-none">{reaction.emoji}</span>
                                  <span className="font-mono text-[11px] font-medium leading-none">
                                    {reaction.count}
                                  </span>
                                </button>
                              );
                            })}

                          {/* Quick reaction trigger button (Smile +) */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveReactionPickerMessageId((prev) =>
                                prev === msg.id ? null : msg.id
                              );
                            }}
                            title="Choose reaction emoji"
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border transition-colors cursor-pointer ${
                              activeReactionPickerMessageId === msg.id
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-300 font-semibold'
                                : 'border-dashed border-neutral-300 dark:border-neutral-700 text-black/70 dark:text-white/70 hover:text-black dark:hover:text-white hover:border-neutral-400 dark:hover:border-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900'
                            }`}
                          >
                            <Smile className="w-3.5 h-3.5" />
                            <span>+</span>
                          </button>
                        </div>

                        {/* Responsive Inline Emoji Picker Tray directly beneath message */}
                        {activeReactionPickerMessageId === msg.id && (
                          <div
                            className="w-full max-w-full flex flex-wrap items-center justify-between gap-1.5 p-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black shadow-lg z-30 transition-all"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex flex-wrap items-center gap-1 flex-1 min-w-0">
                              {QUICK_REACTION_EMOJIS.map((emoji) => {
                                const hasReacted = msg.reactions?.some(
                                  (r) => r.emoji === emoji && r.users.includes(currentSenderHandle)
                                );
                                return (
                                  <button
                                    key={emoji}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleToggleMessageReaction(msg.id, emoji);
                                      setActiveReactionPickerMessageId(null);
                                    }}
                                    className={`w-7 h-7 flex items-center justify-center rounded-lg text-base transition-transform hover:scale-110 shrink-0 cursor-pointer ${
                                      hasReacted
                                        ? 'bg-blue-100 dark:bg-blue-900/60 ring-1 ring-blue-500'
                                        : 'hover:bg-neutral-100 dark:hover:bg-neutral-900'
                                    }`}
                                    title={`React with ${emoji}`}
                                  >
                                    {emoji}
                                  </button>
                                );
                              })}
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveReactionPickerMessageId(null);
                              }}
                              className="w-6 h-6 flex items-center justify-center rounded-lg text-neutral-400 hover:text-black dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-900 cursor-pointer ml-auto text-xs shrink-0"
                              title="Close emoji picker"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      {msg.parsedLinks &&
                        msg.parsedLinks.map((link, idx) => (
                          <div
                            key={`${msg.id}-link-${idx}`}
                            className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black p-2.5 flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-black dark:text-white font-mono truncate">
                                {link.filePath}:{link.lineNumber}
                              </div>
                              <div className="text-[11px] text-black/70 dark:text-white/70 font-mono truncate">
                                {link.repo}#{link.branch}
                              </div>
                            </div>
                            <button
                              onClick={() =>
                                handleNavigateDeepLink(link.repo, link.filePath, link.lineNumber)
                              }
                              className="px-2.5 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg flex items-center gap-1 shrink-0 cursor-pointer"
                            >
                              <FolderGit2 className="w-3 h-3" />
                              <span>L{link.lineNumber}</span>
                            </button>
                          </div>
                        ))}

                      {msg.incidentTicket && (
                        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black p-2.5 space-y-2">
                          <div className="flex items-center justify-between text-xs font-mono">
                            <span className="font-semibold text-red-600 dark:text-red-400">
                              {msg.incidentTicket.ticketId} · {msg.incidentTicket.status}
                            </span>
                            <span className="text-black/70 dark:text-white/70">
                              L{msg.incidentTicket.lineNumber}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              onClick={() =>
                                handleResolveIncidentWithPR(msg.incidentTicket!.ticketId)
                              }
                              className="px-2.5 py-1 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg flex items-center gap-1 cursor-pointer"
                            >
                              <GitPullRequest className="w-3 h-3" />
                              <span>
                                {msg.incidentTicket.status.includes('Resolved')
                                  ? 'Merged'
                                  : 'Push PR'}
                              </span>
                            </button>

                            <button
                              onClick={() => {
                                setSelectedIncidentTicketId(msg.incidentTicket!.ticketId);
                                setActiveTab('incidents');
                              }}
                              className="px-2.5 py-1 text-xs font-medium text-black dark:text-white bg-white dark:bg-black border border-neutral-200 dark:border-neutral-800 rounded-lg cursor-pointer"
                            >
                              Pipeline →
                            </button>
                          </div>
                        </div>
                      )}

                      {msg.sharedCodeSnippet && (
                        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black overflow-hidden">
                          <div className="px-2.5 py-1.5 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-2 text-[11px] font-mono">
                            <div className="flex items-center gap-1.5 truncate">
                              <Code2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                              <span className="font-semibold text-black dark:text-white truncate">
                                {msg.sharedCodeSnippet.filePath}
                              </span>
                              <span className="px-1.5 py-0.5 rounded text-[10px] border border-neutral-200 dark:border-neutral-800 text-black/70 dark:text-white/70">
                                {msg.sharedCodeSnippet.language}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                handleNavigateDeepLink(
                                  msg.sharedCodeSnippet!.repo,
                                  msg.sharedCodeSnippet!.filePath,
                                  msg.sharedCodeSnippet!.highlightedLine
                                )
                              }
                              className="text-blue-600 dark:text-blue-400 hover:underline shrink-0 cursor-pointer"
                            >
                              Inspect L{msg.sharedCodeSnippet.highlightedLine}
                            </button>
                          </div>
                          <div className="p-2 overflow-x-auto font-mono text-[11px] leading-relaxed">
                            {msg.sharedCodeSnippet.lines.map((snippetLine, sIdx) => {
                              const lineNum = msg.sharedCodeSnippet!.startLine + sIdx;
                              const isHighlighted =
                                lineNum === msg.sharedCodeSnippet!.highlightedLine;
                              const snippetLang = detectCodeLanguage(
                                msg.sharedCodeSnippet!.filePath,
                                msg.sharedCodeSnippet!.language
                              );
                              return (
                                <div
                                  key={lineNum}
                                  className={`flex items-start gap-2.5 px-1.5 py-0.5 rounded ${
                                    isHighlighted
                                      ? 'bg-red-500/20 font-semibold'
                                      : ''
                                  }`}
                                >
                                  <span className="w-6 text-right text-black/40 dark:text-white/40 select-none tabular-nums shrink-0">
                                    {lineNum}
                                  </span>
                                  <span className="whitespace-pre">
                                    {renderSyntaxHighlightedLine(snippetLine, snippetLang.id)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {msg.copilotPatch && (
                        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black p-2.5 space-y-2">
                          <pre className="text-xs font-mono text-emerald-600 dark:text-emerald-400 overflow-x-auto leading-relaxed">
                            {msg.copilotPatch.suggestedPatch}
                          </pre>
                          <button
                            onClick={() => handleApplyPatchToCodespace(msg.id)}
                            className="px-2.5 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg cursor-pointer"
                          >
                            {msg.copilotPatch.applied || patchApplied
                              ? 'Applied'
                              : 'Apply Shark Fix'}
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Contextual Quick-Reply Bar & Composer */}
            <div className="p-3 border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black space-y-2">
              {canOpenP2PChannel && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                  {(() => {
                    const lastMsg = currentMessages[currentMessages.length - 1];
                    const hasOpenIncident =
                      Boolean(lastMsg?.incidentTicket) ||
                      incidentReports.some((r) => r.status !== 'PR Merged & Deployed');
                    const hasPendingPatch =
                      Boolean(lastMsg?.copilotPatch && !lastMsg.copilotPatch.applied) &&
                      !patchApplied;
                    const suggestions = [
                      'Looking into it',
                      'Tests passed',
                      'Fix merged',
                      ...(hasOpenIncident ? ['Checking stack trace'] : []),
                      ...(hasPendingPatch ? ['Applying Shark patch'] : []),
                      ...(activeRepo && activeFile
                        ? [`${activeRepo.repo}#${activeRepo.branch}/${activeFile.path}:L${highlightedLine}`]
                        : []),
                    ];
                    return suggestions.map((replyText) => (
                      <button
                        key={replyText}
                        type="button"
                        onClick={() => handleSendMessage(undefined, replyText)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-mono border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white hover:border-blue-500 dark:hover:border-blue-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {replyText}
                      </button>
                    ));
                  })()}
                </div>
              )}

              <form onSubmit={(e) => handleSendMessage(e)} className="flex items-center gap-2">
                <input
                  ref={chatComposerInputRef}
                  type="text"
                  disabled={!canOpenP2PChannel}
                  value={composerText}
                  onChange={(e) => setComposerText(e.target.value)}
                  placeholder={
                    canOpenP2PChannel
                      ? 'Message, repo#branch/file:L42, @shark, or /bug... (Ctrl+Shift+C)'
                      : 'Add/select a peer to message'
                  }
                  className="flex-1 px-3.5 py-2 text-xs rounded-xl border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={!canOpenP2PChannel || !composerText.trim()}
                  className="px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-xl flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isOffline ? 'Queue' : 'Send'}</span>
                </button>
              </form>
            </div>
          </section>

          {/* =================================================================
              RIGHT DRAWER: Code Viewer & Shared Codespace Terminal (Kept as liked)
          ================================================================= */}
          {isCodeDrawerOpen && (
            <section className="w-full lg:w-[440px] bg-white dark:bg-black flex flex-col justify-between shrink-0">
              {/* File Header & Repo/File Switcher */}
              <div className="p-3.5 border-b border-neutral-200 dark:border-neutral-800 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-black dark:text-white font-mono truncate">
                        {activeFile ? activeFile.path : 'No repository tracked'}
                      </span>
                      {activeFile && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono border border-neutral-200 dark:border-neutral-800 text-blue-600 dark:text-blue-400 shrink-0">
                          {detectCodeLanguage(activeFile.path, activeFile.language).label}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-black/70 dark:text-white/70 font-mono truncate">
                      {activeRepo
                        ? `${activeRepo.repo} · Line ${highlightedLine}`
                        : 'Search any repository channel above to track a repo'}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {activeFile && (
                      <button
                        type="button"
                        onClick={handleShareFileToChat}
                        disabled={!canOpenP2PChannel || !activePeer}
                        title={
                          canOpenP2PChannel && activePeer
                            ? `Share ${activeFile.path}:L${highlightedLine} snippet to chat`
                            : 'Select a mutual peer channel to share file snippets'
                        }
                        className="px-2.5 py-1 rounded-lg text-xs font-medium border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white hover:border-blue-500 dark:hover:border-blue-400 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                      >
                        {sharedFileFeedback ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Share2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        )}
                        <span>{sharedFileFeedback ? 'Shared' : 'Share File'}</span>
                      </button>
                    )}
                    {activeFile?.patchedLines && (
                      <button
                        onClick={() => setPatchApplied(!patchApplied)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                          patchApplied
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : 'bg-blue-600 text-white'
                        }`}
                      >
                        {patchApplied ? 'Fix Applied' : 'Apply Fix'}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        const nextState = !showTerminal;
                        setShowTerminal(nextState);
                        if (nextState) {
                          setIsCodeDrawerOpen(true);
                          setTimeout(() => {
                            terminalSectionRef.current?.scrollIntoView({
                              behavior: 'smooth',
                              block: 'start',
                            });
                            terminalInputRef.current?.focus();
                          }, 80);
                        }
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1 cursor-pointer ${
                        showTerminal
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300 font-semibold'
                          : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white hover:border-neutral-400'
                      }`}
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      <span>Terminal</span>
                    </button>
                  </div>
                </div>

                {/* Quick Repo Switcher & Collapsible File Explorer Toggle */}
                {Object.keys(repositories).length > 0 && (
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <div className="flex items-center gap-1.5 overflow-x-auto">
                      {Object.values(repositories).map((repoObj) => (
                        <button
                          key={repoObj.repo}
                          onClick={() => {
                            const firstFile = Object.keys(repoObj.files)[0];
                            handleNavigateDeepLink(
                              repoObj.repo,
                              firstFile,
                              repoObj.files[firstFile].bugLine || 1
                            );
                          }}
                          className={`px-2 py-0.5 rounded-md text-[11px] font-mono transition-colors cursor-pointer whitespace-nowrap border ${
                            activeRepo?.repo === repoObj.repo
                              ? 'bg-blue-600 text-white border-blue-600 font-semibold'
                              : 'bg-white dark:bg-black text-black dark:text-white border-neutral-200 dark:border-neutral-800'
                          }`}
                        >
                          {repoObj.repo.split('/')[1] || repoObj.repo}
                        </button>
                      ))}
                    </div>

                    {activeRepo && (
                      <button
                        type="button"
                        onClick={() => setShowFileExplorer((prev) => !prev)}
                        className="px-2 py-0.5 rounded-md text-[11px] font-mono border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        {showFileExplorer ? (
                          <ChevronDown className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                        ) : (
                          <ChevronRight className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                        )}
                        <span>Files ({Object.keys(activeRepo.files).length})</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Collapsible Repository File Explorer Tree */}
                {activeRepo && showFileExplorer && (
                  <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black p-2 max-h-40 overflow-y-auto space-y-0.5 font-mono text-xs">
                    {(() => {
                      const fileTree = buildRepositoryFileTree(Object.keys(activeRepo.files));
                      const renderNodes = (
                        nodes: FileExplorerTreeNode[],
                        depth = 0
                      ): React.ReactNode =>
                        nodes.map((node) => {
                          if (node.type === 'folder') {
                            const isCollapsed = Boolean(collapsedDirs[node.fullPath]);
                            return (
                              <div key={node.fullPath}>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCollapsedDirs((prev) => ({
                                      ...prev,
                                      [node.fullPath]: !prev[node.fullPath],
                                    }))
                                  }
                                  style={{ paddingLeft: `${depth * 12 + 6}px` }}
                                  className="w-full py-1 pr-2 rounded flex items-center gap-1.5 text-left text-black dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-900 cursor-pointer"
                                >
                                  {isCollapsed ? (
                                    <ChevronRight className="w-3 h-3 text-neutral-500 shrink-0" />
                                  ) : (
                                    <ChevronDown className="w-3 h-3 text-neutral-500 shrink-0" />
                                  )}
                                  {isCollapsed ? (
                                    <Folder className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                                  ) : (
                                    <FolderOpen className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                                  )}
                                  <span className="truncate font-semibold">{node.name}</span>
                                </button>
                                {!isCollapsed &&
                                  node.children &&
                                  renderNodes(node.children, depth + 1)}
                              </div>
                            );
                          }

                          const isCurrentFile = activeFile?.path === node.fullPath;
                          const fileMeta = activeRepo.files[node.fullPath];
                          const langBadge = detectCodeLanguage(
                            node.fullPath,
                            fileMeta?.language
                          ).label;

                          return (
                            <button
                              key={node.fullPath}
                              type="button"
                              onClick={() => {
                                setActiveFilePath(node.fullPath);
                                setHighlightedLine(fileMeta?.bugLine || 1);
                              }}
                              style={{ paddingLeft: `${depth * 12 + 20}px` }}
                              className={`w-full py-1 pr-2 rounded flex items-center justify-between gap-2 text-left transition-colors cursor-pointer ${
                                isCurrentFile
                                  ? 'bg-blue-600 text-white font-semibold'
                                  : 'text-black dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-900'
                              }`}
                            >
                              <span className="flex items-center gap-1.5 truncate">
                                <FileCode
                                  className={`w-3.5 h-3.5 shrink-0 ${
                                    isCurrentFile
                                      ? 'text-white'
                                      : 'text-emerald-600 dark:text-emerald-400'
                                  }`}
                                />
                                <span className="truncate">{node.name}</span>
                              </span>
                              <span
                                className={`text-[10px] shrink-0 ${
                                  isCurrentFile
                                    ? 'text-white/90'
                                    : 'text-black/50 dark:text-white/50'
                                }`}
                              >
                                {langBadge}
                              </span>
                            </button>
                          );
                        });

                      return renderNodes(fileTree);
                    })()}
                  </div>
                )}
              </div>

              {/* Syntax-Highlighted Code Lines */}
              <div className="flex-1 bg-white dark:bg-black p-3 overflow-x-auto font-mono text-xs leading-relaxed min-h-[180px]">
                {displayedCodeLines.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-black/60 dark:text-white/60 text-xs py-10 text-center">
                    Search and track any repository channel to inspect live source files.
                  </div>
                ) : (
                  (() => {
                    const viewerLang = detectCodeLanguage(activeFile?.path, activeFile?.language);
                    return displayedCodeLines.map((lineText, idx) => {
                      const displayLineNum = idx + 1;
                      const isTargetLine = displayLineNum === highlightedLine;

                      return (
                        <div
                          key={displayLineNum}
                          onClick={() => setHighlightedLine(displayLineNum)}
                          className={`flex items-start gap-3 px-2 py-0.5 rounded cursor-pointer ${
                            isTargetLine
                              ? 'bg-red-500/20 text-black dark:text-white font-semibold'
                              : 'text-black dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-900'
                          }`}
                        >
                          <span className="w-7 text-right text-black/50 dark:text-white/50 select-none tabular-nums shrink-0">
                            {displayLineNum}
                          </span>
                          <span className="whitespace-pre">
                            {renderSyntaxHighlightedLine(lineText, viewerLang.id)}
                          </span>
                        </div>
                      );
                    });
                  })()
                )}
              </div>

              {/* Persistent Multi-Terminal Session Drawer */}
              <div ref={terminalSectionRef}>
                {showTerminal && (
                  <div className="border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black p-3 space-y-2 relative">
                    {/* Summary View at the Top of the Terminal Area: Only renders when Build has active Running/Success/Failure output (no Idle instructional writings) */}
                    {(() => {
                      const buildSummary = deriveBuildSubTabSummary(
                        activeTerminalInstance.subTabs.build
                      );
                      if (buildSummary.status === 'Idle') return null;

                      const badgeStyle =
                        buildSummary.status === 'Passing'
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/40'
                          : buildSummary.status === 'Failing'
                          ? 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/40'
                          : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40';
                      const dotStyle =
                        buildSummary.status === 'Passing'
                          ? 'bg-emerald-500'
                          : buildSummary.status === 'Failing'
                          ? 'bg-red-500'
                          : 'bg-amber-400 animate-pulse';

                      return (
                        <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black text-[11px] font-mono text-black dark:text-white">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold inline-flex items-center gap-1 shrink-0 ${badgeStyle}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${dotStyle}`} />
                              {buildSummary.label}
                            </span>
                            <span className="truncate text-black/70 dark:text-white/70">
                              {buildSummary.detail}
                            </span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Row 1: Visual Tab Bar with Number Badges, Status Icons, Close/Rename buttons, CPU/MEM/Net Gauges & Session Drawer */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 dark:border-neutral-800 pb-1.5 text-xs font-mono text-black dark:text-white">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Static Codespace text indicator + Small Memory & CPU & Network Gauge */}
                        <span className="px-1.5 py-0.5 text-[11px] font-mono font-bold text-black dark:text-white select-none shrink-0 tracking-tight">
                          Codespace
                        </span>
                        <button
                          type="button"
                          onClick={() => setCodespaceProcessActive((prev) => !prev)}
                          title="Codespace Container Telemetry (CPU & Memory update every few seconds — click to toggle process telemetry monitor)"
                          className={`px-1.5 py-0.5 rounded border text-[10px] font-mono inline-flex items-center gap-1 shrink-0 cursor-pointer transition-colors ${
                            isCodespaceProcessRunning
                              ? 'border-emerald-500/40 bg-emerald-500/10 text-black dark:text-white'
                              : 'border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black text-neutral-500'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              isCodespaceProcessRunning
                                ? 'bg-emerald-500 animate-pulse'
                                : 'bg-neutral-400'
                            }`}
                          />
                          <span className="tabular-nums">
                            CPU {isCodespaceProcessRunning ? codespaceResourceMetrics.cpuPercent : 4}% · MEM{' '}
                            {isCodespaceProcessRunning ? codespaceResourceMetrics.memoryMb : 248}MB
                          </span>
                        </button>
                        <div
                          title="Simulated live network throughput (Upload / Download)"
                          className="px-1.5 py-0.5 rounded border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black text-[10px] font-mono text-neutral-500 dark:text-neutral-400 select-none shrink-0"
                        >
                          <span className="tabular-nums">
                            ▲{networkMetrics.upKb} ▼{networkMetrics.downKb} KB/s
                          </span>
                        </div>
                        <span className="text-neutral-300 dark:text-neutral-700 select-none shrink-0">
                          |
                        </span>

                        {/* Interactive Visual Tab Bar */}
                        {terminalInstances.map((inst, tabIdx) => {
                          const isCurrentInstance = inst.id === activeTerminalInstance.id;
                          const anySubRunning = Object.values(inst.subTabs).some(
                            (st) => st.isRunning
                          );
                          const instBuild = deriveBuildSubTabSummary(inst.subTabs.build);
                          const isError = inst.status === 'error' || instBuild.status === 'Failing';
                          const isSuccess = inst.status === 'success' || instBuild.status === 'Passing';

                          const displayTabName =
                            effectiveSplitDirection === 'horizontal' || isCurrentInstance
                              ? inst.name
                              : inst.name.toLowerCase() === 'terminal'
                              ? 'Term..'
                              : inst.name.length > 3
                              ? `${inst.name.slice(0, 3)}..`
                              : inst.name;

                          return (
                            <div
                              key={inst.id}
                              title={`${inst.name} (${inst.subTabs[inst.activeSubTab].label}) — CWD: ${
                                inst.cwd || '~/acme-cloud/edge-router'
                              } — Click to focus; double-click or right-click to rename (Alt+${tabIdx + 1})`}
                              onClick={() => handleFocusTerminalInstance(inst.id, true)}
                              onContextMenu={(e) => handleOpenTerminalTabContextMenu(inst, e)}
                              onDoubleClick={(e) => handleOpenTerminalTabContextMenu(inst, e)}
                              className={`px-2 py-0.5 rounded text-[11px] font-mono flex items-center gap-1.5 border transition-all cursor-pointer shrink-0 ${
                                isCurrentInstance
                                  ? 'bg-blue-600 text-white border-blue-600 font-semibold ring-1 ring-blue-500/40 shadow-xs'
                                  : 'bg-white dark:bg-black text-black dark:text-white border-neutral-300 dark:border-neutral-800 hover:border-neutral-400'
                              }`}
                            >
                              <span
                                className={`text-[9px] px-1 py-0.2 rounded font-bold shrink-0 ${
                                  isCurrentInstance
                                    ? 'bg-blue-800 text-white/90'
                                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500'
                                }`}
                              >
                                {tabIdx + 1}
                              </span>
                              <span
                                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                  anySubRunning
                                    ? 'bg-amber-400 animate-pulse'
                                    : isError
                                    ? 'bg-red-500'
                                    : isSuccess
                                    ? 'bg-emerald-400'
                                    : isCurrentInstance
                                    ? 'bg-white'
                                    : 'bg-emerald-500'
                                }`}
                              />
                              <span className="font-semibold">{displayTabName}</span>
                              <button
                                type="button"
                                title={`Rename ${inst.name} (max 8 chars, no spaces or .)`}
                                onClick={(e) => handleOpenTerminalTabContextMenu(inst, e)}
                                className={`p-0.5 rounded transition-colors cursor-pointer ${
                                  isCurrentInstance
                                    ? 'hover:bg-blue-700 text-white/80 hover:text-white'
                                    : 'hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-500 hover:text-black dark:hover:text-white'
                                }`}
                              >
                                <Edit3 className="w-2.5 h-2.5" />
                              </button>
                              {inst.isDeletable && (
                                <button
                                  type="button"
                                  title={`Close session ${inst.name} (Alt+W)`}
                                  onClick={(e) => handleDeleteTerminalInstance(inst.id, e)}
                                  className={`p-0.5 rounded transition-colors cursor-pointer ${
                                    isCurrentInstance
                                      ? 'hover:bg-blue-700 text-white/90 hover:text-white'
                                      : 'hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-500 hover:text-red-500'
                                  }`}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          );
                        })}

                        {/* '+' Button: Creates new terminal when only 1 exists, or activates dropdown list of existing terminals when > 1 */}
                        <div className="relative flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            title={
                              hasMultipleTerminals
                                ? 'Toggle Open Terminals Dropdown List'
                                : 'Create New Terminal Session Tab (Alt+T)'
                            }
                            onClick={() => {
                              if (hasMultipleTerminals) {
                                setShowTerminalsDropdown((prev) => !prev);
                              } else {
                                handleCreateNewTerminalInstance();
                              }
                            }}
                            className={`px-2 py-0.5 rounded text-[11px] font-mono border flex items-center gap-1 shrink-0 cursor-pointer ${
                              showTerminalsDropdown && hasMultipleTerminals
                                ? 'bg-blue-600 text-white border-blue-600 font-semibold'
                                : 'border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white hover:border-blue-500'
                            }`}
                          >
                            <Plus className="w-3 h-3" />
                            {hasMultipleTerminals && <ChevronDown className="w-2.5 h-2.5" />}
                          </button>

                          {hasMultipleTerminals && (
                            <button
                              type="button"
                              title="Create New Terminal Session Tab (Alt+T)"
                              onClick={handleCreateNewTerminalInstance}
                              className="px-2 py-0.5 rounded text-[11px] font-mono border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white hover:border-blue-500 shrink-0 cursor-pointer"
                            >
                              New
                            </button>
                          )}

                          {/* Dropdown Menu/List for Existing Open Terminals */}
                          {showTerminalsDropdown && hasMultipleTerminals && (
                            <div className="absolute left-0 top-full mt-1 w-48 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black shadow-xl z-40 py-1">
                              {terminalInstances.map((inst, dropIdx) => {
                                const isCurrent = inst.id === activeTerminalInstance.id;
                                const instBuildSummary = deriveBuildSubTabSummary(
                                  inst.subTabs.build
                                );
                                return (
                                  <div
                                    key={inst.id}
                                    className={`px-2.5 py-1 text-[11px] font-mono flex items-center justify-between gap-1.5 ${
                                      isCurrent
                                        ? 'bg-neutral-900 text-white dark:bg-white dark:text-black font-semibold'
                                        : 'text-black dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-900'
                                    }`}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => {
                                        handleFocusTerminalInstance(inst.id, true);
                                        setShowTerminalsDropdown(false);
                                      }}
                                      className="flex items-center gap-1.5 flex-1 text-left truncate cursor-pointer"
                                    >
                                      <span className="text-[9px] opacity-60">#{dropIdx + 1}</span>
                                      <span
                                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                          instBuildSummary.status === 'Failing'
                                            ? 'bg-red-500'
                                            : instBuildSummary.status === 'Running'
                                            ? 'bg-amber-400 animate-pulse'
                                            : 'bg-emerald-500'
                                        }`}
                                      />
                                      <span className="truncate">{inst.name}</span>
                                      <span className="text-[9px] opacity-70">
                                        ({inst.subTabs[inst.activeSubTab].label})
                                      </span>
                                    </button>
                                    {inst.isDeletable && (
                                      <button
                                        type="button"
                                        title={`Delete ${inst.name}`}
                                        onClick={(e) => handleDeleteTerminalInstance(inst.id, e)}
                                        className="p-0.5 hover:text-red-500 shrink-0 cursor-pointer"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                              <div className="border-t border-neutral-200 dark:border-neutral-800 mt-1 pt-1 px-1">
                                <button
                                  type="button"
                                  onClick={handleCreateNewTerminalInstance}
                                  className="w-full px-2 py-1 rounded text-left text-[11px] font-mono flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:bg-neutral-100 dark:hover:bg-neutral-900 cursor-pointer"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>New Terminal (Alt+T)</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right Controls: Session Summary Drawer Toggle + 'Run' & 'Push' */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setShowSessionSummaryDrawer((prev) => !prev)}
                          title="Toggle Terminal Session Engines & System Metrics Drawer"
                          className={`px-2 py-0.5 rounded text-[11px] font-mono border flex items-center gap-1 cursor-pointer transition-colors ${
                            showSessionSummaryDrawer
                              ? 'bg-blue-600 text-white border-blue-600 font-semibold'
                              : 'border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black text-black dark:text-white hover:border-neutral-400'
                          }`}
                        >
                          <Layers className="w-3 h-3" />
                          <span>Sessions</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleRunCodespaceCommand(
                              'npm run build && npm test',
                              activeTerminalInstance.id,
                              activeTerminalInstance.activeSubTab
                            )
                          }
                          disabled={isRunningTerminal}
                          className="px-2 py-0.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black text-black dark:text-white cursor-pointer"
                        >
                          Run
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleRunCodespaceCommand(
                              'gh pr create --fill',
                              activeTerminalInstance.id,
                              activeTerminalInstance.activeSubTab
                            )
                          }
                          disabled={isRunningTerminal}
                          className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                        >
                          Push
                        </button>
                      </div>
                    </div>

                    {/* Context Menu Popover for Quickly Renaming a Terminal Session Instance (max 8 chars, no space or .) */}
                    {terminalTabContextMenu && (
                      <form
                        onSubmit={handleCommitTerminalRename}
                        className="p-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black shadow-lg space-y-1.5 text-xs font-mono"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-black/70 dark:text-white/70 shrink-0">
                            Rename:
                          </span>
                          <input
                            ref={renameTerminalInputRef}
                            type="text"
                            maxLength={8}
                            value={terminalTabContextMenu.draftName}
                            onChange={(e) => {
                              const rawVal = e.target.value;
                              if (rawVal.includes(' ') || rawVal.includes('.')) {
                                setTerminalRenameError('Spaces and "." are not allowed.');
                              } else if (rawVal.length > 8) {
                                setTerminalRenameError('Max 8 characters allowed.');
                              } else {
                                setTerminalRenameError('');
                              }
                              const sanitized = rawVal.replace(/[ .]/g, '').slice(0, 8);
                              setTerminalTabContextMenu((prev) =>
                                prev ? { ...prev, draftName: sanitized } : null
                              );
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                setTerminalTabContextMenu(null);
                                setTerminalRenameError('');
                              }
                            }}
                            placeholder="Max 8 chars (no space or .)"
                            className="flex-1 px-2 py-0.5 text-xs font-mono rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black text-black dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <button
                            type="submit"
                            className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] cursor-pointer"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTerminalTabContextMenu(null);
                              setTerminalRenameError('');
                            }}
                            className="px-1.5 py-0.5 rounded border border-neutral-300 dark:border-neutral-700 text-black dark:text-white text-[11px] cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                        {terminalRenameError && (
                          <div className="text-[11px] text-red-600 dark:text-red-400">
                            {terminalRenameError}
                          </div>
                        )}
                      </form>
                    )}

                    {/* Row 2: Single-Line Positioned Primary & Vertical Split Placeholders (Abbreviated when inactive in V split; Full in H split) */}
                    {(() => {
                      const isPrimaryActive =
                        activeTerminalInstance.id === primaryPaneInstance.id;
                      const isSecondaryActive =
                        activeTerminalInstance.id === secondaryPaneInstance.id;

                      const formatVerticalLabel = (
                        raw: string,
                        isActiveSide: boolean
                      ): string => {
                        if (effectiveSplitDirection !== 'vertical') {
                          return raw;
                        }
                        if (isActiveSide) {
                          return raw.length > 6 ? `${raw.slice(0, 4)}..` : raw;
                        }
                        if (raw.toLowerCase() === 'terminal') return 'Term..';
                        return raw.length > 3 ? `${raw.slice(0, 3)}..` : raw;
                      };

                      const primaryTermDisplay = formatVerticalLabel(
                        primaryPaneInstance.name,
                        isPrimaryActive
                      );
                      const primarySubDisplay = formatVerticalLabel(
                        primaryPaneSession.label,
                        isPrimaryActive
                      );
                      const secondaryTermDisplay = formatVerticalLabel(
                        secondaryPaneInstance.name,
                        isSecondaryActive
                      );
                      const secondarySubDisplay = formatVerticalLabel(
                        secondaryPaneSession.label,
                        isSecondaryActive
                      );

                      return (
                        <div className="space-y-1.5 text-xs font-mono text-black dark:text-white">
                          <div className="flex items-center justify-between gap-1 whitespace-nowrap">
                            <div className="flex items-center gap-1 min-w-0">
                              {/* Primary Terminal Instance Holder Dropdown (when in Split View, allows picking any existing terminal e.g. t3) */}
                              {effectiveSplitDirection !== 'none' && (
                                <div className="relative shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleFocusTerminalInstance(primaryPaneInstance.id, false);
                                      setShowPrimaryInstanceDropdown((prev) => !prev);
                                      setShowSubTabDropdown(false);
                                      setShowSecondaryInstanceDropdown(false);
                                      setShowSecondarySubTabDropdown(false);
                                    }}
                                    className="px-1.5 py-0.5 rounded text-[11px] font-mono flex items-center gap-1 border bg-neutral-900 text-white dark:bg-white dark:text-black border-neutral-900 dark:border-white font-semibold cursor-pointer"
                                  >
                                    <span>{primaryTermDisplay}</span>
                                    <ChevronDown className="w-3 h-3 shrink-0" />
                                  </button>

                                  {showPrimaryInstanceDropdown && (
                                    <div className="absolute left-0 mt-1 w-28 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black shadow-xl z-40 py-1">
                                      {terminalInstances.map((inst) => {
                                        const isPrimarySelected =
                                          inst.id === primaryPaneInstance.id;
                                        return (
                                          <button
                                            key={inst.id}
                                            type="button"
                                            onClick={() => {
                                              if (inst.id === secondaryPaneInstance.id) {
                                                setSecondarySplitInstanceId(
                                                  primaryPaneInstance.id
                                                );
                                              }
                                              setPrimarySplitInstanceId(inst.id);
                                              setActiveTerminalInstanceId(inst.id);
                                              setShowPrimaryInstanceDropdown(false);
                                              setTimeout(
                                                () => terminalInputRef.current?.focus(),
                                                20
                                              );
                                            }}
                                            className={`w-full px-2.5 py-1 text-left text-[11px] font-mono flex items-center justify-between cursor-pointer ${
                                              isPrimarySelected
                                                ? 'bg-neutral-900 text-white dark:bg-white dark:text-black font-semibold'
                                                : 'text-black dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-900'
                                            }`}
                                          >
                                            <span className="truncate">{inst.name}</span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Primary Build / Logs Dropdown Trigger (separate from terminal holder) */}
                              <div className="relative shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleFocusTerminalInstance(primaryPaneInstance.id, false);
                                    setShowSubTabDropdown((prev) => !prev);
                                    setShowPrimaryInstanceDropdown(false);
                                    setShowSecondaryInstanceDropdown(false);
                                    setShowSecondarySubTabDropdown(false);
                                  }}
                                  className="px-1.5 py-0.5 rounded text-[11px] font-mono flex items-center gap-1 border bg-neutral-900 text-white dark:bg-white dark:text-black border-neutral-900 dark:border-white font-semibold cursor-pointer"
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                      primaryPaneSession.isRunning
                                        ? 'bg-amber-400 animate-pulse'
                                        : 'bg-emerald-500'
                                    }`}
                                  />
                                  <span>{primarySubDisplay}</span>
                                  <ChevronDown className="w-3 h-3 shrink-0" />
                                </button>

                                {showSubTabDropdown && (
                                  <div className="absolute left-0 mt-1 w-28 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black shadow-xl z-40 py-1">
                                    {(['build', 'logs'] as const).map((subKey) => {
                                      const subTabObj = primaryPaneInstance.subTabs[subKey];
                                      const isSubActive =
                                        primaryPaneInstance.activeSubTab === subKey;
                                      return (
                                        <button
                                          key={subKey}
                                          type="button"
                                          onClick={() => {
                                            setTerminalInstances((prev) =>
                                              prev.map((inst) =>
                                                inst.id === primaryPaneInstance.id
                                                  ? { ...inst, activeSubTab: subKey }
                                                  : inst
                                              )
                                            );
                                            handleFocusTerminalInstance(
                                              primaryPaneInstance.id,
                                              true
                                            );
                                            setShowSubTabDropdown(false);
                                          }}
                                          className={`w-full px-2.5 py-1 text-left text-[11px] font-mono flex items-center justify-between cursor-pointer ${
                                            isSubActive
                                              ? 'bg-neutral-900 text-white dark:bg-white dark:text-black font-semibold'
                                              : 'text-black dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-900'
                                          }`}
                                        >
                                          <span>{subTabObj.label}</span>
                                          <span
                                            className={`w-1.5 h-1.5 rounded-full ${
                                              subTabObj.isRunning
                                                ? 'bg-amber-400 animate-pulse'
                                                : 'bg-emerald-500'
                                            }`}
                                          />
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>

                              {/* Split Terminal Controls: H (Horizontal split) and V (Vertical split) — requires > 1 open terminal */}
                              <button
                                type="button"
                                disabled={!hasMultipleTerminals}
                                title={
                                  hasMultipleTerminals
                                    ? 'Split Horizontally across open terminals — tap again to collapse'
                                    : 'Open at least 2 terminals (+) to use Horizontal Split'
                                }
                                onClick={() => {
                                  setShowPrimaryInstanceDropdown(false);
                                  setShowSecondaryInstanceDropdown(false);
                                  setShowSubTabDropdown(false);
                                  setShowSecondarySubTabDropdown(false);
                                  handleToggleSplitTerminal('horizontal');
                                }}
                                className={`px-1.5 py-0.5 rounded text-[11px] font-mono border shrink-0 ${
                                  !hasMultipleTerminals
                                    ? 'opacity-40 cursor-not-allowed border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white'
                                    : effectiveSplitDirection === 'horizontal'
                                    ? 'bg-blue-600 text-white border-blue-600 font-semibold cursor-pointer'
                                    : 'border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black text-black dark:text-white cursor-pointer'
                                }`}
                              >
                                H
                              </button>
                              <button
                                type="button"
                                disabled={!hasMultipleTerminals}
                                title={
                                  hasMultipleTerminals
                                    ? 'Split Vertically across open terminals — tap again to collapse'
                                    : 'Open at least 2 terminals (+) to use Vertical Split'
                                }
                                onClick={() => {
                                  setShowPrimaryInstanceDropdown(false);
                                  setShowSecondaryInstanceDropdown(false);
                                  setShowSubTabDropdown(false);
                                  setShowSecondarySubTabDropdown(false);
                                  handleToggleSplitTerminal('vertical');
                                }}
                                className={`px-1.5 py-0.5 rounded text-[11px] font-mono border shrink-0 ${
                                  !hasMultipleTerminals
                                    ? 'opacity-40 cursor-not-allowed border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white'
                                    : effectiveSplitDirection === 'vertical'
                                    ? 'bg-blue-600 text-white border-blue-600 font-semibold cursor-pointer'
                                    : 'border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black text-black dark:text-white cursor-pointer'
                                }`}
                              >
                                V
                              </button>
                              <button
                                type="button"
                                disabled={!hasMultipleTerminals}
                                title={
                                  hasMultipleTerminals
                                    ? 'Grid Split across open terminals — tap again to collapse'
                                    : 'Open at least 2 terminals (+) to use Grid Split'
                                }
                                onClick={() => {
                                  setShowPrimaryInstanceDropdown(false);
                                  setShowSecondaryInstanceDropdown(false);
                                  setShowSubTabDropdown(false);
                                  setShowSecondarySubTabDropdown(false);
                                  handleToggleSplitTerminal('grid');
                                }}
                                className={`px-1.5 py-0.5 rounded text-[11px] font-mono border shrink-0 ${
                                  !hasMultipleTerminals
                                    ? 'opacity-40 cursor-not-allowed border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white'
                                    : effectiveSplitDirection === 'grid'
                                    ? 'bg-blue-600 text-white border-blue-600 font-semibold cursor-pointer'
                                    : 'border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black text-black dark:text-white cursor-pointer'
                                }`}
                              >
                                Grid
                              </button>

                              {/* Terminal Settings Toggle (Macros & Appearance Color Schemes) */}
                              <button
                                type="button"
                                title="Terminal Settings (Macros & ANSI Color Schemes)"
                                onClick={() => setShowTerminalSettings((prev) => !prev)}
                                className={`p-1 rounded border shrink-0 cursor-pointer ${
                                  showTerminalSettings
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black text-black dark:text-white'
                                }`}
                              >
                                <SlidersHorizontal className="w-3 h-3" />
                              </button>
                            </div>

                            {/* Vertical Split Controls: Two Separate Dropdowns (1: Terminal Instance Holder, 2: Build/Logs Holder) on the exact same line with H and V directly above Clear Terminal */}
                            {effectiveSplitDirection === 'vertical' && (
                              <div className="flex items-center gap-1 shrink-0">
                                {/* Dropdown 1: Split Terminal Instance Holder (interchange between existing terminals e.g. t2, t3) */}
                                <div className="relative">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleFocusTerminalInstance(
                                        secondaryPaneInstance.id,
                                        false
                                      );
                                      setShowSecondaryInstanceDropdown((prev) => !prev);
                                      setShowSecondarySubTabDropdown(false);
                                      setShowPrimaryInstanceDropdown(false);
                                      setShowSubTabDropdown(false);
                                    }}
                                    className="px-1.5 py-0.5 rounded text-[11px] font-mono flex items-center gap-1 border bg-neutral-900 text-white dark:bg-white dark:text-black border-neutral-900 dark:border-white font-semibold cursor-pointer"
                                  >
                                    <span>{secondaryTermDisplay}</span>
                                    <ChevronDown className="w-3 h-3 shrink-0" />
                                  </button>
                                  {showSecondaryInstanceDropdown && (
                                    <div className="absolute right-0 mt-1 w-28 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black shadow-xl z-40 py-1">
                                      {terminalInstances.map((inst) => {
                                        const isSecSelected =
                                          inst.id === secondaryPaneInstance.id;
                                        return (
                                          <button
                                            key={inst.id}
                                            type="button"
                                            onClick={() => {
                                              if (inst.id === primaryPaneInstance.id) {
                                                setPrimarySplitInstanceId(
                                                  secondaryPaneInstance.id
                                                );
                                              }
                                              setSecondarySplitInstanceId(inst.id);
                                              setActiveTerminalInstanceId(inst.id);
                                              setShowSecondaryInstanceDropdown(false);
                                              setTimeout(
                                                () => terminalInputRef.current?.focus(),
                                                20
                                              );
                                            }}
                                            className={`w-full px-2.5 py-1 text-left text-[11px] font-mono flex items-center justify-between cursor-pointer ${
                                              isSecSelected
                                                ? 'bg-neutral-900 text-white dark:bg-white dark:text-black font-semibold'
                                                : 'text-black dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-900'
                                            }`}
                                          >
                                            <span className="truncate">{inst.name}</span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>

                                {/* Dropdown 2: Split Build / Logs Holder (interchange between Build and Logs) */}
                                <div className="relative">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleFocusTerminalInstance(
                                        secondaryPaneInstance.id,
                                        false
                                      );
                                      setShowSecondarySubTabDropdown((prev) => !prev);
                                      setShowSecondaryInstanceDropdown(false);
                                      setShowPrimaryInstanceDropdown(false);
                                      setShowSubTabDropdown(false);
                                    }}
                                    className="px-1.5 py-0.5 rounded text-[11px] font-mono flex items-center gap-1 border bg-neutral-900 text-white dark:bg-white dark:text-black border-neutral-900 dark:border-white font-semibold cursor-pointer"
                                  >
                                    <span
                                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                        secondaryPaneSession.isRunning
                                          ? 'bg-amber-400 animate-pulse'
                                          : 'bg-emerald-500'
                                      }`}
                                    />
                                    <span>{secondarySubDisplay}</span>
                                    <ChevronDown className="w-3 h-3 shrink-0" />
                                  </button>
                                  {showSecondarySubTabDropdown && (
                                    <div className="absolute right-0 mt-1 w-28 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black shadow-xl z-40 py-1">
                                      {(['build', 'logs'] as const).map((subKey) => {
                                        const subTabObj = secondaryPaneInstance.subTabs[subKey];
                                        const isSubActive =
                                          secondaryPaneInstance.activeSubTab === subKey;
                                        return (
                                          <button
                                            key={subKey}
                                            type="button"
                                            onClick={() => {
                                              setTerminalInstances((prev) =>
                                                prev.map((inst) =>
                                                  inst.id === secondaryPaneInstance.id
                                                    ? { ...inst, activeSubTab: subKey }
                                                    : inst
                                                )
                                              );
                                              handleFocusTerminalInstance(
                                                secondaryPaneInstance.id,
                                                true
                                              );
                                              setShowSecondarySubTabDropdown(false);
                                            }}
                                            className={`w-full px-2.5 py-1 text-left text-[11px] font-mono flex items-center justify-between cursor-pointer ${
                                              isSubActive
                                                ? 'bg-neutral-900 text-white dark:bg-white dark:text-black font-semibold'
                                                : 'text-black dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-900'
                                            }`}
                                          >
                                            <span>{subTabObj.label}</span>
                                            <span
                                              className={`w-1.5 h-1.5 rounded-full ${
                                                subTabObj.isRunning
                                                  ? 'bg-amber-400 animate-pulse'
                                                  : 'bg-emerald-500'
                                              }`}
                                            />
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Filter Logs & Clear Terminal Row (clears both Build and Logs on the active terminal) */}
                          <div className="flex items-center justify-end gap-1.5">
                            <div className="relative flex-1 sm:w-40 min-w-[120px] max-w-[190px]">
                              <Search className="w-3 h-3 text-neutral-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                              <input
                                type="text"
                                value={terminalLogFilter}
                                onChange={(e) => setTerminalLogFilter(e.target.value)}
                                placeholder="Filter logs..."
                                aria-label="Filter terminal logs by keyword"
                                className="w-full pl-6 pr-5 py-0.5 text-[11px] font-mono rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black text-black dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                              {terminalLogFilter && (
                                <button
                                  type="button"
                                  onClick={() => setTerminalLogFilter('')}
                                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-black dark:hover:text-white cursor-pointer"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>

                            <button
                              type="button"
                              title={`Download current ${activeTerminalSession.label} session log output on ${activeTerminalInstance.name} as a raw text file (.txt)`}
                              onClick={() =>
                                handleDownloadTerminalSessionLogs(activeTerminalInstance.id)
                              }
                              className="px-2 py-0.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black text-black dark:text-white hover:border-neutral-400 dark:hover:border-neutral-500 flex items-center gap-1 shrink-0 cursor-pointer"
                            >
                              <Download className="w-3 h-3" />
                              <span>Download</span>
                            </button>

                            <button
                              type="button"
                              title={`Clear all Build and Logs output on ${activeTerminalInstance.name}`}
                              onClick={() => handleClearActiveTerminal(activeTerminalInstance.id)}
                              className="px-2 py-0.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black text-black dark:text-white shrink-0 cursor-pointer"
                            >
                              Clear Terminal
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Terminal Settings Panel: User-Definable Macros + ANSI Appearance Color Schemes */}
                    {showTerminalSettings && (
                      <div className="p-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black space-y-2 text-xs font-mono">
                        <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-1.5">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setTerminalSettingsTab('macros')}
                              className={`px-2 py-0.5 rounded text-[11px] cursor-pointer ${
                                terminalSettingsTab === 'macros'
                                  ? 'bg-blue-600 text-white font-semibold'
                                  : 'text-black dark:text-white'
                              }`}
                            >
                              Macros
                            </button>
                            <button
                              type="button"
                              onClick={() => setTerminalSettingsTab('appearance')}
                              className={`px-2 py-0.5 rounded text-[11px] cursor-pointer ${
                                terminalSettingsTab === 'appearance'
                                  ? 'bg-blue-600 text-white font-semibold'
                                  : 'text-black dark:text-white'
                              }`}
                            >
                              Appearance
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowTerminalSettings(false)}
                            className="text-neutral-500 hover:text-black dark:hover:text-white cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {terminalSettingsTab === 'macros' ? (
                          <div className="space-y-2">
                            <form
                              onSubmit={handleAddTerminalMacro}
                              className="grid grid-cols-1 sm:grid-cols-3 gap-1.5"
                            >
                              <input
                                type="text"
                                value={newMacroShortcut}
                                onFocus={() => setIsRecordingShortcut(true)}
                                onBlur={() => setIsRecordingShortcut(false)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Tab' || e.key === 'Enter') return;
                                  e.preventDefault();
                                  const recorded = formatKeyboardEventShortcut(e);
                                  if (recorded && !['Ctrl', 'Alt', 'Shift'].includes(recorded)) {
                                    setNewMacroShortcut(recorded);
                                  }
                                }}
                                onChange={(e) => setNewMacroShortcut(e.target.value)}
                                placeholder="Key (e.g. Alt+B)"
                                title="Press a shortcut combination or type it (e.g. Alt+B)"
                                className="px-2 py-1 text-[11px] rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black text-black dark:text-white"
                              />
                              <input
                                type="text"
                                value={newMacroCommand}
                                onChange={(e) => setNewMacroCommand(e.target.value)}
                                placeholder="npm run build && npm test"
                                className="px-2 py-1 text-[11px] rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black text-black dark:text-white sm:col-span-2"
                              />
                              <input
                                type="text"
                                value={newMacroLabel}
                                onChange={(e) => setNewMacroLabel(e.target.value)}
                                placeholder="Label (optional)"
                                className="px-2 py-1 text-[11px] rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black text-black dark:text-white sm:col-span-2"
                              />
                              <button
                                type="submit"
                                className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold cursor-pointer"
                              >
                                + Bind Macro
                              </button>
                            </form>

                            <div className="space-y-1 max-h-28 overflow-y-auto">
                              {terminalMacros.map((macro) => (
                                <div
                                  key={macro.id}
                                  className="flex items-center justify-between gap-1.5 px-2 py-1 rounded border border-neutral-200 dark:border-neutral-800 text-[11px]"
                                >
                                  <div className="min-w-0 truncate">
                                    <span className="px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-black dark:text-white font-semibold mr-1.5">
                                      {macro.shortcut}
                                    </span>
                                    <span className="text-black dark:text-white font-semibold mr-1">
                                      {macro.label}:
                                    </span>
                                    <span className="text-neutral-500 truncate">
                                      {macro.command}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleRunCodespaceCommand(
                                          macro.command,
                                          activeTerminalInstance.id,
                                          activeTerminalInstance.activeSubTab
                                        )
                                      }
                                      className="px-1.5 py-0.5 rounded bg-blue-600 text-white text-[10px] cursor-pointer"
                                    >
                                      Run
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteTerminalMacro(macro.id)}
                                      className="p-0.5 text-neutral-500 hover:text-red-500 cursor-pointer"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {/* Quick-Toggle Button to Switch Terminal Output between Light and Dark Themes Independent of App Theme */}
                            <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black">
                              <div className="flex items-center gap-1.5">
                                {terminalOutputTheme === 'dark' ? (
                                  <Moon className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                ) : (
                                  <Sun className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                )}
                                <span className="text-[11px] font-semibold text-black dark:text-white">
                                  Terminal Output Theme:
                                </span>
                                <span className="text-[10px] text-neutral-500">
                                  ({terminalOutputTheme === 'dark' ? 'Dark' : 'Light'} · independent of app)
                                </span>
                              </div>
                              <div className="inline-flex items-center rounded border border-neutral-300 dark:border-neutral-700 p-0.5 bg-white dark:bg-black">
                                <button
                                  type="button"
                                  onClick={() => setTerminalOutputTheme('light')}
                                  className={`px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 cursor-pointer transition-colors ${
                                    terminalOutputTheme === 'light'
                                      ? 'bg-blue-600 text-white font-semibold'
                                      : 'text-black dark:text-white'
                                  }`}
                                >
                                  <Sun className="w-2.5 h-2.5" />
                                  <span>Light</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setTerminalOutputTheme('dark')}
                                  className={`px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 cursor-pointer transition-colors ${
                                    terminalOutputTheme === 'dark'
                                      ? 'bg-blue-600 text-white font-semibold'
                                      : 'text-black dark:text-white'
                                  }`}
                                >
                                  <Moon className="w-2.5 h-2.5" />
                                  <span>Dark</span>
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-1.5">
                              {ANSI_COLOR_SCHEMES.map((scheme) => {
                                const isSelected = ansiColorScheme === scheme.id;
                                return (
                                  <button
                                    key={scheme.id}
                                    type="button"
                                    onClick={() => setAnsiColorScheme(scheme.id)}
                                    className={`p-2 rounded border text-left cursor-pointer transition-colors ${
                                      terminalOutputTheme === 'dark'
                                        ? 'bg-black text-white'
                                        : 'bg-white text-black'
                                    } ${
                                      isSelected
                                        ? 'border-blue-600 ring-1 ring-blue-600/30'
                                        : 'border-neutral-300 dark:border-neutral-800 hover:border-neutral-400'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="font-semibold text-[11px]">
                                        {scheme.label}
                                      </span>
                                      {isSelected && (
                                        <Check className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                                      )}
                                    </div>
                                    <div className="text-[10px] mt-0.5">
                                      {renderAnsiFormattedLog(
                                        '\x1b[32mPASS\x1b[0m \x1b[33mWARN\x1b[0m \x1b[31mFAIL\x1b[0m',
                                        scheme.id,
                                        undefined,
                                        terminalOutputTheme
                                      )}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Auto-Scrolling ANSI Escape Sequence Formatted & Live-Filtered Terminal Logs with Draggable Split Handles & Independent Themes */}
                    {(() => {
                      const renderPrimaryPaneLog = (customStyle?: React.CSSProperties) => (
                        <div
                          ref={terminalLogContainerRef}
                          onClick={() => handleFocusTerminalInstance(primaryPaneInstance.id, true)}
                          onScroll={handleTerminalLogScroll}
                          style={customStyle}
                          className={`min-w-0 overflow-y-auto rounded-lg border p-2.5 font-mono text-[11px] space-y-1 cursor-text transition-colors ${
                            customStyle ? '' : 'h-32'
                          } ${
                            terminalOutputTheme === 'dark'
                              ? 'bg-black text-white'
                              : 'bg-white text-black'
                          } ${
                            effectiveSplitDirection !== 'none' &&
                            activeTerminalInstance.id === primaryPaneInstance.id
                              ? 'border-blue-500 ring-1 ring-blue-500/30'
                              : 'border-neutral-300 dark:border-neutral-800'
                          }`}
                        >
                          {(() => {
                            const rawFilter = terminalLogFilter.trim();
                            const filterKeyword = rawFilter.toLowerCase();
                            const allEntries = primaryPaneSession.logs
                              .flatMap((block) => block.split('\n'))
                              .map((text, idx) => ({ text, lineNumber: idx + 1 }));
                            const filteredEntries = filterKeyword
                              ? allEntries.filter((entry) =>
                                  entry.text
                                    .replace(/\x1b\[[0-9;]*m/g, '')
                                    .toLowerCase()
                                    .includes(filterKeyword)
                                )
                              : allEntries;

                            return (
                              <>
                                {rawFilter && (
                                  <div className="px-2 py-1 mb-1 rounded border border-blue-500/40 bg-blue-500/10 flex items-center justify-between text-[10px]">
                                    <span>
                                      Searching: <strong>&quot;{rawFilter}&quot;</strong> ({filteredEntries.length} match{filteredEntries.length === 1 ? '' : 'es'})
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setTerminalLogFilter('');
                                      }}
                                      className="underline cursor-pointer"
                                    >
                                      Clear
                                    </button>
                                  </div>
                                )}
                                {rawFilter && filteredEntries.length === 0 ? (
                                  <div className="text-neutral-500 py-1">
                                    No lines matching &quot;{rawFilter}&quot; in {primaryPaneSession.label}.
                                  </div>
                                ) : (
                                  filteredEntries.map((entry) => {
                                    // eslint-disable-next-line no-control-regex
                                    const plainLine = entry.text.replace(/\x1b\[[0-9;]*m/g, '');
                                    const isErrorEntry = /\b(err|error|fail|failed|fatal|exception)\b/i.test(
                                      plainLine
                                    );
                                    const isSelectedLine =
                                      selectedTerminalLogLine?.instanceId ===
                                        primaryPaneInstance.id &&
                                      selectedTerminalLogLine?.subTab ===
                                        primaryPaneInstance.activeSubTab &&
                                      selectedTerminalLogLine?.lineNumber === entry.lineNumber;

                                    return (
                                      <div
                                        key={entry.lineNumber}
                                        data-line-number={entry.lineNumber}
                                        className={`flex items-start gap-2 px-1.5 py-0.5 rounded leading-relaxed transition-colors ${
                                          isSelectedLine
                                            ? 'bg-blue-500/20 ring-1 ring-blue-500/50'
                                            : isErrorEntry
                                            ? 'bg-red-500/10'
                                            : 'hover:bg-neutral-500/10'
                                        }`}
                                      >
                                        <button
                                          type="button"
                                          title={`Line ${entry.lineNumber} — click to highlight and copy line reference for incident triage`}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedTerminalLogLine((prev) =>
                                              prev?.instanceId === primaryPaneInstance.id &&
                                              prev?.subTab === primaryPaneInstance.activeSubTab &&
                                              prev?.lineNumber === entry.lineNumber
                                                ? null
                                                : {
                                                    instanceId: primaryPaneInstance.id,
                                                    subTab: primaryPaneInstance.activeSubTab,
                                                    lineNumber: entry.lineNumber,
                                                  }
                                            );
                                            navigator.clipboard
                                              ?.writeText(
                                                `[${primaryPaneInstance.name}:${primaryPaneInstance.activeSubTab}#L${entry.lineNumber}] ${plainLine}`
                                              )
                                              .catch(() => {});
                                          }}
                                          className={`w-8 pr-1.5 text-right select-none tabular-nums shrink-0 border-r cursor-pointer font-mono text-[10px] leading-relaxed ${
                                            isSelectedLine
                                              ? 'text-blue-400 border-blue-500 font-bold'
                                              : isErrorEntry
                                              ? 'text-red-400 border-red-500/40 font-semibold'
                                              : terminalOutputTheme === 'dark'
                                              ? 'text-neutral-500 border-neutral-800 hover:text-neutral-300'
                                              : 'text-neutral-400 border-neutral-200 hover:text-neutral-700'
                                          }`}
                                        >
                                          {entry.lineNumber}
                                        </button>
                                        <div className="min-w-0 flex-1 break-all">
                                          {renderAnsiFormattedLog(
                                            entry.text,
                                            ansiColorScheme,
                                            rawFilter,
                                            terminalOutputTheme
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </>
                            );
                          })()}
                        </div>
                      );

                      const renderSecondaryPaneLog = (customStyle?: React.CSSProperties) => (
                        <div
                          ref={secondaryTerminalLogContainerRef}
                          onClick={() => handleFocusTerminalInstance(secondaryPaneInstance.id, true)}
                          style={customStyle}
                          className={`min-w-0 overflow-y-auto rounded-lg border p-2.5 font-mono text-[11px] space-y-1 cursor-text transition-colors ${
                            customStyle ? '' : 'h-32'
                          } ${
                            terminalOutputTheme === 'dark'
                              ? 'bg-black text-white'
                              : 'bg-white text-black'
                          } ${
                            activeTerminalInstance.id === secondaryPaneInstance.id
                              ? 'border-blue-500 ring-1 ring-blue-500/30'
                              : 'border-neutral-300 dark:border-neutral-800'
                          }`}
                        >
                          {(() => {
                            const rawFilter = terminalLogFilter.trim();
                            const filterKeyword = rawFilter.toLowerCase();
                            const allEntries = secondaryPaneSession.logs
                              .flatMap((block) => block.split('\n'))
                              .map((text, idx) => ({ text, lineNumber: idx + 1 }));
                            const filteredEntries = filterKeyword
                              ? allEntries.filter((entry) =>
                                  entry.text
                                    .replace(/\x1b\[[0-9;]*m/g, '')
                                    .toLowerCase()
                                    .includes(filterKeyword)
                                )
                              : allEntries;

                            return (
                              <>
                                {rawFilter && (
                                  <div className="px-2 py-0.5 mb-1 rounded border border-blue-500/40 bg-blue-500/10 text-[10px]">
                                    Searching: <strong>&quot;{rawFilter}&quot;</strong> ({filteredEntries.length})
                                  </div>
                                )}
                                {filteredEntries.map((entry) => {
                                  // eslint-disable-next-line no-control-regex
                                  const plainLine = entry.text.replace(/\x1b\[[0-9;]*m/g, '');
                                  const isErrorEntry = /\b(err|error|fail|failed|fatal|exception)\b/i.test(
                                    plainLine
                                  );
                                  const isSelectedLine =
                                    selectedTerminalLogLine?.instanceId ===
                                      secondaryPaneInstance.id &&
                                    selectedTerminalLogLine?.subTab ===
                                      secondaryPaneInstance.activeSubTab &&
                                    selectedTerminalLogLine?.lineNumber === entry.lineNumber;

                                  return (
                                    <div
                                      key={entry.lineNumber}
                                      data-line-number={entry.lineNumber}
                                      className={`flex items-start gap-2 px-1.5 py-0.5 rounded leading-relaxed transition-colors ${
                                        isSelectedLine
                                          ? 'bg-blue-500/20 ring-1 ring-blue-500/50'
                                          : isErrorEntry
                                          ? 'bg-red-500/10'
                                          : 'hover:bg-neutral-500/10'
                                      }`}
                                    >
                                      <button
                                        type="button"
                                        title={`Line ${entry.lineNumber} — click to highlight and copy line reference for incident triage`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedTerminalLogLine((prev) =>
                                            prev?.instanceId === secondaryPaneInstance.id &&
                                            prev?.subTab === secondaryPaneInstance.activeSubTab &&
                                            prev?.lineNumber === entry.lineNumber
                                              ? null
                                              : {
                                                  instanceId: secondaryPaneInstance.id,
                                                  subTab: secondaryPaneInstance.activeSubTab,
                                                  lineNumber: entry.lineNumber,
                                                }
                                          );
                                          navigator.clipboard
                                            ?.writeText(
                                              `[${secondaryPaneInstance.name}:${secondaryPaneInstance.activeSubTab}#L${entry.lineNumber}] ${plainLine}`
                                            )
                                            .catch(() => {});
                                        }}
                                        className={`w-8 pr-1.5 text-right select-none tabular-nums shrink-0 border-r cursor-pointer font-mono text-[10px] leading-relaxed ${
                                          isSelectedLine
                                            ? 'text-blue-400 border-blue-500 font-bold'
                                            : isErrorEntry
                                            ? 'text-red-400 border-red-500/40 font-semibold'
                                            : terminalOutputTheme === 'dark'
                                            ? 'text-neutral-500 border-neutral-800 hover:text-neutral-300'
                                            : 'text-neutral-400 border-neutral-200 hover:text-neutral-700'
                                        }`}
                                      >
                                        {entry.lineNumber}
                                      </button>
                                      <div className="min-w-0 flex-1 break-all">
                                        {renderAnsiFormattedLog(
                                          entry.text,
                                          ansiColorScheme,
                                          rawFilter,
                                          terminalOutputTheme
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </>
                            );
                          })()}
                        </div>
                      );

                      const renderHorizontalSecondaryHeader = () => (
                        <div className="flex items-center justify-between pb-1.5">
                          <div className="flex items-center gap-1.5">
                            {/* Dropdown 1: Split Terminal Instance Holder */}
                            <div className="relative">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleFocusTerminalInstance(secondaryPaneInstance.id, false);
                                  setShowSecondaryInstanceDropdown((prev) => !prev);
                                  setShowSecondarySubTabDropdown(false);
                                  setShowPrimaryInstanceDropdown(false);
                                  setShowSubTabDropdown(false);
                                }}
                                className="px-2.5 py-0.5 rounded text-[11px] font-mono flex items-center gap-1.5 border bg-neutral-900 text-white dark:bg-white dark:text-black border-neutral-900 dark:border-white font-semibold cursor-pointer"
                              >
                                <span>{secondaryPaneInstance.name}</span>
                                <ChevronDown className="w-3 h-3" />
                              </button>
                              {showSecondaryInstanceDropdown && (
                                <div className="absolute left-0 mt-1 w-28 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black shadow-xl z-40 py-1">
                                  {terminalInstances.map((inst) => {
                                    const isSecSelected =
                                      inst.id === secondaryPaneInstance.id;
                                    return (
                                      <button
                                        key={inst.id}
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (inst.id === primaryPaneInstance.id) {
                                            setPrimarySplitInstanceId(
                                              secondaryPaneInstance.id
                                            );
                                          }
                                          setSecondarySplitInstanceId(inst.id);
                                          setActiveTerminalInstanceId(inst.id);
                                          setShowSecondaryInstanceDropdown(false);
                                          setTimeout(
                                            () => terminalInputRef.current?.focus(),
                                            20
                                          );
                                        }}
                                        className={`w-full px-2.5 py-1 text-left text-[11px] font-mono block cursor-pointer ${
                                          isSecSelected
                                            ? 'bg-neutral-900 text-white dark:bg-white dark:text-black font-semibold'
                                            : 'text-black dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-900'
                                        }`}
                                      >
                                        {inst.name}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            {/* Dropdown 2: Split Build / Logs Holder */}
                            <div className="relative">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleFocusTerminalInstance(secondaryPaneInstance.id, false);
                                  setShowSecondarySubTabDropdown((prev) => !prev);
                                  setShowSecondaryInstanceDropdown(false);
                                  setShowPrimaryInstanceDropdown(false);
                                  setShowSubTabDropdown(false);
                                }}
                                className="px-2.5 py-0.5 rounded text-[11px] font-mono flex items-center gap-1.5 border bg-neutral-900 text-white dark:bg-white dark:text-black border-neutral-900 dark:border-white font-semibold cursor-pointer"
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    secondaryPaneSession.isRunning
                                      ? 'bg-amber-400 animate-pulse'
                                      : 'bg-emerald-500'
                                  }`}
                                />
                                <span>{secondaryPaneSession.label}</span>
                                <ChevronDown className="w-3 h-3" />
                              </button>
                              {showSecondarySubTabDropdown && (
                                <div className="absolute left-0 mt-1 w-28 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black shadow-xl z-40 py-1">
                                  {(['build', 'logs'] as const).map((subKey) => (
                                    <button
                                      key={subKey}
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setTerminalInstances((prev) =>
                                          prev.map((inst) =>
                                            inst.id === secondaryPaneInstance.id
                                              ? { ...inst, activeSubTab: subKey }
                                              : inst
                                          )
                                        );
                                        handleFocusTerminalInstance(
                                          secondaryPaneInstance.id,
                                          true
                                        );
                                        setShowSecondarySubTabDropdown(false);
                                      }}
                                      className={`w-full px-2.5 py-1 text-left text-[11px] font-mono block cursor-pointer ${
                                        secondaryPaneInstance.activeSubTab === subKey
                                          ? 'bg-neutral-900 text-white dark:bg-white dark:text-black font-semibold'
                                          : 'text-black dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-900'
                                      }`}
                                    >
                                      {secondaryPaneInstance.subTabs[subKey].label}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );

                      if (effectiveSplitDirection === 'vertical') {
                        return (
                          <div
                            ref={splitContainerRef}
                            className="relative flex items-stretch min-h-[130px] select-none"
                            style={{ userSelect: isDraggingSplitter ? 'none' : 'auto' }}
                          >
                            <div
                              style={{ width: `calc(${verticalSplitRatio}% - 4px)` }}
                              className="min-w-[120px] shrink-0"
                            >
                              {renderPrimaryPaneLog()}
                            </div>

                            {/* Draggable Vertical Splitter Handle */}
                            <div
                              role="separator"
                              aria-orientation="vertical"
                              title="Drag horizontally to resize terminal panes (Double-click to reset 50/50)"
                              onMouseDown={(e) => handleSplitterMouseDown('vertical', e)}
                              onDoubleClick={() => setVerticalSplitRatio(50)}
                              className={`w-2 mx-0.5 shrink-0 flex items-center justify-center cursor-col-resize rounded transition-colors group select-none ${
                                isDraggingSplitter === 'vertical'
                                  ? 'bg-blue-600'
                                  : 'hover:bg-blue-500/40 bg-neutral-200 dark:bg-neutral-800'
                              }`}
                            >
                              <div className="w-0.5 h-6 rounded bg-neutral-400 dark:bg-neutral-600 group-hover:bg-white" />
                            </div>

                            <div
                              style={{ width: `calc(${100 - verticalSplitRatio}% - 4px)` }}
                              className="min-w-[120px] shrink-0"
                            >
                              {renderSecondaryPaneLog()}
                            </div>
                          </div>
                        );
                      }

                      if (effectiveSplitDirection === 'horizontal') {
                        return (
                          <div
                            ref={splitContainerRef}
                            className="relative flex flex-col items-stretch space-y-1 select-none"
                            style={{ userSelect: isDraggingSplitter ? 'none' : 'auto' }}
                          >
                            <div
                              style={{ height: `${horizontalSplitHeight}px` }}
                              className="min-h-[60px] overflow-hidden"
                            >
                              {renderPrimaryPaneLog({ height: '100%' })}
                            </div>

                            {/* Draggable Horizontal Splitter Handle */}
                            <div
                              role="separator"
                              aria-orientation="horizontal"
                              title="Drag vertically to resize terminal panes (Double-click to reset default height)"
                              onMouseDown={(e) => handleSplitterMouseDown('horizontal', e)}
                              onDoubleClick={() => setHorizontalSplitHeight(140)}
                              className={`h-2 my-0.5 shrink-0 flex items-center justify-center cursor-row-resize rounded transition-colors group select-none ${
                                isDraggingSplitter === 'horizontal'
                                  ? 'bg-blue-600'
                                  : 'hover:bg-blue-500/40 bg-neutral-200 dark:bg-neutral-800'
                              }`}
                            >
                              <div className="h-0.5 w-10 rounded bg-neutral-400 dark:bg-neutral-600 group-hover:bg-white" />
                            </div>

                            <div className="min-h-[60px] flex-1">
                              {renderHorizontalSecondaryHeader()}
                              {renderSecondaryPaneLog()}
                            </div>
                          </div>
                        );
                      }

                      if (effectiveSplitDirection === 'grid') {
                        return (
                          <div className="grid grid-cols-2 gap-2">
                            <div>{renderPrimaryPaneLog()}</div>
                            <div>
                              {renderHorizontalSecondaryHeader()}
                              {renderSecondaryPaneLog()}
                            </div>
                          </div>
                        );
                      }

                      return <div className="block">{renderPrimaryPaneLog()}</div>;
                    })()}

                    {/* Side Session Summary Drawer: Displays active session engines, cwd, tasks, system resource meters & theme switcher */}
                    {showSessionSummaryDrawer && (
                      <div className="p-3 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black space-y-3 text-xs font-mono text-black dark:text-white">
                        <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-2">
                          <div className="flex items-center gap-2">
                            <Layers className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                            <span className="font-semibold">
                              Terminal Session Engines &amp; System Monitor
                            </span>
                            <span className="text-[10px] text-neutral-500">
                              ({terminalInstances.length} open session{terminalInstances.length === 1 ? '' : 's'})
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowSessionSummaryDrawer(false)}
                            className="p-1 rounded text-neutral-500 hover:text-black dark:hover:text-white cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Sessions Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {terminalInstances.map((inst, idx) => {
                            const isCurrent = inst.id === activeTerminalInstance.id;
                            const subBuild = inst.subTabs.build;
                            const buildSummary = deriveBuildSubTabSummary(subBuild);
                            const tasks = inst.tasks || [];

                            return (
                              <div
                                key={inst.id}
                                onClick={() => handleFocusTerminalInstance(inst.id, true)}
                                className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                                  isCurrent
                                    ? 'border-blue-600 bg-blue-50/20 dark:bg-blue-950/20 ring-1 ring-blue-500/30'
                                    : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1 mb-1.5">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="text-[10px] px-1 py-0.2 rounded bg-neutral-200 dark:bg-neutral-800 font-bold shrink-0">
                                      #{idx + 1}
                                    </span>
                                    <span className="font-bold truncate">
                                      {inst.name}
                                    </span>
                                    <span
                                      className={`w-2 h-2 rounded-full shrink-0 ${
                                        buildSummary.status === 'Failing'
                                          ? 'bg-red-500'
                                          : buildSummary.status === 'Running'
                                          ? 'bg-amber-400 animate-pulse'
                                          : 'bg-emerald-500'
                                      }`}
                                    />
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      title="Rename session"
                                      onClick={(e) => handleOpenTerminalTabContextMenu(inst, e)}
                                      className="p-0.5 hover:text-blue-500 cursor-pointer text-neutral-500"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                    </button>
                                    {inst.isDeletable && (
                                      <button
                                        type="button"
                                        title="Close session"
                                        onClick={(e) => handleDeleteTerminalInstance(inst.id, e)}
                                        className="p-0.5 hover:text-red-500 cursor-pointer text-neutral-500"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                </div>

                                <div className="space-y-1 text-[11px] text-neutral-600 dark:text-neutral-400">
                                  <div className="flex items-center justify-between">
                                    <span>Working Dir:</span>
                                    <span className="font-mono text-black dark:text-white truncate max-w-[130px]">
                                      {inst.cwd || '~/acme-cloud/edge-router'}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span>Active SubTab:</span>
                                    <span className="font-semibold text-black dark:text-white">
                                      {inst.subTabs[inst.activeSubTab].label}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span>Build State:</span>
                                    <span
                                      className={`font-semibold ${
                                        buildSummary.status === 'Passing'
                                          ? 'text-emerald-600 dark:text-emerald-400'
                                          : buildSummary.status === 'Failing'
                                          ? 'text-red-600 dark:text-red-400'
                                          : 'text-neutral-500'
                                      }`}
                                    >
                                      {buildSummary.label}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span>Tasks / PID:</span>
                                    <span className="text-black dark:text-white">
                                      {tasks.length > 0 ? `${tasks.length} active` : 'daemon (PID 4120)'}
                                    </span>
                                  </div>
                                </div>

                                <div className="mt-2 pt-2 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleFocusTerminalInstance(inst.id, true);
                                    }}
                                    className={`px-2 py-0.5 rounded text-[10px] cursor-pointer ${
                                      isCurrent
                                        ? 'bg-blue-600 text-white font-semibold'
                                        : 'bg-neutral-100 dark:bg-neutral-900 text-black dark:text-white hover:bg-neutral-200'
                                    }`}
                                  >
                                    {isCurrent ? 'Focused' : 'Focus'}
                                  </button>
                                  {hasMultipleTerminals && (
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        title="Set as Secondary (Split V)"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSecondarySplitInstanceId(inst.id);
                                          setTerminalSplitDirection('vertical');
                                        }}
                                        className="px-1.5 py-0.5 rounded text-[10px] border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900 cursor-pointer"
                                      >
                                        Split V
                                      </button>
                                      <button
                                        type="button"
                                        title="Set as Secondary (Split H)"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSecondarySplitInstanceId(inst.id);
                                          setTerminalSplitDirection('horizontal');
                                        }}
                                        className="px-1.5 py-0.5 rounded text-[10px] border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900 cursor-pointer"
                                      >
                                        Split H
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Metrics & Theme Quick Switcher Row */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-neutral-200 dark:border-neutral-800">
                          <div className="p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 space-y-2">
                            <div className="flex items-center justify-between text-[11px] font-semibold">
                              <span className="flex items-center gap-1">
                                <Cpu className="w-3 h-3 text-blue-500" /> System Resource Gauges
                              </span>
                              <span className="text-[10px] text-neutral-500">Live Telemetry</span>
                            </div>
                            <div className="space-y-1.5">
                              <div>
                                <div className="flex justify-between text-[10px] text-neutral-600 dark:text-neutral-400 mb-0.5">
                                  <span>CPU Utilization</span>
                                  <span className="font-mono text-black dark:text-white font-semibold">
                                    {codespaceResourceMetrics.cpuPercent}%
                                  </span>
                                </div>
                                <div className="w-full h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
                                  <div
                                    className="h-full bg-blue-600 rounded-full transition-all duration-500"
                                    style={{ width: `${Math.min(100, codespaceResourceMetrics.cpuPercent)}%` }}
                                  />
                                </div>
                              </div>
                              <div>
                                <div className="flex justify-between text-[10px] text-neutral-600 dark:text-neutral-400 mb-0.5">
                                  <span>Memory Allocated</span>
                                  <span className="font-mono text-black dark:text-white font-semibold">
                                    {codespaceResourceMetrics.memoryMb} MB / 2048 MB
                                  </span>
                                </div>
                                <div className="w-full h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
                                  <div
                                    className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                                    style={{
                                      width: `${Math.min(100, (codespaceResourceMetrics.memoryMb / 2048) * 100)}%`,
                                    }}
                                  />
                                </div>
                              </div>
                              <div className="flex items-center justify-between text-[10px] pt-1 text-neutral-500">
                                <span>Network I/O:</span>
                                <span className="font-mono text-black dark:text-white font-semibold">
                                  ▲ {networkMetrics.upKb} KB/s · ▼ {networkMetrics.downKb} KB/s
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 space-y-2">
                            <div className="flex items-center justify-between text-[11px] font-semibold">
                              <span>Quick ANSI Theme Switcher</span>
                              <span className="text-[10px] text-neutral-500">Active: {ansiColorScheme}</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {(['cyber-dark', 'dracula', 'monokai', 'nord', 'vscode-dark'] as const).map(
                                (schemeId) => (
                                  <button
                                    key={schemeId}
                                    type="button"
                                    onClick={() => setAnsiColorScheme(schemeId)}
                                    className={`px-2 py-1 rounded text-[10px] font-mono border transition-colors cursor-pointer ${
                                      ansiColorScheme === schemeId
                                        ? 'bg-blue-600 text-white border-blue-600 font-semibold'
                                        : 'bg-white dark:bg-black text-black dark:text-white border-neutral-300 dark:border-neutral-700 hover:border-blue-400'
                                    }`}
                                  >
                                    {schemeId}
                                  </button>
                                )
                              )}
                            </div>
                            <div className="pt-1 text-[10px] text-neutral-500 flex flex-wrap gap-x-2 gap-y-0.5">
                              <span>Alt+T: New Tab</span>
                              <span>Alt+W: Close</span>
                              <span>Alt+1-9: Direct Tab</span>
                              <span>Alt+←/→: Cycle</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Lightweight Command Suggestion Engine from terminalCommandHistory */}
                    {commandSuggestions.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 px-2 py-1 rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black text-[11px] font-mono">
                        <span className="text-[10px] text-neutral-500 mr-1">
                          Suggestions (Tab):
                        </span>
                        {commandSuggestions.map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            onClick={() => {
                              setTerminalInput(suggestion);
                              setTerminalHistoryIndex(-1);
                              terminalInputRef.current?.focus();
                            }}
                            className="px-2 py-0.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black text-black dark:text-white hover:border-blue-500 cursor-pointer"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    )}

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (terminalInput.trim()) {
                          handleRunCodespaceCommand(
                            terminalInput,
                            activeTerminalInstance.id,
                            activeTerminalInstance.activeSubTab
                          );
                        }
                      }}
                      className="flex items-center gap-2 pt-0.5"
                    >
                      <span className="text-xs font-mono text-black dark:text-white">
                        {activeTerminalInstance.name}$
                      </span>
                      <input
                        ref={terminalInputRef}
                        type="text"
                        value={terminalInput}
                        onChange={(e) => {
                          setTerminalInput(e.target.value);
                          setTerminalHistoryIndex(-1);
                        }}
                        onKeyDown={handleTerminalInputKeyDown}
                        aria-label="Codespace terminal command input"
                        className="flex-1 bg-white dark:bg-black border border-neutral-300 dark:border-neutral-800 rounded px-2.5 py-1 text-xs font-mono text-black dark:text-white focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={isRunningTerminal}
                        className="px-2.5 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded cursor-pointer"
                      >
                        Exec
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </section>
          )}
        </main>
      )}

      {/* =====================================================================
          SIGN IN & SIGN UP MODAL:
          - Direct Email & Password Sign-In
          - Sign Up with Email/Password + Activation Code / SMS Text Verification
          - Auto Sign-In with GitHub & Google
      ===================================================================== */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="w-full max-w-sm rounded-xl border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white p-4 space-y-3.5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-2.5">
              <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-900 p-0.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setAuthModalMode('signin');
                    setAuthError('');
                    setDispatchedNotice('');
                  }}
                  className={`px-3 py-1 rounded-md font-semibold cursor-pointer ${
                    authModalMode === 'signin'
                      ? 'bg-blue-600 text-white'
                      : 'text-black dark:text-white'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthModalMode('signup');
                    setSignUpStep('credentials');
                    setAuthError('');
                    setDispatchedNotice('');
                  }}
                  className={`px-3 py-1 rounded-md font-semibold cursor-pointer ${
                    authModalMode === 'signup'
                      ? 'bg-blue-600 text-white'
                      : 'text-black dark:text-white'
                  }`}
                >
                  Sign Up
                </button>
              </div>

              <button
                onClick={() => setShowAuthModal(false)}
                className="p-1 rounded-lg text-neutral-500 hover:text-black dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {authModalMode === 'signin' ? (
              /* SIGN IN MODE: Direct Email & Password + GitHub & Google Auto Sign-In */
              <form onSubmit={handleEmailPasswordSignIn} className="space-y-2.5 text-xs">
                <div className="space-y-1">
                  <label className="font-medium text-black dark:text-white block">Email</label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      required
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="developer@domain.com"
                      className="w-full pl-8 pr-2.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-medium text-black dark:text-white block">Password</label>
                  <div className="relative">
                    <KeyRound className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="password"
                      required
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-8 pr-2.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingAuth}
                  className="w-full py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold cursor-pointer"
                >
                  {isSubmittingAuth ? 'Signing In...' : 'Sign In'}
                </button>

                <div className="text-center pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthModalMode('signup');
                      setSignUpStep('credentials');
                      setAuthError('');
                    }}
                    className="text-blue-600 dark:text-blue-400 hover:underline font-medium cursor-pointer"
                  >
                    New account? Sign up
                  </button>
                </div>
              </form>
            ) : signUpStep === 'credentials' ? (
              /* SIGN UP STEP 1: Email, Password & Delivery Channel (Email Code or SMS Text) */
              <form onSubmit={handleRequestSignUpActivationCode} className="space-y-2.5 text-xs">
                <div className="space-y-1">
                  <label className="font-medium text-black dark:text-white block">Email</label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      required
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="developer@domain.com"
                      className="w-full pl-8 pr-2.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-medium text-black dark:text-white block">
                    Create Password
                  </label>
                  <div className="relative">
                    <KeyRound className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="password"
                      required
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="Min 6 characters"
                      className="w-full pl-8 pr-2.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-medium text-black dark:text-white block">
                    Send Activation Via
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setAuthDeliveryChannel('email')}
                      className={`py-1.5 px-2 rounded-lg border font-medium flex items-center justify-center gap-1.5 cursor-pointer ${
                        authDeliveryChannel === 'email'
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white'
                      }`}
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>Email Code</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthDeliveryChannel('sms')}
                      className={`py-1.5 px-2 rounded-lg border font-medium flex items-center justify-center gap-1.5 cursor-pointer ${
                        authDeliveryChannel === 'sms'
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white'
                      }`}
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>SMS Text</span>
                    </button>
                  </div>
                </div>

                {authDeliveryChannel === 'sms' && (
                  <div className="space-y-1">
                    <label className="font-medium text-black dark:text-white block">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      required
                      value={authPhone}
                      onChange={(e) => setAuthPhone(e.target.value)}
                      placeholder="+1 555 019 2834"
                      className="w-full px-2.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmittingAuth}
                  className="w-full py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold cursor-pointer"
                >
                  {isSubmittingAuth ? 'Sending Code...' : 'Send Activation Code'}
                </button>
              </form>
            ) : (
              /* SIGN UP STEP 2: Verify 6-Digit Activation Code to Activate Sign-In Request */
              <form onSubmit={handleVerifySignUpActivationCode} className="space-y-2.5 text-xs">
                {dispatchedNotice && (
                  <div className="p-2.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-black dark:text-white font-mono text-[11px]">
                    {dispatchedNotice}
                  </div>
                )}

                <div className="space-y-1">
                  <label className="font-medium text-black dark:text-white block">
                    Enter 6-Digit Activation Code
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={activationCodeInput}
                    onChange={(e) => setActivationCodeInput(e.target.value)}
                    placeholder="123456"
                    className="w-full px-3 py-2 text-center tracking-widest text-sm font-mono font-bold rounded-lg border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingAuth}
                  className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isSubmittingAuth ? 'Activating...' : 'Activate & Sign In'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSignUpStep('credentials')}
                  className="w-full py-1 text-center text-neutral-500 hover:text-black dark:hover:text-white cursor-pointer"
                >
                  ← Back to Email & Password Settings
                </button>
              </form>
            )}

            {authError && (
              <div className="p-2.5 rounded-lg border border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-300 text-xs">
                {authError}
              </div>
            )}

            {/* Dedicated GitHub OAuth Sign-In Button (using githubProvider) & Google OAuth */}
            <div className="pt-2.5 border-t border-neutral-200 dark:border-neutral-800 space-y-2 text-xs">
              <div className="text-[11px] font-medium text-center text-black/60 dark:text-white/60">
                Or Continue With OAuth
              </div>
              <button
                type="button"
                disabled={isSubmittingAuth}
                onClick={handleGitHubOAuthSignIn}
                className="w-full py-2.5 px-3 rounded-lg border border-neutral-800 dark:border-neutral-300 bg-neutral-900 dark:bg-white hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 text-white dark:text-black font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="w-4 h-4 fill-current shrink-0"
                >
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  />
                </svg>
                <span>Sign in with GitHub</span>
              </button>

              <button
                type="button"
                disabled={isSubmittingAuth}
                onClick={handleGoogleOAuthSignIn}
                className="w-full py-2.5 px-3 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50 text-neutral-900 dark:text-white font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-xs"
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="w-4 h-4 shrink-0"
                >
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Sign in with Google</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          COMPACT REPORT BUG MODAL (Minimal spacing for Mobile & Desktop)
      ===================================================================== */}
      {showBugModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="w-full max-w-md rounded-xl border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-2">
              <h3 className="text-sm font-bold text-black dark:text-white">
                Report /bug
              </h3>
              <button
                onClick={() => setShowBugModal(false)}
                className="p-1 rounded-lg text-neutral-500 hover:text-black dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleDispatchBugModal} className="space-y-2.5 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-1">
                  <label className="font-medium text-black dark:text-white">
                    Repository
                  </label>
                  <input
                    type="text"
                    list="tracked-repos-list"
                    value={bugRepo}
                    onChange={(e) => setBugRepo(e.target.value)}
                    placeholder="owner/repo"
                    className="w-full rounded-lg border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black px-2.5 py-1.5 text-black dark:text-white font-mono"
                  />
                  <datalist id="tracked-repos-list">
                    {Object.keys(repositories).map((r) => (
                      <option key={r} value={r} />
                    ))}
                  </datalist>
                </div>

                <div className="space-y-1">
                  <label className="font-medium text-black dark:text-white">
                    Line
                  </label>
                  <input
                    type="number"
                    value={bugLine}
                    onChange={(e) => setBugLine(Number(e.target.value))}
                    className="w-full rounded-lg border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black px-2.5 py-1.5 text-black dark:text-white font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-medium text-black dark:text-white">
                  File Path
                </label>
                <input
                  type="text"
                  value={bugFile}
                  onChange={(e) => setBugFile(e.target.value)}
                  placeholder="src/index.ts"
                  className="w-full rounded-lg border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black px-2.5 py-1.5 text-black dark:text-white font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-medium text-black dark:text-white">
                  Summary
                </label>
                <input
                  type="text"
                  value={bugSummary}
                  onChange={(e) => setBugSummary(e.target.value)}
                  placeholder="Describe the issue..."
                  className="w-full rounded-lg border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black px-2.5 py-1.5 text-black dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="font-medium text-black dark:text-white">
                  Stack Trace
                </label>
                <textarea
                  rows={2}
                  value={bugStackTrace}
                  onChange={(e) => setBugStackTrace(e.target.value)}
                  placeholder="Optional stack trace..."
                  className="w-full rounded-lg border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black p-2 text-black dark:text-white font-mono text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setShowBugModal(false)}
                  className="px-3 py-1.5 rounded-lg text-black dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold cursor-pointer"
                >
                  {isOffline ? 'Queue /bug' : 'Dispatch /bug'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          CI/CD BUILD STATUS 'FAILING' TOAST OVERLAY
      ===================================================================== */}
      {ciFailureToasts.length > 0 && (
        <div
          role="region"
          aria-label="CI/CD Build Failure Notifications"
          className="fixed bottom-3 right-3 z-50 w-full max-w-xs space-y-2 px-3 sm:px-0"
        >
          {ciFailureToasts.map((toast) => (
            <div
              key={toast.id}
              className="rounded-xl border border-red-500 bg-white dark:bg-black text-black dark:text-white p-3 shadow-xl space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-red-600 dark:text-red-400">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>CI Failing · {toast.repo}</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setCiFailureToasts((prev) => prev.filter((t) => t.id !== toast.id))
                  }
                  className="p-0.5 rounded text-neutral-500 hover:text-black dark:hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <p className="text-[11px] text-black dark:text-white leading-snug">
                {toast.reason}
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (repositories[toast.repo]) {
                      const firstFile = Object.keys(repositories[toast.repo].files)[0];
                      handleNavigateDeepLink(toast.repo, firstFile, 1, true);
                    }
                    setActiveTab('workspace');
                    setCiFailureToasts((prev) => prev.filter((t) => t.id !== toast.id));
                  }}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-red-600 hover:bg-red-500 text-white cursor-pointer"
                >
                  Inspect
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('integration');
                    setCiFailureToasts((prev) => prev.filter((t) => t.id !== toast.id));
                  }}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white cursor-pointer"
                >
                  CI Feed
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
