/**
 * Application-Layer End-to-End Encryption (E2EE) Engine
 * Uses native Web Crypto API (`crypto.subtle`)
 * - AES-GCM (256-bit) encryption & decryption
 * - PBKDF2 key derivation (100,000 iterations, SHA-256) from room secret/passphrase
 * - Zero plaintext exposure before entering WebRTC DataChannel or signaling relay
 */

export interface EncryptedEnvelope {
  iv: string; // Base64 12-byte initialization vector
  ciphertext: string; // Base64 AES-GCM ciphertext + 128-bit auth tag
  salt: string; // Base64 salt used for PBKDF2
  iterations: number;
  alg: 'AES-GCM-256';
}

export interface DerivedKeyMaterial {
  key: CryptoKey;
  fingerprint: string;
  saltBase64: string;
}

const PBKDF2_ITERATIONS = 100000;

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Deterministically derives a 16-byte salt from the room ID so peers in the same
 * room with the same passphrase derive the identical 256-bit AES-GCM key.
 */
async function getDeterministicSalt(roomId: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`nerve-e2ee-salt-v1:${roomId.trim().toLowerCase()}`);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hashBuffer).slice(0, 16);
}

/**
 * Derives a 256-bit AES-GCM CryptoKey from a shared room secret/passphrase and roomId
 * using PBKDF2 with 100,000 iterations and SHA-256.
 */
export async function deriveRoomKey(
  passphrase: string,
  roomId: string
): Promise<DerivedKeyMaterial> {
  const encoder = new TextEncoder();
  const normalizedPassphrase = passphrase || 'nerve-default-room-secret';
  const salt = await getDeterministicSalt(roomId || 'global-dev-room');

  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(normalizedPassphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey', 'deriveBits']
  );

  const aesKey = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  const rawKeyBuffer = await window.crypto.subtle.exportKey('raw', aesKey);
  const digestBuffer = await window.crypto.subtle.digest('SHA-256', rawKeyBuffer);
  const digestArray = Array.from(new Uint8Array(digestBuffer).slice(0, 8));
  const fingerprint = digestArray.map((b) => b.toString(16).padStart(2, '0')).join(':').toUpperCase();

  return {
    key: aesKey,
    fingerprint,
    saltBase64: uint8ToBase64(salt),
  };
}

/**
 * Encrypts a UTF-8 string or JSON-serializable payload with AES-GCM (256-bit).
 */
export async function encryptStringPayload(
  key: CryptoKey,
  plaintext: string,
  saltBase64: string
): Promise<EncryptedEnvelope> {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(plaintext);
  return encryptBinaryChunk(key, encoded, saltBase64);
}

/**
 * Decrypts an EncryptedEnvelope back to a UTF-8 string.
 */
export async function decryptStringPayload(
  key: CryptoKey,
  envelope: EncryptedEnvelope
): Promise<string> {
  const decryptedBytes = await decryptBinaryChunk(key, envelope);
  const decoder = new TextDecoder();
  return decoder.decode(decryptedBytes);
}

/**
 * Encrypts a binary Uint8Array chunk (e.g., 16KB file slice) using AES-GCM (256-bit).
 */
export async function encryptBinaryChunk(
  key: CryptoKey,
  chunk: Uint8Array,
  saltBase64: string
): Promise<EncryptedEnvelope> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const cipherBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as BufferSource,
      tagLength: 128,
    },
    key,
    chunk as unknown as BufferSource
  );

  return {
    iv: uint8ToBase64(iv),
    ciphertext: uint8ToBase64(new Uint8Array(cipherBuffer)),
    salt: saltBase64,
    iterations: PBKDF2_ITERATIONS,
    alg: 'AES-GCM-256',
  };
}

/**
 * Decrypts an EncryptedEnvelope back into a raw Uint8Array binary chunk.
 */
export async function decryptBinaryChunk(
  key: CryptoKey,
  envelope: EncryptedEnvelope
): Promise<Uint8Array> {
  const iv = base64ToUint8(envelope.iv);
  const cipherBytes = base64ToUint8(envelope.ciphertext);

  const plainBuffer = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as BufferSource,
      tagLength: 128,
    },
    key,
    cipherBytes as unknown as BufferSource
  );

  return new Uint8Array(plainBuffer);
}
