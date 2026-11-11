/**
 * Nerve Firestore Security Rules — Phase 0 "Dirty Dozen" Verification Suite
 * Validates that all 12 adversarial payloads defined in security_spec.md are rejected
 * with PERMISSION_DENIED while legitimate owner operations succeed.
 */
export interface DirtyDozenTestCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  authUid: string | null;
  emailVerified: boolean;
  payload?: Record<string, unknown>;
  expectedOutcome: 'PERMISSION_DENIED' | 'ALLOWED';
}

export const DIRTY_DOZEN_SECURITY_TESTS: DirtyDozenTestCase[] = [
  {
    id: 1,
    name: 'Unauthenticated Write to /users_public',
    collectionPath: '/users_public/usr_1',
    operation: 'create',
    authUid: null,
    emailVerified: false,
    payload: { uid: 'usr_1', githubHandle: 'sindresorhus' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Email Write to /users_public',
    collectionPath: '/users_public/usr_1',
    operation: 'create',
    authUid: 'usr_1',
    emailVerified: false,
    payload: { uid: 'usr_1', githubHandle: 'sindresorhus' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Identity Spoofing on User Profile (uid mismatch)',
    collectionPath: '/users_public/usr_2',
    operation: 'create',
    authUid: 'usr_1',
    emailVerified: true,
    payload: { uid: 'usr_2', githubHandle: 'spoofed' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Shadow Field Injection on Create (isAdmin: true)',
    collectionPath: '/github_peers/peer_1',
    operation: 'create',
    authUid: 'usr_1',
    emailVerified: true,
    payload: { ownerId: 'usr_1', handle: 'gaearon', isAdmin: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Shadow Field Injection on Update (unauthorized field)',
    collectionPath: '/github_peers/peer_1',
    operation: 'update',
    authUid: 'usr_1',
    emailVerified: true,
    payload: { secretToken: 'leak' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Cross-Tenant Peer Read/List',
    collectionPath: '/github_peers/peer_owned_by_usr_1',
    operation: 'get',
    authUid: 'usr_2',
    emailVerified: true,
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'ID Poisoning Attack ($!@# characters)',
    collectionPath: '/github_peers/bad$id!@#',
    operation: 'create',
    authUid: 'usr_1',
    emailVerified: true,
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Volumetric String Overflow (displayName > 120 chars)',
    collectionPath: '/users_public/usr_1',
    operation: 'create',
    authUid: 'usr_1',
    emailVerified: true,
    payload: { uid: 'usr_1', displayName: 'A'.repeat(250) },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Client Timestamp Forgery on Create',
    collectionPath: '/users_public/usr_1',
    operation: 'create',
    authUid: 'usr_1',
    emailVerified: true,
    payload: { uid: 'usr_1', createdAt: '1999-01-01T00:00:00Z' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Immortal Field Mutation on Update (mutating ownerId)',
    collectionPath: '/github_peers/peer_1',
    operation: 'update',
    authUid: 'usr_1',
    emailVerified: true,
    payload: { ownerId: 'usr_2' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Type Confusion Attack (string for publicRepos)',
    collectionPath: '/users_public/usr_1',
    operation: 'create',
    authUid: 'usr_1',
    emailVerified: true,
    payload: { uid: 'usr_1', publicRepos: '100' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Orphaned Peer Creation without Parent UserPublicProfile',
    collectionPath: '/github_peers/peer_orphan',
    operation: 'create',
    authUid: 'usr_without_profile',
    emailVerified: true,
    expectedOutcome: 'PERMISSION_DENIED',
  },
];
