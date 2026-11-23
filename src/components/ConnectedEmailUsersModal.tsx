import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, RefreshCw, Check, Mail, Users, Plus } from 'lucide-react';
import {
  ConnectedEmailUser,
  User,
  fetchConnectedUsersByEmail,
} from '../firebase';

interface ConnectedEmailUsersModalProps {
  isOpen: boolean;
  email: string;
  currentUser: User | null;
  selectedPeerHandle: string;
  onClose: () => void;
  onSelectUser: (login: string) => Promise<void> | void;
  onConnectGitHub?: () => void;
}

export const ConnectedEmailUsersModal: React.FC<ConnectedEmailUsersModalProps> = ({
  isOpen,
  email,
  currentUser,
  selectedPeerHandle,
  onClose,
  onSelectUser,
  onConnectGitHub,
}) => {
  const [users, setUsers] = useState<ConnectedEmailUser[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [selectingLogin, setSelectingLogin] = useState<string>('');
  const [manualHandle, setManualHandle] = useState<string>('');

  const loadConnectedUsers = useCallback(async () => {
    if (!email && !currentUser) {
      setUsers([]);
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const found = await fetchConnectedUsersByEmail(email, currentUser);
      setUsers(found);
    } catch (err: any) {
      setError(err?.message || 'Unable to load @users connected to this email.');
    } finally {
      setIsLoading(false);
    }
  }, [email, currentUser]);

  useEffect(() => {
    if (isOpen) {
      void loadConnectedUsers();
    }
  }, [isOpen, loadConnectedUsers]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(''), 6000);
    return () => clearTimeout(timer);
  }, [error]);

  if (!isOpen || typeof document === 'undefined') {
    return null;
  }

  const handleChooseUser = async (login: string) => {
    const clean = login.trim().replace(/^@/, '');
    if (!clean) return;
    setSelectingLogin(clean);
    try {
      await onSelectUser(clean);
      onClose();
    } finally {
      setSelectingLogin('');
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = manualHandle.trim().replace(/^@/, '');
    if (!clean) return;
    setManualHandle('');
    await handleChooseUser(clean);
  };

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/70">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Connected Users for Signed-In Email"
        className="w-full max-w-md rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Users className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-bold leading-tight">
                @users Connected to Email
              </h2>
              <p className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400 truncate flex items-center gap-1 mt-0.5">
                <Mail className="w-3 h-3 shrink-0" />
                <span className="truncate">{email || 'Signed-in account'}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => void loadConnectedUsers()}
              disabled={isLoading}
              title="Refresh @users"
              className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-black dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-900 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 rounded-lg text-neutral-500 hover:text-black dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-900 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3 max-h-[65vh] overflow-y-auto">
          {error && (
            <div className="p-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-400 flex items-start justify-between gap-2">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setError('')}
                aria-label="Dismiss warning"
                className="p-0.5 shrink-0 text-current cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="py-8 flex flex-col items-center justify-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
              <RefreshCw className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
              <span>Looking up @users connected to {email}...</span>
            </div>
          ) : users.length === 0 ? (
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 space-y-2 text-center">
              <div className="text-xs font-semibold text-black dark:text-white">
                No public @users matched {email || 'this email'}
              </div>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                GitHub accounts with private email visibility will not appear in email search. Enter a contributor handle below or connect GitHub OAuth.
              </p>
              {onConnectGitHub && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onConnectGitHub();
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-900 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Connect GitHub Account
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {users.map((u) => {
                const isSelected =
                  selectedPeerHandle.toLowerCase() === u.login.toLowerCase();
                const isBusy = selectingLogin.toLowerCase() === u.login.toLowerCase();

                return (
                  <div
                    key={u.login}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                      isSelected
                        ? 'border-blue-500 bg-blue-500/5'
                        : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={u.avatarUrl}
                        alt={u.login}
                        className="w-8 h-8 rounded-full border border-neutral-200 dark:border-neutral-800 shrink-0"
                        referrerPolicy="no-referrer"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-xs font-mono font-bold text-black dark:text-white truncate">
                            @{u.login}
                          </span>
                          {u.name && u.name.toLowerCase() !== u.login.toLowerCase() && (
                            <span className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                              · {u.name}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                          {u.source}
                          {u.publicRepos > 0 ? ` · ${u.publicRepos} repos` : ''}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleChooseUser(u.login)}
                      disabled={isBusy}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-900 text-black dark:text-white'
                      }`}
                    >
                      {isSelected ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Selected</span>
                        </>
                      ) : isBusy ? (
                        <span>Selecting...</span>
                      ) : (
                        <span>Select</span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Manual @user select fallback */}
          <form
            onSubmit={handleManualSubmit}
            className="pt-2 border-t border-neutral-200 dark:border-neutral-800 flex items-center gap-2"
          >
            <input
              type="text"
              value={manualHandle}
              onChange={(e) => setManualHandle(e.target.value)}
              placeholder="Or select another @username..."
              className="flex-1 min-w-0 px-3 py-1.5 text-xs font-mono rounded-lg border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={!manualHandle.trim() || Boolean(selectingLogin)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Select</span>
            </button>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
};
