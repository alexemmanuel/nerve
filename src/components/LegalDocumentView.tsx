import React from 'react';
import { ArrowLeft, FileText, Shield } from 'lucide-react';

export type LegalPageType = 'privacy' | 'terms';

interface LegalDocumentViewProps {
  page: LegalPageType;
  onSwitchPage: (next: LegalPageType) => void;
  onBackToWorkspace: () => void;
}

interface LegalSection {
  id: string;
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

const PRIVACY_SECTIONS: LegalSection[] = [
  {
    id: 'privacy-overview',
    heading: '01. Scope & Information We Collect',
    paragraphs: [
      'Nerve ("we", "our", or "us") provides a peer-to-peer developer collaboration workspace, incident triage workbench, inline codespace viewer, and integration console accessible at https://nerve-tz8t.vercel.app.',
      'We collect only the information necessary to authenticate your session, connect your chosen developer workflows, and persist workspace state you explicitly create or sync.',
    ],
    bullets: [
      'Account Identity & Profile Setup: Display name, handle, pronouns, bio, company, location, optional https:// website link, email address, user identifier, and profile picture provided when you sign in via Google OAuth, GitHub OAuth, or verified email/SMS activation.',
      'Developer Workspace Data: Repository paths, code snippets, incident triage reports, developer peer handles, and SSH/API key metadata you configure inside Nerve.',
      'Local Browser Persistence: Theme preference, active session metadata, locally uploaded profile photos (resized in your browser and never stored as inline base64 strings in Cloud Firestore), cached workspace files, and offline action queues stored in browser localStorage or IndexedDB.',
    ],
  },
  {
    id: 'privacy-github-sync',
    heading: '02. GitHub Profile Sync & Strict Email-Match Requirement',
    paragraphs: [
      'Nerve allows signed-in users to edit their profile manually or optionally pull their GitHub profile setup (display name, avatar URL, bio, company, location, website, and public stats).',
      'To prevent account impersonation and protect developer identity, GitHub profile sync is strictly restricted to accounts where your signed-in Nerve email address matches the verified or registered email address on that GitHub account.',
    ],
    bullets: [
      'Same-Email Verification Gate: Before syncing any GitHub profile, Nerve verifies that your signed-in email matches the GitHub account email via GitHub OAuth verified emails (user:email scope) or public GitHub account/commit email records.',
      'Automatic Denial on Mismatch: If your signed-in Nerve email address does not match the email address on the requested GitHub account, profile sync is automatically blocked and no profile data is imported.',
      'In-Memory OAuth Tokens: GitHub OAuth access tokens obtained during sign-in are kept strictly in browser memory for the active session and cleared immediately when you log out.',
    ],
  },
  {
    id: 'privacy-firestore-rules',
    heading: '03. Audited Database Access Rules (firestore.rules)',
    paragraphs: [
      'Cloud Firestore storage in Nerve is governed by strict, audited server-side security rules (firestore.rules) enforced directly by Google Cloud Firestore on every read and write request:',
    ],
    bullets: [
      'Default-Deny Protection: All unspecified database collections and paths are denied by default (allow read, write: if false).',
      'Owner-Only Isolation: Both /users_public/{userId} and /github_peers/{peerId} enforce strict owner-only access. Signed-in users can only read, create, update, or delete their own profile and peer records—never another user’s documents.',
      'Zero-PII Public Records: Raw email addresses, phone numbers, and secrets are never written into Cloud Firestore profile documents.',
      'Schema, Length & Safe URL Guards: Every Firestore write is validated for required field types, bounded string/integer limits, immutable ownership and creation timestamps, server-generated updatedAt timestamps, and strict https:// or http:// URL schemes on avatarUrl and website fields to block unsafe script links.',
    ],
  },
  {
    id: 'privacy-google-data',
    heading: '04. Google Workspace & Gmail API Data Usage',
    paragraphs: [
      'When you authorize Google Sign-In with email dispatch permission (https://www.googleapis.com/auth/gmail.send) to send a 6-digit verification, activation, or password-reset code, Nerve keeps the OAuth access token strictly in memory for the active browser session.',
      'Nerve uses Gmail access solely to transmit the verification email you explicitly requested. We do not read, index, scan, store, or transfer your inbox messages, contacts, or Google user data to third parties or advertisers.',
      'Nerve’s use and transfer of information received from Google APIs adheres strictly to the Google API Services User Data Policy, including the Limited Use requirements.',
    ],
  },
  {
    id: 'privacy-e2ee',
    heading: '05. End-to-End Encrypted Peer-to-Peer Messaging',
    paragraphs: [
      'Peer-to-peer chat rooms and collaborative code-pairing packets use client-side Web Crypto encryption (AES-GCM-256 with PBKDF2-SHA256 key derivation).',
      'Signaling relays route encrypted ciphertext packets and ephemeral room presence metadata only. Plaintext chat contents and local code buffers are encrypted on your device prior to relay transmission.',
    ],
  },
  {
    id: 'privacy-sharing',
    heading: '06. Infrastructure Providers & Data Storage',
    paragraphs: [
      'We do not sell personal data. Depending on the features you enable, limited data is processed by trusted infrastructure providers required to operate the service:',
    ],
    bullets: [
      'Google Firebase (Authentication & Cloud Firestore): Manages sign-in sessions, password-reset email dispatch, and owner-isolated profile/peer records (users_public and github_peers) protected by firestore.rules.',
      'GitHub API & OAuth: Verifies matching account email addresses for profile sync and resolves public repository trees, file contents, peer profiles, or SSH key listings when requested by your account.',
      'Vercel & Node API Runtime: Serves application assets and executes API key, password recovery (with per-user salted scrypt hashing and expiring 15-minute reset codes), webhook, and incident endpoints initiated by your actions.',
    ],
  },
  {
    id: 'privacy-controls',
    heading: '07. Security, Password Recovery & Your Choices',
    paragraphs: [
      'You remain in control of your account, profile setup, and credentials at all times. You may update or remove your profile picture, edit your profile fields manually, reset a forgotten password via verified email or 6-digit expiring reset code, or click Log out inside your Profile Settings or navigation drawer to immediately clear local sessions and in-memory Google/GitHub OAuth tokens.',
      'You can revoke Google or GitHub OAuth permissions at any time through your Google Account Security settings or GitHub Authorized OAuth Apps, and roll or remove API and SSH keys inside the Integration view.',
      'To request deletion of account records or ask privacy questions, contact us at nervep2p@gmail.com.',
    ],
  },
];

const TERMS_SECTIONS: LegalSection[] = [
  {
    id: 'terms-acceptance',
    heading: '01. Acceptance of Terms',
    paragraphs: [
      'By accessing or using Nerve (https://nerve-tz8t.vercel.app), including its workspace messenger, incident response workflow, inline codespaces environment, profile setup tools, and REST/SDK integration endpoints, you agree to be bound by these Terms & Conditions and our Privacy Policy.',
      'If you are using Nerve on behalf of an organization or engineering team, you represent that you have authority to bind that organization to these terms.',
    ],
  },
  {
    id: 'terms-accounts',
    heading: '02. Accounts, Profile Setup & Credentials',
    paragraphs: [
      'You are responsible for safeguarding your authentication credentials, password recovery codes, Integration verification sessions, live/test API keys, and SSH deployment keys configured within Nerve.',
      'You may configure your Nerve profile manually (including display name, bio, website, and uploaded profile picture) or optionally pull your GitHub profile setup under the strict same-email rule below.',
      'Integration API keys and SSH keys grant programmatic access to workspace callouts and configured remotes. You agree to rotate or revoke any credential immediately if you suspect unauthorized exposure.',
    ],
  },
  {
    id: 'terms-github-email-match',
    heading: '03. Strict Same-Email Policy for GitHub Profile Sync',
    paragraphs: [
      'You may only use, pull, or sync a GitHub profile into Nerve if the email address signed into your Nerve account matches the email address registered on that GitHub account.',
    ],
    bullets: [
      'Accounts with mismatched email addresses are strictly prohibited from pulling or syncing a GitHub profile and will be blocked by Nerve’s verification gate.',
      'You must not attempt to impersonate another developer, claim an unverified GitHub handle as synced, or submit malicious non-HTTP(S) links in profile website or avatar fields.',
      'If you change your account email on GitHub or Nerve so they no longer match, you must edit your Nerve profile manually or sign in with the matching email address before syncing again.',
    ],
  },
  {
    id: 'terms-acceptable-use',
    heading: '04. Acceptable Use, Database Rules & Integration Responsibilities',
    paragraphs: [
      'Nerve connects with external developer platforms and enforces strict Cloud Firestore security rules (firestore.rules) isolating every user’s records to their own authenticated account. You agree to use these capabilities responsibly and lawfully:',
    ],
    bullets: [
      'Only register repositories, SSH keys, webhooks, and external callout targets that you own or have explicit authorization to access.',
      'Do not use email, SMS verification, or password-reset dispatch endpoints to send unsolicited messages, spam, or phishing payloads.',
      'Do not attempt to bypass authentication gates, circumvent firestore.rules owner-isolation checks, probe other users’ private resources, disrupt signaling servers, or distribute malware through peer-to-peer channels.',
    ],
  },
  {
    id: 'terms-ip',
    heading: '05. Ownership of Your Code & Content',
    paragraphs: [
      'You retain all intellectual property rights to source code, patches, pull request diffs, terminal logs, incident notes, profile assets, and messages you create, edit, or transmit using Nerve.',
      'By using Nerve’s workspace and incident workflows, you grant us only the limited technical right to process, render, and route that content at your direction to deliver the service.',
    ],
  },
  {
    id: 'terms-third-party',
    heading: '06. Third-Party Services & Availability',
    paragraphs: [
      'Nerve integrates with third-party services including GitHub, Google Firebase, Google OAuth/Gmail, and external CI/CD webhooks. Your use of those third-party services remains governed by their respective terms and policies.',
      'We may update, modify, or suspend features of Nerve to maintain reliability, security, or platform compatibility.',
    ],
  },
  {
    id: 'terms-liability',
    heading: '07. Disclaimer of Warranties & Limitation of Liability',
    paragraphs: [
      'Nerve is provided on an "as is" and "as available" basis without warranties of any kind, whether express or implied, including fitness for a particular purpose, non-infringement, or uninterrupted availability.',
      'To the fullest extent permitted by applicable law, Nerve and its operators shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of data, code, profits, or service uptime resulting from your use of the platform or third-party integrations.',
    ],
  },
  {
    id: 'terms-contact',
    heading: '08. Changes to Terms & Contact',
    paragraphs: [
      'We may revise these Terms & Conditions periodically. Material changes will be reflected by updating the effective date on this page. Continued use of Nerve after updates constitutes acceptance of the revised Terms.',
      'For questions regarding these Terms & Conditions, contact nervep2p@gmail.com.',
    ],
  },
];

export const LegalDocumentView: React.FC<LegalDocumentViewProps> = ({
  page,
  onSwitchPage,
  onBackToWorkspace,
}) => {
  const isPrivacy = page === 'privacy';
  const sections = isPrivacy ? PRIVACY_SECTIONS : TERMS_SECTIONS;

  return (
    <main className="flex-1 bg-white dark:bg-[#0d1117] text-[#1f2328] dark:text-[#e6edf3]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8">
        {/* Top Breadcrumb / Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-[#d0d7de] dark:border-[#30363d]">
          <button
            type="button"
            onClick={onBackToWorkspace}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#21262d] hover:bg-[#e6ebf1] dark:hover:bg-[#30363d] text-xs font-medium text-[#1f2328] dark:text-[#e6edf3] cursor-pointer transition-colors whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Workspace</span>
          </button>

          {/* Interactive Document Switcher */}
          <div
            role="tablist"
            aria-label="Legal documents"
            className="inline-flex items-center gap-1 p-1 rounded-md bg-[#f6f8fa] dark:bg-[#161b22] border border-[#d0d7de] dark:border-[#30363d]"
          >
            <button
              type="button"
              role="tab"
              aria-selected={isPrivacy}
              onClick={() => onSwitchPage('privacy')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                isPrivacy
                  ? 'bg-white dark:bg-[#21262d] text-[#1f2328] dark:text-[#e6edf3] shadow-xs'
                  : 'text-[#656d76] dark:text-[#8b949e] hover:text-[#1f2328] dark:hover:text-[#e6edf3]'
              }`}
            >
              <Shield className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Privacy Policy</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={!isPrivacy}
              onClick={() => onSwitchPage('terms')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                !isPrivacy
                  ? 'bg-white dark:bg-[#21262d] text-[#1f2328] dark:text-[#e6edf3] shadow-xs'
                  : 'text-[#656d76] dark:text-[#8b949e] hover:text-[#1f2328] dark:hover:text-[#e6edf3]'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Terms &amp; Conditions</span>
            </button>
          </div>
        </div>

        {/* Document Header */}
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#656d76] dark:text-[#8b949e] font-mono">
            <span>Nerve Platform</span>
            <span aria-hidden="true">·</span>
            <span>Effective November 22, 2026</span>
            <span aria-hidden="true">·</span>
            <span>nerve-tz8t.vercel.app</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-[#1f2328] dark:text-[#e6edf3] text-balance">
            {isPrivacy ? 'Privacy Policy' : 'Terms & Conditions'}
          </h1>

          <p className="text-sm sm:text-base text-[#656d76] dark:text-[#8b949e] leading-relaxed max-w-[68ch]">
            {isPrivacy
              ? 'How Nerve handles authentication, audited Firestore access rules, same-email GitHub profile sync, Google Workspace verification scopes, end-to-end encrypted messaging, and local workspace storage.'
              : 'Rules, account and profile responsibilities, same-email GitHub profile sync policy, acceptable integration use, and service terms governing your use of the Nerve developer work surface and API.'}
          </p>
        </header>

        {/* Quick Section Index */}
        <nav
          aria-label="Document sections"
          className="p-4 sm:p-5 rounded-lg border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#161b22] space-y-2.5"
        >
          <div className="text-xs font-semibold text-[#656d76] dark:text-[#8b949e]">
            Contents
          </div>
          <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
            {sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="text-[#1f2328] dark:text-[#e6edf3] hover:text-blue-600 dark:hover:text-blue-400 hover:underline transition-colors"
                >
                  {section.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* Document Sections */}
        <div className="divide-y divide-[#d0d7de] dark:divide-[#30363d] border-t border-b border-[#d0d7de] dark:border-[#30363d]">
          {sections.map((section) => (
            <section key={section.id} id={section.id} className="py-7 space-y-3 scroll-mt-20">
              <h2 className="text-base sm:text-lg font-semibold text-[#1f2328] dark:text-[#e6edf3] tracking-tight">
                {section.heading}
              </h2>

              <div className="space-y-3 max-w-[70ch]">
                {section.paragraphs.map((paragraph, idx) => (
                  <p
                    key={idx}
                    className="text-sm text-[#1f2328]/85 dark:text-[#e6edf3]/85 leading-relaxed"
                  >
                    {paragraph}
                  </p>
                ))}

                {section.bullets && section.bullets.length > 0 && (
                  <ul className="list-disc pl-5 space-y-2 text-sm text-[#1f2328]/85 dark:text-[#e6edf3]/85 leading-relaxed">
                    {section.bullets.map((bullet, idx) => (
                      <li key={idx}>{bullet}</li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          ))}
        </div>

        {/* Bottom Cross-Link & Contact */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 text-xs text-[#656d76] dark:text-[#8b949e]">
          <div>
            Questions or data requests:{' '}
            <a
              href="mailto:nervep2p@gmail.com"
              className="font-mono font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              nervep2p@gmail.com
            </a>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => onSwitchPage(isPrivacy ? 'terms' : 'privacy')}
              className="font-medium text-[#1f2328] dark:text-[#e6edf3] hover:text-blue-600 dark:hover:text-blue-400 underline underline-offset-4 cursor-pointer whitespace-nowrap shrink-0"
            >
              {isPrivacy ? 'Read Terms & Conditions' : 'Read Privacy Policy'}
            </button>
            <button
              type="button"
              onClick={onBackToWorkspace}
              className="font-medium text-[#656d76] dark:text-[#8b949e] hover:text-[#1f2328] dark:hover:text-[#e6edf3] cursor-pointer whitespace-nowrap shrink-0"
            >
              Return to App
            </button>
          </div>
        </div>
      </div>
    </main>
  );
};
