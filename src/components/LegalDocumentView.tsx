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
      'Account Identity: Display name, email address, user identifier, and profile photo provided when you sign in via Google OAuth, GitHub OAuth, or verified email/SMS activation.',
      'Developer Workspace Data: Repository paths, code snippets, incident triage reports, developer peer handles, and SSH/API key metadata you configure inside Nerve.',
      'Local Browser Persistence: Theme preference, active session metadata, cached workspace files, and offline action queues stored in browser localStorage or IndexedDB so you can work seamlessly across reloads.',
    ],
  },
  {
    id: 'privacy-google-data',
    heading: '02. Google Workspace & Gmail API Data Usage',
    paragraphs: [
      'When you authorize Google Sign-In with email dispatch permission (https://www.googleapis.com/auth/gmail.send) to send a 6-digit verification or activation code, Nerve keeps the OAuth access token strictly in memory for the active browser session.',
      'Nerve uses Gmail access solely to transmit the verification email you explicitly requested. We do not read, index, scan, store, or transfer your inbox messages, contacts, or Google user data to third parties or advertisers.',
      'Nerve’s use and transfer of information received from Google APIs adheres strictly to the Google API Services User Data Policy, including the Limited Use requirements.',
    ],
  },
  {
    id: 'privacy-e2ee',
    heading: '03. End-to-End Encrypted Peer-to-Peer Messaging',
    paragraphs: [
      'Peer-to-peer chat rooms and collaborative code-pairing packets use client-side Web Crypto encryption (AES-GCM-256 with PBKDF2-SHA256 key derivation).',
      'Signaling relays route encrypted ciphertext packets and ephemeral room presence metadata only. Plaintext chat contents and local code buffers are encrypted on your device prior to relay transmission.',
    ],
  },
  {
    id: 'privacy-sharing',
    heading: '04. Infrastructure Providers & Data Storage',
    paragraphs: [
      'We do not sell personal data. Depending on the features you enable, limited data is processed by trusted infrastructure providers required to operate the service:',
    ],
    bullets: [
      'Google Firebase (Authentication & Cloud Firestore): Manages sign-in sessions and stores public developer profile/peer records (users_public and github_peers) when authenticated.',
      'GitHub API & OAuth: Resolves public repository trees, file contents, peer profiles, or SSH key listings when requested by your account.',
      'Vercel & Node API Runtime: Serves application assets and executes API key, webhook, and incident endpoints initiated by your actions.',
    ],
  },
  {
    id: 'privacy-controls',
    heading: '05. Security, Retention & Your Choices',
    paragraphs: [
      'You remain in control of your account and integration credentials at all times. You may sign out from the top bar or mobile menu to immediately clear local verified sessions and in-memory OAuth tokens.',
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
      'By accessing or using Nerve (https://nerve-tz8t.vercel.app), including its workspace messenger, incident response workflow, inline codespaces environment, and REST/SDK integration endpoints, you agree to be bound by these Terms & Conditions and our Privacy Policy.',
      'If you are using Nerve on behalf of an organization or engineering team, you represent that you have authority to bind that organization to these terms.',
    ],
  },
  {
    id: 'terms-accounts',
    heading: '02. Accounts, API Keys & Credentials',
    paragraphs: [
      'You are responsible for safeguarding your authentication credentials, Integration verification sessions, live/test API keys, and SSH deployment keys configured within Nerve.',
      'Integration API keys and SSH keys grant programmatic access to workspace callouts and configured remotes. You agree to rotate or revoke any credential immediately if you suspect unauthorized exposure.',
    ],
  },
  {
    id: 'terms-acceptable-use',
    heading: '03. Acceptable Use & Integration Responsibilities',
    paragraphs: [
      'Nerve connects with external developer platforms and user-initiated endpoints. You agree to use these capabilities responsibly and lawfully:',
    ],
    bullets: [
      'Only register repositories, SSH keys, webhooks, and external callout targets that you own or have explicit authorization to access.',
      'Do not use email or SMS verification dispatch endpoints to send unsolicited messages, spam, or phishing payloads.',
      'Do not attempt to bypass authentication gates, probe other users’ private resources, disrupt signaling servers, or distribute malware through peer-to-peer channels.',
    ],
  },
  {
    id: 'terms-ip',
    heading: '04. Ownership of Your Code & Content',
    paragraphs: [
      'You retain all intellectual property rights to source code, patches, pull request diffs, terminal logs, incident notes, and messages you create, edit, or transmit using Nerve.',
      'By using Nerve’s workspace and incident workflows, you grant us only the limited technical right to process, render, and route that content at your direction to deliver the service.',
    ],
  },
  {
    id: 'terms-third-party',
    heading: '05. Third-Party Services & Availability',
    paragraphs: [
      'Nerve integrates with third-party services including GitHub, Google Firebase, Google OAuth/Gmail, and external CI/CD webhooks. Your use of those third-party services remains governed by their respective terms and policies.',
      'We may update, modify, or suspend features of Nerve to maintain reliability, security, or platform compatibility.',
    ],
  },
  {
    id: 'terms-liability',
    heading: '06. Disclaimer of Warranties & Limitation of Liability',
    paragraphs: [
      'Nerve is provided on an "as is" and "as available" basis without warranties of any kind, whether express or implied, including fitness for a particular purpose, non-infringement, or uninterrupted availability.',
      'To the fullest extent permitted by applicable law, Nerve and its operators shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of data, code, profits, or service uptime resulting from your use of the platform or third-party integrations.',
    ],
  },
  {
    id: 'terms-contact',
    heading: '07. Changes to Terms & Contact',
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
    <main className="flex-1 bg-white dark:bg-black text-black dark:text-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8">
        {/* Top Breadcrumb / Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-neutral-200 dark:border-neutral-800">
          <button
            type="button"
            onClick={onBackToWorkspace}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black hover:bg-neutral-100 dark:hover:bg-neutral-900 text-xs font-medium text-black dark:text-white cursor-pointer transition-colors whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Workspace</span>
          </button>

          {/* Interactive Document Switcher */}
          <div
            role="tablist"
            aria-label="Legal documents"
            className="inline-flex items-center gap-1 p-1 rounded-lg bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800"
          >
            <button
              type="button"
              role="tab"
              aria-selected={isPrivacy}
              onClick={() => onSwitchPage('privacy')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                isPrivacy
                  ? 'bg-white dark:bg-black text-black dark:text-white shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white'
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
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                !isPrivacy
                  ? 'bg-white dark:bg-black text-black dark:text-white shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Terms & Conditions</span>
            </button>
          </div>
        </div>

        {/* Document Header */}
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 font-mono">
            <span>Nerve Platform</span>
            <span aria-hidden="true">·</span>
            <span>Effective November 16, 2026</span>
            <span aria-hidden="true">·</span>
            <span>nerve-tz8t.vercel.app</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-black dark:text-white text-balance">
            {isPrivacy ? 'Privacy Policy' : 'Terms & Conditions'}
          </h1>

          <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-300 leading-relaxed max-w-[68ch]">
            {isPrivacy
              ? 'How Nerve handles authentication, Google Workspace verification scopes, end-to-end encrypted peer messaging, and locally cached developer workspace data.'
              : 'Rules, account responsibilities, acceptable integration use, and service terms governing your use of the Nerve developer work surface and API.'}
          </p>
        </header>

        {/* Quick Section Index */}
        <nav
          aria-label="Document sections"
          className="p-4 sm:p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-950 space-y-2.5"
        >
          <div className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
            Contents
          </div>
          <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
            {sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="text-neutral-700 dark:text-neutral-300 hover:text-blue-600 dark:hover:text-blue-400 hover:underline transition-colors"
                >
                  {section.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* Document Sections */}
        <div className="divide-y divide-neutral-200 dark:divide-neutral-800 border-t border-b border-neutral-200 dark:border-neutral-800">
          {sections.map((section) => (
            <section key={section.id} id={section.id} className="py-7 space-y-3 scroll-mt-20">
              <h2 className="text-base sm:text-lg font-semibold text-black dark:text-white tracking-tight">
                {section.heading}
              </h2>

              <div className="space-y-3 max-w-[70ch]">
                {section.paragraphs.map((paragraph, idx) => (
                  <p
                    key={idx}
                    className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed"
                  >
                    {paragraph}
                  </p>
                ))}

                {section.bullets && section.bullets.length > 0 && (
                  <ul className="list-disc pl-5 space-y-2 text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 text-xs text-neutral-600 dark:text-neutral-400">
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
              className="font-medium text-black dark:text-white hover:text-blue-600 dark:hover:text-blue-400 underline underline-offset-4 cursor-pointer whitespace-nowrap shrink-0"
            >
              {isPrivacy ? 'Read Terms & Conditions' : 'Read Privacy Policy'}
            </button>
            <button
              type="button"
              onClick={onBackToWorkspace}
              className="font-medium text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white cursor-pointer whitespace-nowrap shrink-0"
            >
              Return to App
            </button>
          </div>
        </div>
      </div>
    </main>
  );
};
