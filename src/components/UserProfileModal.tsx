import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Camera,
  Upload,
  Download,
  Building2,
  MapPin,
  Link2,
  LogOut,
  Check,
  RefreshCw,
  Trash2,
  User as UserIcon,
  ChevronDown,
} from 'lucide-react';
import {
  NerveUserProfile,
  User,
  ConnectedEmailUser,
  ProfileSyncPlatform,
  fetchConnectedUsersByEmail,
  verifyAndPullPlatformProfile,
} from '../firebase';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: NerveUserProfile;
  email: string;
  currentUser?: User | null;
  onSaveProfile: (nextProfile: NerveUserProfile) => Promise<void> | void;
  onLogout: () => Promise<void> | void;
}

async function resizeImageToAvatarDataUrl(file: File, size = 160): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Unable to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Unsupported image format.'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Unable to process image.'));
          return;
        }
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        try {
          const webp = canvas.toDataURL('image/webp', 0.85);
          resolve(webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.85));
        } catch {
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        }
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  profile,
  email,
  currentUser,
  onSaveProfile,
  onLogout,
}) => {
  const [draft, setDraft] = useState<NerveUserProfile>(profile);
  const [platformLookup, setPlatformLookup] = useState<ProfileSyncPlatform>('bitbucket');
  const [isPlatformDropdownOpen, setIsPlatformDropdownOpen] = useState<boolean>(false);
  const [usernameLookupInput, setUsernameLookupInput] = useState<string>('');
  const [showPhotoUrlInput, setShowPhotoUrlInput] = useState<boolean>(false);
  const [photoUrlDraft, setPhotoUrlDraft] = useState<string>('');
  const [isPullingProfile, setIsPullingProfile] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [detectedGitHubAccounts, setDetectedGitHubAccounts] = useState<ConnectedEmailUser[]>([]);
  const [isDetectingGitHub, setIsDetectingGitHub] = useState<boolean>(false);
  const [dismissedGitHubSuggestion, setDismissedGitHubSuggestion] = useState<boolean>(false);
  const [statusNotice, setStatusNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const platformDropdownRef = useRef<HTMLDivElement | null>(null);
  const wasOpenRef = useRef<boolean>(false);

  // Only initialize/reset fields once when the modal transitions from closed -> open
  // so background telemetry/network re-renders in App.tsx never auto-close the dropdown or wipe unsaved edits.
  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;

    setDraft(profile);
    setPlatformLookup('bitbucket');
    setIsPlatformDropdownOpen(false);
    setUsernameLookupInput('');
    setPhotoUrlDraft(
      profile.avatarUrl && !profile.avatarUrl.startsWith('data:') ? profile.avatarUrl : ''
    );
    setShowPhotoUrlInput(false);
    setDismissedGitHubSuggestion(false);
    setStatusNotice(null);
  }, [isOpen, profile]);

  // Auto-detect GitHub account(s) linked to the signed-in email without overwriting manual fields
  useEffect(() => {
    if (!isOpen || !email.trim()) {
      setDetectedGitHubAccounts([]);
      setIsDetectingGitHub(false);
      return;
    }
    let cancelled = false;
    setIsDetectingGitHub(true);
    fetchConnectedUsersByEmail(email, currentUser)
      .then((accounts) => {
        if (!cancelled) {
          setDetectedGitHubAccounts(accounts);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDetectedGitHubAccounts([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsDetectingGitHub(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, email, currentUser]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isPlatformDropdownOpen) {
          setIsPlatformDropdownOpen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, isPlatformDropdownOpen, onClose]);

  useEffect(() => {
    if (!isPlatformDropdownOpen) return;
    const handlePointerDownOutside = (e: PointerEvent) => {
      if (
        platformDropdownRef.current &&
        !platformDropdownRef.current.contains(e.target as Node)
      ) {
        setIsPlatformDropdownOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDownOutside);
    return () => document.removeEventListener('pointerdown', handlePointerDownOutside);
  }, [isPlatformDropdownOpen]);

  // Auto-dismiss any profile warning or notification after 6 seconds
  useEffect(() => {
    if (!statusNotice) return;
    const timer = setTimeout(() => setStatusNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [statusNotice]);

  if (!isOpen || typeof document === 'undefined') return null;

  const PLATFORM_DISPLAY_NAMES: Record<ProfileSyncPlatform, string> = {
    github: 'GitHub',
    bitbucket: 'Bitbucket',
    gitlab: 'GitLab',
    codeberg: 'Codeberg',
    gitea: 'Gitea',
  };

  const handlePullPlatformProfile = async (
    e?: React.FormEvent,
    handleOverride?: string,
    platformOverride?: ProfileSyncPlatform
  ) => {
    if (e) e.preventDefault();
    const targetPlatform: ProfileSyncPlatform = platformOverride || platformLookup;
    const platformName = PLATFORM_DISPLAY_NAMES[targetPlatform];
    const cleanHandle = (handleOverride ?? usernameLookupInput).trim().replace(/^@/, '');
    if (!cleanHandle) {
      setStatusNotice({ type: 'error', text: `Enter a @username to fetch from ${platformName}.` });
      return;
    }
    if (!email.trim()) {
      setStatusNotice({
        type: 'error',
        text: `Profile sync requires a signed-in email address matching your ${platformName} account.`,
      });
      return;
    }

    setIsPullingProfile(true);
    setStatusNotice(null);
    try {
      const pulled = await verifyAndPullPlatformProfile(targetPlatform, cleanHandle, email, currentUser);
      setDraft((prev) => ({
        ...prev,
        ...pulled,
        pronouns: prev.pronouns || pulled.pronouns,
      }));
      if (!handleOverride) {
        setUsernameLookupInput(pulled.githubHandle);
      }
      setPhotoUrlDraft(pulled.avatarUrl);
      if (targetPlatform === 'github') {
        setDismissedGitHubSuggestion(true);
      }
      setStatusNotice({
        type: 'success',
        text: `Verified email match & pulled @${pulled.githubHandle} from ${platformName}. Edit any field or click Save profile.`,
      });
    } catch (err: any) {
      setStatusNotice({
        type: 'error',
        text:
          err?.message ||
          `${platformName} profile sync blocked: your signed-in email (${email}) must match @${cleanHandle}.`,
      });
    } finally {
      setIsPullingProfile(false);
    }
  };

  const handleUploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStatusNotice({ type: 'error', text: 'Please select an image file (PNG, JPG, WebP).' });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setStatusNotice({ type: 'error', text: 'Image must be smaller than 8 MB.' });
      return;
    }
    try {
      const dataUrl = await resizeImageToAvatarDataUrl(file, 160);
      setDraft((prev) => ({ ...prev, avatarUrl: dataUrl }));
      setStatusNotice({
        type: 'success',
        text: 'Profile picture updated in preview. Click Save profile to keep it.',
      });
    } catch (err: any) {
      setStatusNotice({ type: 'error', text: err?.message || 'Failed to process image.' });
    } finally {
      e.target.value = '';
    }
  };

  const handleApplyPhotoUrl = () => {
    const trimmed = photoUrlDraft.trim();
    if (!trimmed) return;
    if (!/^https?:\/\//i.test(trimmed)) {
      setStatusNotice({ type: 'error', text: 'Photo URL must start with https:// or http://' });
      return;
    }
    setDraft((prev) => ({ ...prev, avatarUrl: trimmed.slice(0, 500) }));
    setShowPhotoUrlInput(false);
    setStatusNotice({
      type: 'success',
      text: 'Photo URL applied. Click Save profile to save.',
    });
  };

  const handleSubmitProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedDisplayName = draft.displayName.trim();
    if (!cleanedDisplayName) {
      setStatusNotice({ type: 'error', text: 'Display name is required.' });
      return;
    }
    const rawWebsite = draft.website.trim();
    let normalizedWebsite = '';
    if (rawWebsite) {
      if (/^https?:\/\/.+/i.test(rawWebsite)) {
        normalizedWebsite = rawWebsite;
      } else if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/.*)?$/.test(rawWebsite)) {
        normalizedWebsite = `https://${rawWebsite}`;
      } else {
        setStatusNotice({
          type: 'error',
          text: 'Website URL must start with https:// or http://',
        });
        return;
      }
    }

    setIsSaving(true);
    setStatusNotice(null);
    try {
      await onSaveProfile({
        ...draft,
        displayName: cleanedDisplayName.slice(0, 120),
        githubHandle: draft.githubHandle.trim().replace(/^@/, '').slice(0, 80),
        bio: draft.bio.trim().slice(0, 300),
        company: draft.company.trim().slice(0, 120),
        location: draft.location.trim().slice(0, 120),
        website: normalizedWebsite.slice(0, 240),
        pronouns: draft.pronouns.trim().slice(0, 40),
        updatedAt: new Date().toISOString(),
      });
      setStatusNotice({ type: 'success', text: 'Profile saved to Nerve.' });
      setTimeout(() => onClose(), 450);
    } catch (err: any) {
      setStatusNotice({
        type: 'error',
        text: err?.message || 'Unable to save profile.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const avatarInitial = (draft.displayName[0] || draft.githubHandle[0] || email[0] || 'N').toUpperCase();

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Profile settings"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-[#1f2328] dark:text-[#e6edf3] shadow-2xl overflow-hidden my-auto"
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#161b22] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <UserIcon className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold truncate">Public Profile</h2>
              <p className="text-[11px] text-[#656d76] dark:text-[#8b949e] truncate">
                Import your Git, Bitbucket, GitLab, Codeberg, or Gitea profile into Nerve
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile settings"
            className="p-1.5 rounded-md text-[#656d76] dark:text-[#8b949e] hover:text-[#1f2328] dark:hover:text-[#e6edf3] hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-4 sm:space-y-5">
          {/* Same-Email Profile Sync (GitHub auto-detected; Bitbucket & other platforms via @username) */}
          <form
            onSubmit={(e) => handlePullPlatformProfile(e)}
            className="p-3 sm:p-3.5 rounded-lg border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#161b22] space-y-2"
          >
            {/* Auto-detected GitHub account linked to the signed-in email (dismissible) */}
            {!dismissedGitHubSuggestion && isDetectingGitHub && (
              <div className="flex items-center gap-2 text-[11px] text-[#656d76] dark:text-[#8b949e]">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>Checking for a GitHub account linked to {email}...</span>
              </div>
            )}

            {!dismissedGitHubSuggestion && detectedGitHubAccounts.length > 0 && (
              <div className="p-2.5 rounded-md border border-blue-500/30 bg-blue-500/5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                    GitHub account detected for {email}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDismissedGitHubSuggestion(true)}
                    title="Dismiss GitHub suggestion and fill manually"
                    className="text-[11px] text-[#656d76] dark:text-[#8b949e] hover:text-[#1f2328] dark:hover:text-[#e6edf3] inline-flex items-center gap-0.5 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                    <span>Discard</span>
                  </button>
                </div>
                <div className="space-y-1.5">
                  {detectedGitHubAccounts.map((acc) => (
                    <div
                      key={acc.login}
                      className="flex items-center justify-between gap-2 p-2 rounded border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117]"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <img
                          src={acc.avatarUrl}
                          alt={acc.login}
                          className="w-7 h-7 rounded-full object-cover border border-[#d0d7de] dark:border-[#30363d] shrink-0"
                          referrerPolicy="no-referrer"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[#1f2328] dark:text-[#e6edf3] truncate">
                            {acc.name || acc.login}
                          </div>
                          <div className="text-[11px] font-mono text-[#656d76] dark:text-[#8b949e] truncate">
                            @{acc.login}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={isPullingProfile}
                        onClick={() => handlePullPlatformProfile(undefined, acc.login, 'github')}
                        className="px-2.5 py-1 rounded text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 transition-colors"
                      >
                        <Download className="w-3 h-3" />
                        <span>Pull Profile</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[11px] text-[#656d76] dark:text-[#8b949e] leading-snug">
              {email
                ? `Enter your @username below — only accounts using ${email} can sync.`
                : 'Sign in with an email address matching your developer account to sync a profile.'}
            </p>
            <div className="flex items-start gap-1.5 w-full min-w-0">
              {/* Width-matched inline push-down platform dropdown (shifts profile picture & sections below down while open) */}
              <div ref={platformDropdownRef} className="w-[92px] sm:w-[104px] shrink-0">
                <button
                  type="button"
                  onClick={() => setIsPlatformDropdownOpen((open) => !open)}
                  aria-haspopup="listbox"
                  aria-expanded={isPlatformDropdownOpen}
                  aria-label="Select developer platform"
                  className="w-full h-8 px-2 text-[11px] sm:text-xs font-medium rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-[#1f2328] dark:text-[#e6edf3] focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer flex items-center justify-between gap-1"
                >
                  <span className="truncate">{PLATFORM_DISPLAY_NAMES[platformLookup]}</span>
                  <ChevronDown
                    className={`w-3 h-3 shrink-0 text-[#656d76] dark:text-[#8b949e] transition-transform ${
                      isPlatformDropdownOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {isPlatformDropdownOpen && (
                  <div
                    role="listbox"
                    aria-label="Developer platforms"
                    className="mt-1 w-full rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] py-0.5 overflow-hidden"
                  >
                    {(['bitbucket', 'gitlab', 'codeberg', 'gitea', 'github'] as ProfileSyncPlatform[])
                      .filter((p) => p !== platformLookup)
                      .map((platformKey) => (
                        <button
                          key={platformKey}
                          type="button"
                          role="option"
                          aria-selected={false}
                          onClick={() => {
                            setPlatformLookup(platformKey);
                            setIsPlatformDropdownOpen(false);
                          }}
                          className="w-full px-2 py-1.5 text-left text-[11px] sm:text-xs font-medium text-[#1f2328] dark:text-[#e6edf3] hover:bg-[#f6f8fa] dark:hover:bg-[#161b22] cursor-pointer truncate block transition-colors"
                        >
                          {PLATFORM_DISPLAY_NAMES[platformKey]}
                        </button>
                      ))}
                  </div>
                )}
              </div>
              <div className="relative flex-1 min-w-0">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] sm:text-xs font-mono text-[#656d76] dark:text-[#8b949e] pointer-events-none">
                  @
                </span>
                <input
                  type="text"
                  autoComplete="off"
                  value={usernameLookupInput}
                  onChange={(e) => setUsernameLookupInput(e.target.value)}
                  placeholder="username"
                  aria-label="Platform username to fetch"
                  className="w-full h-8 pl-5 pr-2 text-[11px] sm:text-xs font-mono rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-[#1f2328] dark:text-[#e6edf3] placeholder:text-[#656d76] focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={isPullingProfile || !usernameLookupInput.trim() || !email.trim()}
                className="h-8 px-2.5 sm:px-3 rounded-md text-[11px] sm:text-xs font-semibold bg-[#21262d] dark:bg-[#30363d] hover:bg-blue-600 disabled:opacity-50 text-white flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap shrink-0 transition-colors"
              >
                {isPullingProfile ? (
                  <RefreshCw className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                )}
                <span className="sm:hidden">{isPullingProfile ? '...' : 'Pull'}</span>
                <span className="hidden sm:inline">{isPullingProfile ? 'Verifying...' : 'Pull Profile'}</span>
              </button>
            </div>
          </form>

          {statusNotice && (
            <div
              className={`px-3 py-2 rounded-md border text-xs flex items-start justify-between gap-2 ${
                statusNotice.type === 'success'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-300'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {statusNotice.type === 'success' && <Check className="w-3.5 h-3.5 shrink-0" />}
                <span>{statusNotice.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setStatusNotice(null)}
                aria-label="Dismiss notification"
                className="p-0.5 shrink-0 text-current cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* GitHub-Style 2-Column Public Profile Editor */}
          <form id="nerve-profile-form" onSubmit={handleSubmitProfile} className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-6">
            {/* Left: Editable Profile Fields */}
            <div className="space-y-3.5 order-2 md:order-1">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[#1f2328] dark:text-[#e6edf3]">
                  Name
                </label>
                <input
                  type="text"
                  required
                  autoComplete="off"
                  maxLength={120}
                  value={draft.displayName}
                  onChange={(e) => setDraft((prev) => ({ ...prev, displayName: e.target.value }))}
                  placeholder="Your display name"
                  className="w-full px-3 py-1.5 text-xs rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-[#1f2328] dark:text-[#e6edf3] focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-[#1f2328] dark:text-[#e6edf3]">
                    Handle
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-mono text-[#656d76] dark:text-[#8b949e] pointer-events-none">
                      @
                    </span>
                    <input
                      type="text"
                      autoComplete="off"
                      maxLength={80}
                      value={draft.githubHandle}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          githubHandle: e.target.value.replace(/^@/, ''),
                          syncedFromGitHub: false,
                        }))
                      }
                      placeholder="username"
                      className="w-full pl-6 pr-2.5 py-1.5 text-xs font-mono rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-[#1f2328] dark:text-[#e6edf3] focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-[#1f2328] dark:text-[#e6edf3]">
                    Pronouns
                  </label>
                  <input
                    type="text"
                    maxLength={40}
                    value={draft.pronouns}
                    onChange={(e) => setDraft((prev) => ({ ...prev, pronouns: e.target.value }))}
                    placeholder="e.g. they/them"
                    className="w-full px-3 py-1.5 text-xs rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-[#1f2328] dark:text-[#e6edf3] focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-[#1f2328] dark:text-[#e6edf3]">
                    Bio
                  </label>
                  <span className="text-[11px] font-mono text-[#656d76] dark:text-[#8b949e] tabular-nums">
                    {draft.bio.length}/300
                  </span>
                </div>
                <textarea
                  rows={3}
                  maxLength={300}
                  value={draft.bio}
                  onChange={(e) => setDraft((prev) => ({ ...prev, bio: e.target.value }))}
                  placeholder="Tell teammates a little bit about yourself"
                  className="w-full px-3 py-2 text-xs rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-[#1f2328] dark:text-[#e6edf3] focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-[#1f2328] dark:text-[#e6edf3]">
                    Company
                  </label>
                  <div className="relative">
                    <Building2 className="w-3.5 h-3.5 text-[#656d76] dark:text-[#8b949e] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      maxLength={120}
                      value={draft.company}
                      onChange={(e) => setDraft((prev) => ({ ...prev, company: e.target.value }))}
                      placeholder="Organization"
                      className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-[#1f2328] dark:text-[#e6edf3] focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-[#1f2328] dark:text-[#e6edf3]">
                    Location
                  </label>
                  <div className="relative">
                    <MapPin className="w-3.5 h-3.5 text-[#656d76] dark:text-[#8b949e] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      maxLength={120}
                      value={draft.location}
                      onChange={(e) => setDraft((prev) => ({ ...prev, location: e.target.value }))}
                      placeholder="City, Country"
                      className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-[#1f2328] dark:text-[#e6edf3] focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[#1f2328] dark:text-[#e6edf3]">
                  Website / URL
                </label>
                <div className="relative">
                  <Link2 className="w-3.5 h-3.5 text-[#656d76] dark:text-[#8b949e] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    maxLength={240}
                    value={draft.website}
                    onChange={(e) => setDraft((prev) => ({ ...prev, website: e.target.value }))}
                    placeholder="https://your-site.dev"
                    className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-[#1f2328] dark:text-[#e6edf3] focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {email && (
                <div className="pt-1 text-[11px] text-[#656d76] dark:text-[#8b949e] flex items-center justify-between border-t border-[#d0d7de] dark:border-[#30363d]">
                  <span>Signed in email</span>
                  <span className="font-mono text-[#1f2328] dark:text-[#e6edf3] truncate max-w-[220px]">
                    {email}
                  </span>
                </div>
              )}
            </div>

            {/* Right: GitHub-Style Profile Picture & Live Card Preview */}
            <div className="space-y-3 order-1 md:order-2 flex flex-col items-center md:items-start">
              <div className="text-xs font-semibold text-[#1f2328] dark:text-[#e6edf3] self-start">
                Profile picture
              </div>

              <div className="relative group">
                {draft.avatarUrl ? (
                  <img
                    src={draft.avatarUrl}
                    alt={draft.displayName || 'Profile avatar'}
                    className="w-28 h-28 rounded-full object-cover border-2 border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#161b22]"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-28 h-28 rounded-full border-2 border-[#d0d7de] dark:border-[#30363d] bg-blue-600 text-white flex items-center justify-center text-3xl font-bold select-none">
                    {avatarInitial}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload a profile photo"
                  className="absolute bottom-0.5 left-0.5 px-2 py-1 rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#161b22] text-[11px] font-medium text-[#1f2328] dark:text-[#e6edf3] shadow-sm hover:border-blue-500 flex items-center gap-1 cursor-pointer"
                >
                  <Camera className="w-3 h-3" />
                  <span>Edit</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleUploadPhoto}
                  className="hidden"
                />
              </div>

              {/* Photo Actions */}
              <div className="w-full space-y-1.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full px-2.5 py-1.5 rounded-md text-xs font-medium border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#161b22] hover:border-blue-500 text-[#1f2328] dark:text-[#e6edf3] flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload a photo</span>
                </button>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowPhotoUrlInput((v) => !v)}
                    className="flex-1 px-2 py-1 rounded-md text-[11px] font-medium border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] hover:border-blue-500 text-[#656d76] dark:text-[#8b949e] hover:text-[#1f2328] dark:hover:text-[#e6edf3] cursor-pointer"
                  >
                    Photo URL
                  </button>
                  {draft.avatarUrl && draft.avatarUrl.startsWith('data:image/') && (
                    <button
                      type="button"
                      onClick={() => setDraft((prev) => ({ ...prev, avatarUrl: '' }))}
                      title="Remove uploaded profile picture"
                      className="px-2 py-1 rounded-md text-[11px] font-medium border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] hover:border-red-500 text-[#656d76] hover:text-red-600 dark:hover:text-red-400 flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Remove</span>
                    </button>
                  )}
                </div>

                {showPhotoUrlInput && (
                  <div className="flex items-center gap-1 pt-0.5">
                    <input
                      type="url"
                      value={photoUrlDraft}
                      onChange={(e) => setPhotoUrlDraft(e.target.value)}
                      placeholder="https://..."
                      className="flex-1 min-w-0 px-2 py-1 text-[11px] rounded border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-[#1f2328] dark:text-[#e6edf3] focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={handleApplyPhotoUrl}
                      className="px-2 py-1 rounded text-[11px] font-semibold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer shrink-0"
                    >
                      Set
                    </button>
                  </div>
                )}
              </div>
            </div>
          </form>
        </div>

        {/* Footer with Logout + Save */}
        <div className="px-5 py-3 border-t border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#161b22] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={async () => {
              await onLogout();
              onClose();
            }}
            className="px-3 py-1.5 rounded-md text-xs font-semibold border border-red-500/40 bg-red-500/10 hover:bg-red-600 text-red-600 dark:text-red-400 hover:text-white flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Log out</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-xs font-medium border border-[#d0d7de] dark:border-[#30363d] bg-white dark:bg-[#21262d] text-[#1f2328] dark:text-[#e6edf3] hover:bg-[#f3f4f6] dark:hover:bg-[#30363d] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="nerve-profile-form"
              disabled={isSaving}
              className="px-3.5 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Saving...' : 'Save profile'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
