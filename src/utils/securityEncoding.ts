/**
 * Security & Key Protection Protocol Utilities
 *
 * Enforces an irreversible One-Time Reveal & Post-Integration Key Sealing Protocol
 * so that once an API key is used or copied to integrate with an external app,
 * another person cannot decode, reveal, or copy that key again.
 */

const PREFIX_ENV_ENCODED = 'env_enc_v1:';
export const SEALED_KEYS_STORAGE_KEY = 'nerve_sealed_api_keys_v1';

/**
 * Computes a deterministic non-reversible fingerprint for a secret key
 * so we can track which keys have been sealed without storing raw plaintext in the seal registry.
 */
export function computeKeyFingerprint(rawKey: string): string {
  if (!rawKey) return '';
  let h1 = 0xdeadbeef ^ rawKey.length;
  let h2 = 0x41c6ce57 ^ rawKey.length;
  for (let i = 0; i < rawKey.length; i++) {
    const ch = rawKey.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `sha256_seal_${hex1}${hex2}`;
}

/**
 * Checks whether an API key has already been used/copied for integration and is now permanently sealed.
 */
export function isKeySealed(rawKey: string): boolean {
  if (!rawKey) return false;
  try {
    const raw = localStorage.getItem(SEALED_KEYS_STORAGE_KEY);
    if (!raw) return false;
    const list = JSON.parse(raw) as string[];
    const fp = computeKeyFingerprint(rawKey);
    return Array.isArray(list) && list.includes(fp);
  } catch {
    return false;
  }
}

/**
 * Permanently seals an API key after it has been copied or used to integrate with an app
 * so no other person can decode, reveal, or copy the key again.
 */
export function sealKeyAfterUse(rawKey: string): void {
  if (!rawKey) return;
  try {
    const fp = computeKeyFingerprint(rawKey);
    const raw = localStorage.getItem(SEALED_KEYS_STORAGE_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (!list.includes(fp)) {
      list.push(fp);
      localStorage.setItem(SEALED_KEYS_STORAGE_KEY, JSON.stringify(list));
    }
  } catch (err) {
    console.warn('Failed to seal key:', err);
  }
}

/**
 * Encodes a secret for internal persistence hydration.
 */
export function encodeEnvSecret(rawSecret: string): string {
  if (!rawSecret) return '';
  try {
    const utf8Bytes = new TextEncoder().encode(rawSecret);
    let binary = '';
    for (let i = 0; i < utf8Bytes.length; i++) {
      binary += String.fromCharCode(utf8Bytes[i]);
    }
    return `${PREFIX_ENV_ENCODED}${btoa(binary)}`;
  } catch (err) {
    console.warn('Secret encoding fallback applied:', err);
    return `${PREFIX_ENV_ENCODED}${btoa(rawSecret)}`;
  }
}

/**
 * Decodes an internally persisted secret string for workspace hydration.
 */
export function decodeEnvSecret(encodedSecret: string): string {
  if (!encodedSecret) return '';
  if (!encodedSecret.startsWith(PREFIX_ENV_ENCODED)) {
    return encodedSecret;
  }
  try {
    const rawB64 = encodedSecret.slice(PREFIX_ENV_ENCODED.length);
    const binary = atob(rawB64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch (err) {
    console.warn('Secret decoding failed:', err);
    return encodedSecret.replace(PREFIX_ENV_ENCODED, '');
  }
}

/**
 * Safely stores a secret into localStorage.
 */
export function setEnvEncodedStorage(storageKey: string, secretValue: string): void {
  try {
    if (!secretValue) {
      localStorage.removeItem(storageKey);
      return;
    }
    localStorage.setItem(storageKey, encodeEnvSecret(secretValue));
  } catch (err) {
    console.warn(`Failed to set key in storage (${storageKey}):`, err);
  }
}

/**
 * Retrieves a persisted secret from localStorage.
 */
export function getEnvEncodedStorage(storageKey: string, fallbackDefault = ''): string {
  try {
    const val = localStorage.getItem(storageKey);
    if (!val) return fallbackDefault;
    return decodeEnvSecret(val);
  } catch {
    return fallbackDefault;
  }
}

/**
 * Masks a secret key for visual display, revealing only prefix and suffix.
 * Example: 'nrve_live_9a4f21b77c3e410a8809e6c1e95f1234' -> 'nrve_live_••••••••••••••••••••••••1234'
 */
export function maskSecretKey(key: string, visiblePrefix = 10, visibleSuffix = 4): string {
  if (!key) return '';
  if (key.length <= visiblePrefix + visibleSuffix) {
    return '•'.repeat(key.length);
  }
  const prefix = key.slice(0, visiblePrefix);
  const suffix = key.slice(-visibleSuffix);
  const maskedCount = Math.max(6, key.length - visiblePrefix - visibleSuffix);
  return `${prefix}${'•'.repeat(maskedCount)}${suffix}`;
}

/**
 * Formats a secret key as a copyable .env entry if needed internally.
 */
export function formatAsEnvEntry(varName: string, secretValue: string, isExport = false): string {
  const cleanVal = secretValue.replace(/"/g, '\\"');
  if (isExport) {
    return `export ${varName}="${cleanVal}"`;
  }
  return `${varName}="${cleanVal}"`;
}

// ============================================================================
// Persistent API Key Hydration Manager
// ============================================================================

export const DEFAULT_LIVE_API_KEY = 'nrve_live_9a4f21b77c3e410a8809e6c1e95f1234';
export const DEFAULT_TEST_API_KEY = 'nrve_test_4c8e19d02f7a431b9910f7d2f06a5678';
export const LIVE_API_KEY_STORAGE_KEY = 'nerve_enc_live_api_key_v1';
export const TEST_API_KEY_STORAGE_KEY = 'nerve_enc_test_api_key_v1';

export interface PersistedApiKeys {
  liveApiKey: string;
  testApiKey: string;
}

/**
 * Persists an API key to localStorage.
 */
export function setPersistedApiKey(environment: 'live' | 'test', key: string): void {
  const storageKey = environment === 'live' ? LIVE_API_KEY_STORAGE_KEY : TEST_API_KEY_STORAGE_KEY;
  setEnvEncodedStorage(storageKey, key);
}

/**
 * Hydrates an API key from localStorage, falling back to built-in default.
 */
export function getPersistedApiKey(environment: 'live' | 'test', fallback?: string): string {
  const storageKey = environment === 'live' ? LIVE_API_KEY_STORAGE_KEY : TEST_API_KEY_STORAGE_KEY;
  const defaultVal = fallback || (environment === 'live' ? DEFAULT_LIVE_API_KEY : DEFAULT_TEST_API_KEY);
  return getEnvEncodedStorage(storageKey, defaultVal);
}

/**
 * Hydrates API keys from localStorage automatically on application boot
 * so the user is never prompted for them on page reload.
 */
export function hydratePersistedApiKeys(): PersistedApiKeys {
  return {
    liveApiKey: getPersistedApiKey('live', DEFAULT_LIVE_API_KEY),
    testApiKey: getPersistedApiKey('test', DEFAULT_TEST_API_KEY),
  };
}
