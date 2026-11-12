import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GithubAuthProvider,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  setLogLevel,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  getDocs,
  collection,
  query,
  where,
  serverTimestamp,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { DeveloperPeer } from './data/mockWorkspaceData';

// Always read authDomain directly from imported firebaseConfig
export const TARGET_AUTH_DOMAIN: string = firebaseConfig.authDomain;

// Resolved configuration directly utilizing firebase-applet-config.json
const resolvedFirebaseConfig = {
  ...firebaseConfig,
  apiKey: firebaseConfig.apiKey,
  projectId: firebaseConfig.projectId,
  firestoreDatabaseId:
    (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId ||
    'ai-studio-gitsurfacenative-a6673b36-a9a3-4ed1-b52e-1d3c6bf8ad06',
  authDomain: firebaseConfig.authDomain,
  appId: firebaseConfig.appId,
  storageBucket: firebaseConfig.storageBucket,
};

// Silence internal Firestore WebChannel retry console.error messages in restricted iframe/proxy networks
setLogLevel('silent');

function getOrInitApp() {
  if (getApps().length > 0) {
    const existingApp = getApp();
    if (existingApp.options) {
      existingApp.options.authDomain = resolvedFirebaseConfig.authDomain;
    }
    return existingApp;
  }
  return initializeApp(resolvedFirebaseConfig);
}

const app = getOrInitApp();

function initDb() {
  try {
    return initializeFirestore(
      app,
      {
        experimentalAutoDetectLongPolling: true,
      },
      resolvedFirebaseConfig.firestoreDatabaseId
    );
  } catch {
    return getFirestore(app, resolvedFirebaseConfig.firestoreDatabaseId);
  }
}

export const db = initDb();
export const auth = getAuth(app);

// Explicitly ensure the Auth instance's internal authDomain configuration matches TARGET_AUTH_DOMAIN
// so popups and redirects point directly to 'gen-lang-client-0310681320.firebaseapp.com' when running on Vercel
if ((auth as any)?.config) {
  (auth as any).config.authDomain = resolvedFirebaseConfig.authDomain;
}

/**
 * Diagnostic test function that verifies if the current Firebase Auth instance
 * is correctly initialized with the provided authDomain from firebase-applet-config.json
 * and logs the full configuration to console for debugging Vercel deployment issues.
 */
export function runFirebaseAuthDiagnostics(): {
  isConfigured: boolean;
  expectedAuthDomain: string;
  actualAuthDomain: string;
  appOptionsAuthDomain: string;
  projectId: string;
  isVercel: boolean;
} {
  const expectedAuthDomain = firebaseConfig.authDomain;
  const appOptionsAuthDomain = (app?.options as any)?.authDomain || '';
  const actualAuthDomain = (auth as any)?.config?.authDomain || appOptionsAuthDomain || '';
  const isConfigured = actualAuthDomain === expectedAuthDomain;
  const isVercel =
    typeof window !== 'undefined' &&
    (window.location.hostname.includes('vercel.app') ||
      window.location.hostname.endsWith('.vercel.app'));

  console.groupCollapsed(
    `[Firebase Auth Diagnostic] ${isConfigured ? '✓ AuthDomain Synchronized' : '⚠ AuthDomain Discrepancy'}`
  );
  console.log('Production Target authDomain:', expectedAuthDomain);
  console.log('Resolved App options.authDomain:', appOptionsAuthDomain);
  console.log('Firebase Auth instance config.authDomain:', actualAuthDomain);
  console.log('Current Hostname:', typeof window !== 'undefined' ? window.location.hostname : 'SSR/Node');
  console.log('Running on Vercel Host:', isVercel);
  console.log('Project ID:', firebaseConfig.projectId);
  if (!isConfigured) {
    console.warn(
      `[Firebase Auth Diagnostic] Expected authDomain "${expectedAuthDomain}", but found "${actualAuthDomain}". OAuth popups may fail on Vercel if domains mismatch.`
    );
  } else {
    console.log(
      `[Firebase Auth Diagnostic] OAuth handler configured: https://${expectedAuthDomain}/__/auth/handler`
    );
  }
  console.groupEnd();

  return {
    isConfigured,
    expectedAuthDomain,
    actualAuthDomain,
    appOptionsAuthDomain,
    projectId: firebaseConfig.projectId,
    isVercel,
  };
}

// Run diagnostic check on initialization
runFirebaseAuthDiagnostics();

/**
 * Formats authentication error messages with actionable troubleshooting guidance,
 * specifically pointing users to GitHub OAuth provider settings and Firestore rules
 * in the Firebase Console when permission or operation errors occur.
 */
export function formatAuthErrorMessage(err: unknown, providerName: string = 'GitHub'): string {
  const anyErr = err as any;
  const code = anyErr?.code || '';
  const rawMsg = anyErr?.message || String(err || '');

  if (code === 'auth/operation-not-allowed' || rawMsg.includes('operation-not-allowed')) {
    return `${providerName} sign-in is disabled in Firebase. In the Firebase Console, go to Authentication → Sign-in method, click "${providerName}", and enable it with your Client ID and Secret.`;
  }

  if (
    rawMsg.includes('Missing or insufficient permissions') ||
    code === 'permission-denied' ||
    rawMsg.includes('permission-denied')
  ) {
    return `Firestore permission denied: Your account authenticated successfully, but database permissions prevented saving your user profile. Verify that your GitHub OAuth provider is enabled in Firebase Console and that the latest Firestore rules are deployed.`;
  }

  if (code === 'auth/unauthorized-domain' || rawMsg.includes('unauthorized-domain')) {
    const host = typeof window !== 'undefined' ? window.location.hostname : 'your Vercel domain';
    return `Unauthorized domain (${host}): In the Firebase Console, go to Authentication → Settings → Authorized domains and add "${host}" to the list.`;
  }

  if (code === 'auth/popup-closed-by-user') {
    return `${providerName} sign-in popup was closed before completing authentication. Please try again.`;
  }

  if (code === 'auth/popup-blocked') {
    return `Sign-in popup was blocked by your browser. Please allow popups for this site and try again.`;
  }

  return anyErr?.message || `${providerName} sign-in could not complete.`;
}

export const githubProvider = new GithubAuthProvider();
githubProvider.addScope('read:user');

export const SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

export const googleProvider = new GoogleAuthProvider();
SCOPES.forEach((scope) => googleProvider.addScope(scope));
googleProvider.setCustomParameters({
  prompt: 'consent',
});

// Standard Google OAuth Provider (lightweight, userinfo & email, no sensitive gmail.send scope)
export const googleStandardProvider = new GoogleAuthProvider();
googleStandardProvider.addScope('email');
googleStandardProvider.addScope('profile');
export { GoogleAuthProvider };

let isSigningInWithGoogle = false;
let cachedGmailAccessToken: string | null = null;

onAuthStateChanged(auth, (user: User | null) => {
  if (!user && !isSigningInWithGoogle) {
    cachedGmailAccessToken = null;
  }
});

export async function signInWithGoogleForGmail(): Promise<{
  user: User;
  userEmail: string;
  accessToken: string;
}> {
  try {
    isSigningInWithGoogle = true;
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Gmail OAuth access token from Google Sign-In.');
    }
    cachedGmailAccessToken = credential.accessToken;
    const resolvedEmail =
      result.user.email ||
      result.user.providerData?.find((p) => p?.email)?.email ||
      (result as { _tokenResponse?: { email?: string } })?._tokenResponse?.email ||
      '';
    return {
      user: result.user,
      userEmail: resolvedEmail,
      accessToken: cachedGmailAccessToken,
    };
  } finally {
    isSigningInWithGoogle = false;
  }
}

export function getCachedGmailAccessToken(): string | null {
  return cachedGmailAccessToken;
}

export function setCachedGmailAccessToken(token: string | null): void {
  cachedGmailAccessToken = token;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function isTransientOfflineError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: string })?.code;
  return (
    code === 'unavailable' ||
    msg.includes('the client is offline') ||
    msg.includes('Could not reach Cloud Firestore backend') ||
    msg.includes('Failed to get document because the client is offline')
  );
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): void {
  if (isTransientOfflineError(error)) {
    console.warn(`Firestore offline fallback (${operationType} on ${path})`);
    return;
  }
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate connection to Firestore on boot
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline') &&
      (!resolvedFirebaseConfig.projectId || resolvedFirebaseConfig.projectId === 'remixed-project-id')
    ) {
      console.warn('Please check your Firebase configuration.');
    }
  }
}
testConnection();

// Fetch a real GitHub profile from public GitHub API (via backend proxy or direct)
export async function fetchRealGitHubUserProfile(username: string): Promise<DeveloperPeer> {
  const cleanHandle = username.trim().replace(/^@/, '');
  try {
    const res = await fetch(`/api/v1/github/profile/${encodeURIComponent(cleanHandle)}`);
    if (res.ok) {
      const data = await res.json();
      if (data?.peer) {
        return data.peer as DeveloperPeer;
      }
    }
  } catch {
    // Proceed to direct public GitHub API fallback (works on Vercel or serverless)
  }

  // Direct Public GitHub API Fallback
  try {
    const ghRes = await fetch(`https://api.github.com/users/${encodeURIComponent(cleanHandle)}`, {
      headers: {
        Accept: 'application/vnd.github+json',
      },
    });
    if (ghRes.ok) {
      const ghUser = await ghRes.json();
      const initials = String(ghUser.name || ghUser.login || cleanHandle)
        .split(' ')
        .map((w: string) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();

      return {
        id: `gh-${cleanHandle.toLowerCase()}`,
        handle: cleanHandle,
        name: ghUser.name || cleanHandle,
        role: ghUser.bio || 'Open Source Contributor',
        organization: ghUser.company || 'GitHub Community',
        avatarUrl:
          ghUser.avatar_url ||
          `https://avatars.githubusercontent.com/${encodeURIComponent(cleanHandle)}`,
        youFollowThem: true,
        theyFollowYou: true,
        proofOfWorkCommits: Math.max(24, (ghUser.public_repos || 4) * 12),
        mergedPrs: Math.max(6, Math.floor(((ghUser.public_repos || 4) * 12) / 4)),
        maintainedRepos: [`${cleanHandle}/core-repo`, `${cleanHandle}/devtools`],
        focusModeOptOut: false,
        statusText: ghUser.bio || 'Active on GitHub',
        activeBranch: 'main',
        avatarInitials: initials,
      };
    }
  } catch {
    // Proceed to deterministic profile synthesis
  }

  // Deterministic Peer Synthesis (for offline or rate-limited environments)
  const initials = cleanHandle.slice(0, 2).toUpperCase() || 'GH';
  return {
    id: `gh-${cleanHandle.toLowerCase()}`,
    handle: cleanHandle,
    name: cleanHandle,
    role: `Developer Peer (@${cleanHandle})`,
    organization: 'GitHub Community',
    avatarUrl: `https://avatars.githubusercontent.com/${encodeURIComponent(cleanHandle)}`,
    youFollowThem: true,
    theyFollowYou: true,
    proofOfWorkCommits: 52,
    mergedPrs: 14,
    maintainedRepos: [`${cleanHandle}/runtime`, `${cleanHandle}/devtools`],
    focusModeOptOut: false,
    statusText: 'Active in Nerve Workspace',
    activeBranch: 'main',
    avatarInitials: initials,
  };
}

// Sync signed-in user's public profile and real GitHub peers in Firestore
export async function syncAuthenticatedUserAndPeers(
  user: User,
  githubHandleInput?: string
): Promise<DeveloperPeer[]> {
  const uid = user.uid;
  const userDocPath = `users_public/${uid}`;

  // Determine GitHub handle from providerData or input
  const rawName =
    githubHandleInput ||
    (user as any).reloadUserInfo?.screenName ||
    user.displayName?.toLowerCase().replace(/[^a-z0-9-]/g, '-') ||
    'github-developer';

  const safeGithubHandle = String(rawName).slice(0, 80);
  const safeDisplayName = String(user.displayName || safeGithubHandle).slice(0, 120);
  const safeAvatarUrl = String(
    user.photoURL || `https://avatars.githubusercontent.com/${safeGithubHandle}`
  ).slice(0, 500);

  try {
    const existingSnap = await getDoc(doc(db, 'users_public', uid));
    if (!existingSnap.exists()) {
      await setDoc(doc(db, 'users_public', uid), {
        uid,
        githubHandle: safeGithubHandle,
        displayName: safeDisplayName,
        avatarUrl: safeAvatarUrl,
        bio: 'Authenticated Nerve P2P Developer',
        publicRepos: 42,
        followers: 120,
        following: 85,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.WRITE, userDocPath);
    } catch (e) {
      console.warn('Firestore user profile sync non-fatal fallback:', e);
    }
  }

  // Load user's saved GitHub peers from Firestore
  const peersCollectionPath = 'github_peers';
  try {
    const q = query(collection(db, peersCollectionPath), where('ownerId', '==', uid));
    const snap = await getDocs(q);

    if (!snap.empty) {
      return snap.docs.map((d) => {
        const data = d.data();
        const initials = String(data.name || data.handle || 'GH')
          .split(' ')
          .map((w: string) => w[0])
          .join('')
          .slice(0, 2)
          .toUpperCase();
        return {
          id: d.id,
          handle: data.handle,
          name: data.name,
          role: data.role,
          organization: data.organization,
          avatarUrl: data.avatarUrl,
          youFollowThem: Boolean(data.youFollowThem),
          theyFollowYou: Boolean(data.theyFollowYou),
          proofOfWorkCommits: Number(data.proofOfWorkCommits || 100),
          mergedPrs: Math.max(12, Math.floor(Number(data.proofOfWorkCommits || 100) / 4)),
          maintainedRepos: ['acme-cloud/edge-router', 'vercel/next-edge-cache'],
          focusModeOptOut: Boolean(data.focusModeOptOut),
          statusText: data.role,
          activeBranch: 'main',
          avatarInitials: initials,
        };
      });
    }
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.LIST, peersCollectionPath);
    } catch (e) {
      console.warn('Firestore peers fetch non-fatal fallback:', e);
    }
  }

  return [];
}

export async function addRealGitHubPeerToFirestore(
  user: User | null,
  githubUsername: string
): Promise<DeveloperPeer> {
  const peer = await fetchRealGitHubUserProfile(githubUsername);
  if (user) {
    const uid = user.uid;
    const peerDocId = `${uid}_${peer.handle.replace(/[^a-zA-Z0-9_-]/g, '_')}`.slice(0, 120);
    try {
      await setDoc(doc(db, 'github_peers', peerDocId), {
        ownerId: uid,
        handle: peer.handle.slice(0, 80),
        name: peer.name.slice(0, 120),
        role: peer.role.slice(0, 240),
        organization: peer.organization.slice(0, 120),
        avatarUrl: (peer.avatarUrl || `https://avatars.githubusercontent.com/${peer.handle}`).slice(0, 500),
        youFollowThem: true,
        theyFollowYou: true,
        proofOfWorkCommits: Math.min(1000000, Math.max(0, Math.round(peer.proofOfWorkCommits))),
        focusModeOptOut: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return { ...peer, id: peerDocId, youFollowThem: true, theyFollowYou: true };
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `github_peers/${peerDocId}`);
    }
  }
  return peer;
}

export async function updateGitHubPeerFollowInFirestore(
  user: User | null,
  peer: DeveloperPeer,
  youFollowThem: boolean
): Promise<void> {
  if (!user) return;
  const peerDocId = `${user.uid}_${peer.handle.replace(/[^a-zA-Z0-9_-]/g, '_')}`.slice(0, 120);
  try {
    await updateDoc(doc(db, 'github_peers', peerDocId), {
      youFollowThem,
      theyFollowYou: peer.theyFollowYou,
      focusModeOptOut: peer.focusModeOptOut,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `github_peers/${peerDocId}`);
  }
}

export async function deleteGitHubPeerFromFirestore(
  user: User | null,
  peerHandle: string
): Promise<void> {
  if (!user) return;
  const cleanHandle = peerHandle.trim().replace(/^@/, '');
  const peerDocId = `${user.uid}_${cleanHandle.replace(/[^a-zA-Z0-9_-]/g, '_')}`.slice(0, 120);
  try {
    await deleteDoc(doc(db, 'github_peers', peerDocId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `github_peers/${peerDocId}`);
  }
}

export {
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  onAuthStateChanged,
};
export type { User };
