import React from 'react';
import {
  ArrowLeft,
  Globe,
  Key,
  Lock,
  Mail,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Unlock,
  X,
} from 'lucide-react';

interface IntegrationUnlockOverlayProps {
  isUnlockPromptConfirmed: boolean;
  onStartUnlock: () => void;
  onResetUnlockPrompt: () => void;
  onBackToWorkspace?: () => void;
  providerType: 'user' | 'third-party';
  onChangeProviderType: (next: 'user' | 'third-party') => void;
  gateStep: 'email' | 'code';
  onChangeGateStep: (step: 'email' | 'code') => void;
  gateEmailInput: string;
  onChangeGateEmailInput: (value: string) => void;
  gateCodeInput: string;
  onChangeGateCodeInput: (value: string) => void;
  gateError: string;
  gateDispatchMessage: string;
  isVerifyingGate: boolean;
  showGmailSendConfirmModal: boolean;
  onOpenGmailSendConfirmModal: () => void;
  onCloseGmailSendConfirmModal: () => void;
  onRequestEmailAccess: (e: React.FormEvent) => void;
  onConfirmSendGmailCode: () => void;
  onVerifyCodeAccess: (e: React.FormEvent) => void;
  onGoogleOAuthConfirm: () => void;
  onGitHubOAuthConfirm: () => void;
}

export const IntegrationUnlockOverlay: React.FC<IntegrationUnlockOverlayProps> = ({
  isUnlockPromptConfirmed,
  onStartUnlock,
  onResetUnlockPrompt,
  onBackToWorkspace,
  providerType,
  onChangeProviderType,
  gateStep,
  onChangeGateStep,
  gateEmailInput,
  onChangeGateEmailInput,
  gateCodeInput,
  onChangeGateCodeInput,
  gateError,
  gateDispatchMessage,
  isVerifyingGate,
  showGmailSendConfirmModal,
  onOpenGmailSendConfirmModal,
  onCloseGmailSendConfirmModal,
  onRequestEmailAccess,
  onConfirmSendGmailCode,
  onVerifyCodeAccess,
  onGoogleOAuthConfirm,
  onGitHubOAuthConfirm,
}) => {
  return (
    <div className="relative flex-1 min-h-[calc(100vh-110px)] w-full overflow-hidden bg-white dark:bg-black">
      {/* Redacted Background Shell: zero text or sensitive data in DOM while locked */}
      <div
        aria-hidden="true"
        className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6 opacity-25 pointer-events-none select-none"
      >
        <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-4">
          <div className="space-y-1">
            <div className="h-5 w-64 rounded bg-neutral-200 dark:bg-neutral-800" />
            <div className="h-3 w-40 rounded bg-neutral-200 dark:bg-neutral-800" />
          </div>
          <div className="h-8 w-32 rounded-lg bg-neutral-200 dark:bg-neutral-800" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[Key, Terminal, ShieldAlert].map((Icon, idx) => (
            <div
              key={idx}
              className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 space-y-3"
            >
              <Icon className="w-4 h-4 text-neutral-400 dark:text-neutral-600" />
              <div className="h-4 w-3/4 rounded bg-neutral-200 dark:bg-neutral-800" />
              <div className="h-3 w-1/2 rounded bg-neutral-200 dark:bg-neutral-800" />
            </div>
          ))}
        </div>
      </div>

      {/* Interactive Presence & Reverification Overlay */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="integration-unlock-title"
        className="absolute inset-0 z-20 bg-black/65 flex items-center justify-center p-4"
      >
        <div className="w-full max-w-lg rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white shadow-2xl p-5 sm:p-6 space-y-5">
          {!isUnlockPromptConfirmed ? (
            <>
              <div className="flex items-start justify-between gap-3 border-b border-neutral-200 dark:border-neutral-800 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-mono text-amber-600 dark:text-amber-400">
                    <Lock className="w-3.5 h-3.5 shrink-0" />
                    <span>Session Verification Required</span>
                  </div>
                  <h1
                    id="integration-unlock-title"
                    className="text-lg sm:text-xl font-bold tracking-tight text-black dark:text-white text-balance"
                  >
                    Integration Session Locked
                  </h1>
                </div>
                <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-1" />
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <button
                  type="button"
                  onClick={onStartUnlock}
                  className="flex-1 min-h-[44px] py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors whitespace-nowrap shrink-0"
                >
                  <Unlock className="w-4 h-4" />
                  <span>Unlock Session</span>
                </button>
                {onBackToWorkspace && (
                  <button
                    type="button"
                    onClick={onBackToWorkspace}
                    className="min-h-[44px] py-2.5 px-4 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black hover:bg-neutral-100 dark:hover:bg-neutral-900 text-black dark:text-white text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Return to Workspace</span>
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3 border-b border-neutral-200 dark:border-neutral-800 pb-4">
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={onResetUnlockPrompt}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-500 hover:text-black dark:hover:text-white cursor-pointer mb-1"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    <span>Back</span>
                  </button>
                  <h1
                    id="integration-unlock-title"
                    className="text-base sm:text-lg font-bold text-black dark:text-white text-balance"
                  >
                    Re-verify Identity to Unlock Integration
                  </h1>
                  <p className="text-xs text-neutral-600 dark:text-neutral-400">
                    Confirm your User Email, Third-Party App Email, or OAuth identity to open the Integration console.
                  </p>
                </div>
                <Lock className="w-5 h-5 text-amber-500 shrink-0 mt-1" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onChangeProviderType('user')}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    providerType === 'user'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-neutral-50 dark:bg-neutral-950 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-800'
                  }`}
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>User Email</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeProviderType('third-party')}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    providerType === 'third-party'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-neutral-50 dark:bg-neutral-950 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-800'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Third-Party App Email</span>
                </button>
              </div>

              {gateStep === 'email' ? (
                <form onSubmit={onRequestEmailAccess} className="space-y-3 text-xs">
                  <div className="space-y-1">
                    <label className="font-semibold text-black dark:text-white block">
                      {providerType === 'user'
                        ? 'Workspace User Email'
                        : 'Third-Party Service / Developer Email'}
                    </label>
                    <input
                      type="email"
                      required
                      value={gateEmailInput}
                      onChange={(e) => onChangeGateEmailInput(e.target.value)}
                      placeholder={
                        providerType === 'user'
                          ? 'developer@workspace.dev'
                          : 'integrations@thirdparty-app.io'
                      }
                      className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 text-black dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {gateError && (
                    <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs">
                      {gateError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isVerifyingGate}
                    className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold cursor-pointer transition-colors"
                  >
                    {isVerifyingGate ? 'Preparing Email Dispatch...' : 'Send Verification Code to Email'}
                  </button>

                  <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 space-y-2">
                    <div className="text-[11px] text-center text-neutral-500 dark:text-neutral-400">
                      Or re-authenticate via OAuth to unlock Integration:
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={isVerifyingGate}
                        onClick={onGoogleOAuthConfirm}
                        className="py-2 px-3 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black hover:bg-neutral-50 dark:hover:bg-neutral-900 text-black dark:text-white font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                      >
                        <svg
                          version="1.1"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 48 48"
                          className="w-4 h-4 shrink-0"
                        >
                          <path
                            fill="#EA4335"
                            d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                          />
                          <path
                            fill="#4285F4"
                            d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                          />
                          <path
                            fill="#34A853"
                            d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                          />
                        </svg>
                        <span>Sign in with Google</span>
                      </button>
                      <button
                        type="button"
                        disabled={isVerifyingGate}
                        onClick={onGitHubOAuthConfirm}
                        className="py-2 px-3 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 hover:bg-neutral-100 dark:hover:bg-neutral-900 text-black dark:text-white font-semibold cursor-pointer"
                      >
                        Confirm with GitHub
                      </button>
                    </div>
                  </div>
                </form>
              ) : (
                <form onSubmit={onVerifyCodeAccess} className="space-y-3 text-xs">
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-mono text-[11px]">
                    {gateDispatchMessage ||
                      `A 6-digit verification code has been sent to ${gateEmailInput}. Check your email inbox and enter the code below.`}
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-black dark:text-white block">
                      Enter 6-Digit Code Sent to {gateEmailInput}
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      value={gateCodeInput}
                      onChange={(e) => onChangeGateCodeInput(e.target.value)}
                      placeholder="Enter 6-digit code from your email"
                      className="w-full px-3 py-2 text-center tracking-widest font-mono font-bold text-sm rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {gateError && (
                    <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs">
                      {gateError}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onChangeGateStep('email')}
                      className="px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 font-medium cursor-pointer"
                    >
                      Change Email
                    </button>
                    <button
                      type="button"
                      disabled={isVerifyingGate}
                      onClick={onOpenGmailSendConfirmModal}
                      className="px-3 py-2 rounded-xl border border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold cursor-pointer"
                    >
                      Resend Code
                    </button>
                    <button
                      type="submit"
                      disabled={isVerifyingGate}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer transition-colors"
                    >
                      {isVerifyingGate ? 'Verifying...' : 'Verify Code & Unlock'}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>

      {/* Mandatory User Confirmation Dialog before sending email via Gmail API */}
      {showGmailSendConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3">
          <div className="w-full max-w-md rounded-xl border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white p-4 space-y-3.5 shadow-2xl text-xs">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h3 className="text-sm font-bold">Confirm Sending Verification Email</h3>
              </div>
              <button
                type="button"
                onClick={onCloseGmailSendConfirmModal}
                className="p-1 rounded-lg text-neutral-500 hover:text-black dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-neutral-600 dark:text-neutral-300 leading-relaxed">
              Send a 6-digit Integration verification code email to{' '}
              <strong className="font-mono text-black dark:text-white">{gateEmailInput}</strong> via
              your connected Gmail account?
            </p>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onCloseGmailSendConfirmModal}
                className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isVerifyingGate}
                onClick={onConfirmSendGmailCode}
                className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold cursor-pointer"
              >
                {isVerifyingGate ? 'Sending...' : 'Confirm & Send Email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
