# Nerve Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Global Default Deny**: Any path not explicitly matched under `/users_public/{userId}` or `/github_peers/{peerId}` is unconditionally denied (`allow read, write: if false;`).
2. **PII Isolation**: Neither `/users_public/{userId}` nor `/github_peers/{peerId}` stores PII (no emails, phone numbers, or physical addresses). Only public GitHub handles, display names, avatar URLs, and public repo counts are stored.
3. **Identity Integrity**:
   - In `/users_public/{userId}`, `userId` must match `request.auth.uid` and `incoming().uid == request.auth.uid`.
   - In `/github_peers/{peerId}`, `incoming().ownerId == request.auth.uid` and only the document owner (`resource.data.ownerId == request.auth.uid`) can read, list, update, or delete their peer connections.
4. **Strict Keys & Volumetric Bounds**:
   - Every string field has strict `.size()` bounds matching `firebase-blueprint.json`.
   - Every ID variable (`userId`, `peerId`) is validated with `isValidId()` (`id is string && id.size() >= 1 && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$')`).
5. **Temporal Integrity**:
   - `createdAt == request.time` on `create` and `createdAt == existing().createdAt` (immutable) on `update`.
   - `updatedAt == request.time` on both `create` and `update`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Write**: Creating `/users_public/user_1` with `request.auth == null` -> `PERMISSION_DENIED`.
2. **Unverified Email Write**: Creating `/users_public/user_1` with `request.auth.token.email_verified == false` -> `PERMISSION_DENIED`.
3. **Identity Spoofing on User Profile**: Authenticated `user_1` creating `/users_public/user_2` or setting `uid: "user_2"` -> `PERMISSION_DENIED`.
4. **Shadow Field Injection on Create**: Creating `/github_peers/peer_1` with extra field `isAdmin: true` -> `PERMISSION_DENIED`.
5. **Shadow Field Injection on Update**: Updating `/github_peers/peer_1` with an unauthorized key `proofOfWorkCommits` outside allowed action keys -> `PERMISSION_DENIED`.
6. **Cross-Tenant Peer Read/List**: Authenticated `user_2` attempting `get` or `list` on `/github_peers` where `ownerId == "user_1"` -> `PERMISSION_DENIED`.
7. **ID Poisoning**: Creating `/github_peers/invalid$id!@#` -> `PERMISSION_DENIED`.
8. **Volumetric String Overflow**: Setting `displayName` to a 500-character string (max 120) -> `PERMISSION_DENIED`.
9. **Client Timestamp Forgery on Create**: Setting `createdAt` to a past/future timestamp instead of `request.time` -> `PERMISSION_DENIED`.
10. **Immortal Field Mutation on Update**: Mutating `createdAt` or `ownerId` during `update` -> `PERMISSION_DENIED`.
11. **Type Confusion Attack**: Passing a string `"100"` for `publicRepos` instead of an `int` -> `PERMISSION_DENIED`.
12. **Orphaned Peer Creation**: Creating `/github_peers/peer_1` when `/users_public/$(request.auth.uid)` does not exist -> `PERMISSION_DENIED`.
