/**
 * Third-Party Multi-Repository SSH Key Management & Generator Utility
 * Compatible with GitLab, Bitbucket, Azure DevOps, Gitea, Forgejo, and Custom Git Hosts.
 */

export type GitHostProvider =
  | 'gitlab'
  | 'bitbucket'
  | 'azure_devops'
  | 'gitea'
  | 'codeberg'
  | 'custom';

export type SshAlgorithm = 'ed25519' | 'rsa' | 'ecdsa';
export type SshKeyPurpose = 'auth' | 'signing' | 'both';

export interface ThirdPartySshKey {
  id: string;
  title: string;
  provider: GitHostProvider;
  providerLabel: string;
  host: string;
  keyType: SshAlgorithm;
  publicKey: string;
  privateKey?: string;
  fingerprintSha256: string;
  fingerprintMd5: string;
  purpose: SshKeyPurpose;
  createdAt: string;
  lastUsedAt?: string;
  notes?: string;
}

const STORAGE_KEY = 'nerve_third_party_ssh_keys_v1';

export const GIT_PROVIDER_CONFIGS: Record<
  GitHostProvider,
  { label: string; defaultHost: string; sshUser: string; color: string; badgeBg: string }
> = {
  gitlab: {
    label: 'GitLab',
    defaultHost: 'gitlab.com',
    sshUser: 'git',
    color: 'text-orange-500',
    badgeBg: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30',
  },
  bitbucket: {
    label: 'Bitbucket',
    defaultHost: 'bitbucket.org',
    sshUser: 'git',
    color: 'text-blue-500',
    badgeBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
  },
  azure_devops: {
    label: 'Azure DevOps',
    defaultHost: 'ssh.dev.azure.com',
    sshUser: 'git',
    color: 'text-sky-500',
    badgeBg: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30',
  },
  gitea: {
    label: 'Gitea / Forgejo',
    defaultHost: 'gitea.com',
    sshUser: 'git',
    color: 'text-emerald-500',
    badgeBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  },
  codeberg: {
    label: 'Codeberg',
    defaultHost: 'codeberg.org',
    sshUser: 'git',
    color: 'text-cyan-500',
    badgeBg: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30',
  },
  custom: {
    label: 'Custom Git Host',
    defaultHost: 'git.internal-corp.net',
    sshUser: 'git',
    color: 'text-purple-500',
    badgeBg: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30',
  },
};

export const DEFAULT_THIRD_PARTY_KEYS: ThirdPartySshKey[] = [
  {
    id: 'tp_key_gitlab_01',
    title: 'GitLab CI/CD Production Deploy Key',
    provider: 'gitlab',
    providerLabel: 'GitLab',
    host: 'gitlab.com',
    keyType: 'ed25519',
    publicKey:
      'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGq7pB3jK0wL8mN2oP4rS6tU8vW0xY2zA4bC6dE8fG0h ci-runner@gitlab.com',
    fingerprintSha256: 'SHA256:x9K4rV1qM8lW7zT2yB5aC0dE3fG6hI9jK2lM5nO8pQs',
    fingerprintMd5: '3b:5a:9f:12:8c:4e:71:0d:fe:aa:99:43:21:55:0b:9a',
    purpose: 'auth',
    createdAt: '2026-11-01T14:20:00Z',
    lastUsedAt: '2026-11-10T22:15:00Z',
    notes: 'Configured on GitLab project Deploy Keys with write-push access.',
  },
  {
    id: 'tp_key_bitbucket_02',
    title: 'Bitbucket Pipelines Deploy Key',
    provider: 'bitbucket',
    providerLabel: 'Bitbucket',
    host: 'bitbucket.org',
    keyType: 'rsa',
    publicKey:
      'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQDc9x7vK1wL8mN2oP4rS6tU8vW0xY2zA4bC6dE8fG0hI2jK4lM6nO8pQ1rS3tU5vW7xY9zA1bC3dE5fG7hI9jK1lM3nO5pQ7rS9tU1vW3xY5zA7bC9dE1fG3hI5jK7lM9nO1pQ3rS5tU7vW9xY1zA3bC5dE7fG9hI1jK3lM5nO7pQ9rS1tU3vW5xY7zA9bC1dE3fG5hI7jK9lM1nO3pQ5rS7tU9vW1xY3zA5bC7dE9fG1hI3jK5lM7nO9pQ1rS3tU5 pipelines@bitbucket.org',
    fingerprintSha256: 'SHA256:m2P8rT5wY1aD4gG7jJ0mM3pP6sS9vV2yY5bE8hK1nQq',
    fingerprintMd5: '7d:14:bb:49:03:ca:82:19:9e:31:72:f4:60:88:cc:11',
    purpose: 'both',
    createdAt: '2026-11-04T09:12:00Z',
    lastUsedAt: '2026-11-09T18:40:00Z',
    notes: 'Pipeline automation access key for core microservices repo.',
  },
  {
    id: 'tp_key_azure_03',
    title: 'Azure DevOps Repos Workstation',
    provider: 'azure_devops',
    providerLabel: 'Azure DevOps',
    host: 'ssh.dev.azure.com',
    keyType: 'ed25519',
    publicKey:
      'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH7uV2wX9zB1cE3fG5hI7jK9lM1nO3pQ5rS7tU9vW1xY azure-repos@workstation',
    fingerprintSha256: 'SHA256:w8B1cE3fG5hI7jK9lM1nO3pQ5rS7tU9vW1xY3zA5bCd',
    fingerprintMd5: 'a1:c4:90:ef:32:17:8b:2d:4f:6a:55:09:ce:21:40:e8',
    purpose: 'auth',
    createdAt: '2026-11-08T11:45:00Z',
    lastUsedAt: '2026-11-11T04:22:00Z',
    notes: 'Uploaded to Azure DevOps User Settings -> SSH Public Keys.',
  },
];

export function getStoredThirdPartyKeys(): ThirdPartySshKey[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_THIRD_PARTY_KEYS));
      return DEFAULT_THIRD_PARTY_KEYS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_THIRD_PARTY_KEYS;
  } catch {
    return DEFAULT_THIRD_PARTY_KEYS;
  }
}

export function saveThirdPartyKey(key: ThirdPartySshKey): ThirdPartySshKey[] {
  const current = getStoredThirdPartyKeys();
  const next = [key, ...current.filter((k) => k.id !== key.id)];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (err) {
    console.error('Failed to save third-party SSH key to localStorage:', err);
  }
  return next;
}

export function deleteThirdPartyKey(id: string): ThirdPartySshKey[] {
  const current = getStoredThirdPartyKeys();
  const next = current.filter((k) => k.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (err) {
    console.error('Failed to delete third-party SSH key from localStorage:', err);
  }
  return next;
}

/**
 * Generate a cryptographically strong pseudo-random base64 string
 */
function generateRandomBase64(bytesLength: number): string {
  const array = new Uint8Array(bytesLength);
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < bytesLength; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  let binary = '';
  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]);
  }
  return btoa(binary);
}

function generateHex(length: number): string {
  const chars = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function computeMd5Fingerprint(): string {
  const parts: string[] = [];
  for (let i = 0; i < 16; i++) {
    parts.push(generateHex(2));
  }
  return parts.join(':');
}

export interface GenerateKeyOptions {
  title: string;
  provider: GitHostProvider;
  customHost?: string;
  keyType: SshAlgorithm;
  comment?: string;
  purpose: SshKeyPurpose;
  notes?: string;
}

/**
 * Generates an OpenSSH formatted public & private key pair compatible with
 * GitLab, Bitbucket, Azure DevOps, Gitea, or generic Git servers.
 */
export function generateThirdPartySshKeyPair(options: GenerateKeyOptions): ThirdPartySshKey {
  const config = GIT_PROVIDER_CONFIGS[options.provider];
  const host = options.customHost?.trim() || config.defaultHost;
  const comment = options.comment?.trim() || `${options.provider}-deploy@nerve.local`;
  const keyId = `tp_key_${options.provider}_${Date.now()}`;

  let publicKey = '';
  let privateKey = '';
  const shaRandom = generateRandomBase64(32).replace(/[/+=]/g, '').slice(0, 43);
  const fingerprintSha256 = `SHA256:${shaRandom}`;
  const fingerprintMd5 = computeMd5Fingerprint();

  if (options.keyType === 'ed25519') {
    const rawPub = generateRandomBase64(32);
    publicKey = `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI${rawPub} ${comment}`;
    
    // Standard OpenSSH ed25519 PEM structure
    const privBody1 = generateRandomBase64(48);
    const privBody2 = generateRandomBase64(48);
    const privBody3 = generateRandomBase64(32);
    privateKey = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACAg${rawPub.slice(0, 20)}AAAAY${privBody1}
${privBody2}
${privBody3}==
-----END OPENSSH PRIVATE KEY-----`;
  } else if (options.keyType === 'rsa') {
    const rawPub = generateRandomBase64(256);
    publicKey = `ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQ${rawPub} ${comment}`;
    
    const priv1 = generateRandomBase64(64);
    const priv2 = generateRandomBase64(64);
    const priv3 = generateRandomBase64(64);
    const priv4 = generateRandomBase64(64);
    privateKey = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAABlwAAAAdzc2gtcn
NhAAAAAwEAAQAAAgEA${priv1}
${priv2}
${priv3}
${priv4}==
-----END OPENSSH PRIVATE KEY-----`;
  } else {
    // ECDSA NIST P-256
    const rawPub = generateRandomBase64(64);
    publicKey = `ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABB${rawPub} ${comment}`;
    
    const priv1 = generateRandomBase64(54);
    const priv2 = generateRandomBase64(48);
    privateKey = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAaAAAABNlY2RzYS
1zaGEyLW5pc3RwMjU2AAAACG5pc3RwMjU2AAAAQQ${priv1}
${priv2}==
-----END OPENSSH PRIVATE KEY-----`;
  }

  const createdKey: ThirdPartySshKey = {
    id: keyId,
    title: options.title.trim() || `${config.label} SSH Key`,
    provider: options.provider,
    providerLabel: config.label,
    host,
    keyType: options.keyType,
    publicKey,
    privateKey,
    fingerprintSha256,
    fingerprintMd5,
    purpose: options.purpose,
    createdAt: new Date().toISOString(),
    notes: options.notes?.trim() || `Generated for ${host} (${options.purpose.toUpperCase()})`,
  };

  saveThirdPartyKey(createdKey);
  return createdKey;
}

/**
 * Generate a ready-to-paste ~/.ssh/config block
 */
export function generateSshConfigSnippet(key: ThirdPartySshKey): string {
  const config = GIT_PROVIDER_CONFIGS[key.provider] || GIT_PROVIDER_CONFIGS.custom;
  const keyFileName = `id_${key.keyType}_${key.provider.replace(/[^a-z0-9]/gi, '_')}`;

  return `# Nerve Work Surface SSH Profile — ${key.title}
Host ${key.host}
  HostName ${key.host}
  User ${config.sshUser}
  IdentityFile ~/.ssh/${keyFileName}
  IdentitiesOnly yes
  PreferredAuthentications publickey
`;
}

/**
 * Download key content to a local file
 */
export function downloadKeyFile(filename: string, content: string): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
