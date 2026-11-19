import React, { useEffect, useState } from 'react';
import {
  EmailAuthProvider,
  deleteUser,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import { Bell, Lock, LogOut, ShieldAlert, Trash2, User, Volume2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { UserProfile } from '../types';
import {
  deleteOwnAccountRecords,
  getUserProfile,
  updateUserPrivateSettings,
  updateUserProfile,
} from '../services/userService';
import { Avatar } from '../components/Avatar';
import { AvatarUploadCard } from '../components/AvatarUploadCard';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { sanitizeUsername } from '../utils/formatters';
import { formatUserFriendlyError } from '../lib/firestoreError';
import {
  isSoundVfxEnabled,
  playSound,
  setSoundVfxEnabled,
  subscribeSoundPreference,
} from '../utils/soundVfx';

interface SettingsPageProps {
  onLoggedOut: () => void;
}

export function SettingsPage({ onLoggedOut }: SettingsPageProps) {
  const {
    firebaseUser,
    profile,
    privateSettings,
    setProfile,
    setPrivateSettings,
    linkGoogleAccount,
    logout,
  } = useAuth();
  const { showToast } = useToast();

  // Account edit fields
  const [fullName, setFullName] = useState(profile?.fullName || '');
  const [username, setUsername] = useState(profile?.username || '');
  const [hostel, setHostel] = useState(profile?.hostel || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [savingAccount, setSavingAccount] = useState(false);

  // Password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Blocked profiles lookup
  const [blockedUsers, setBlockedUsers] = useState<UserProfile[]>([]);

  // Delete account modal
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [linkingGoogle, setLinkingGoogle] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => isSoundVfxEnabled());

  useEffect(() => {
    return subscribeSoundPreference(setSoundEnabled);
  }, []);

  useEffect(() => {
    if (profile) {
      setFullName(profile.fullName);
      setUsername(profile.username);
      setHostel(profile.hostel);
      setBio(profile.bio);
    }
  }, [profile]);

  useEffect(() => {
    const ids = privateSettings?.blockedUserIds || [];
    if (ids.length === 0) {
      setBlockedUsers([]);
      return;
    }
    Promise.all(ids.map((uid) => getUserProfile(uid)))
      .then((list) => setBlockedUsers(list.filter((u): u is UserProfile => Boolean(u))))
      .catch(() => {});
  }, [privateSettings?.blockedUserIds]);

  const hasPasswordProvider = Boolean(
    firebaseUser?.providerData.some((p) => p.providerId === 'password')
  );
  const hasGoogleProvider = Boolean(
    firebaseUser?.providerData.some((p) => p.providerId === 'google.com')
  );

  const handleLinkGoogle = async () => {
    setLinkingGoogle(true);
    try {
      await linkGoogleAccount();
      showToast({ type: 'success', title: 'Google account connected' });
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Could not connect Google account',
        description: formatUserFriendlyError(err),
      });
    } finally {
      setLinkingGoogle(false);
    }
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSavingAccount(true);
    try {
      const updated = await updateUserProfile(profile.uid, profile.usernameLower, {
        fullName,
        username: sanitizeUsername(username),
        hostel,
        bio,
      });
      setProfile(updated);
      showToast({ type: 'success', title: 'Account details updated' });
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Could not update account',
        description: formatUserFriendlyError(err),
      });
    } finally {
      setSavingAccount(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !firebaseUser.email) return;
    if (newPassword.length < 6) {
      showToast({ type: 'error', title: 'New password must be at least 6 characters' });
      return;
    }
    setChangingPassword(true);
    try {
      if (currentPassword) {
        const cred = EmailAuthProvider.credential(firebaseUser.email, currentPassword);
        await reauthenticateWithCredential(firebaseUser, cred);
      }
      await updatePassword(firebaseUser, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      showToast({ type: 'success', title: 'Password updated successfully' });
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Could not update password',
        description: formatUserFriendlyError(
          err,
          'Please verify your current password and try again.'
        ),
      });
    } finally {
      setChangingPassword(false);
    }
  };

  const handlePrivacyChange = async (mode: 'public' | 'followers') => {
    if (!profile || !privateSettings) return;
    try {
      const updated = await updateUserPrivateSettings(profile.uid, { privacyMode: mode });
      setPrivateSettings(updated);
      showToast({ type: 'success', title: 'Privacy preference saved' });
    } catch {
      showToast({ type: 'error', title: 'Could not update privacy setting' });
    }
  };

  const handleToggleNotify = async (
    field: 'notifyLikes' | 'notifyComments' | 'notifyFollows' | 'notifyMessages',
    nextVal: boolean
  ) => {
    if (!profile || !privateSettings) return;
    try {
      const updated = await updateUserPrivateSettings(profile.uid, { [field]: nextVal });
      setPrivateSettings(updated);
    } catch {
      showToast({ type: 'error', title: 'Could not update notification preference' });
    }
  };

  const handleUnblock = async (targetUid: string) => {
    if (!profile || !privateSettings) return;
    const nextIds = privateSettings.blockedUserIds.filter((id) => id !== targetUid);
    try {
      const updated = await updateUserPrivateSettings(profile.uid, { blockedUserIds: nextIds });
      setPrivateSettings(updated);
      showToast({ type: 'success', title: 'User unblocked' });
    } catch {
      showToast({ type: 'error', title: 'Could not unblock user' });
    }
  };

  const handleLogout = async () => {
    await logout();
    onLoggedOut();
  };

  const handleDeleteAccount = async () => {
    if (!firebaseUser || !profile) return;
    setDeletingAccount(true);
    try {
      await deleteOwnAccountRecords(profile.uid, profile.usernameLower);
      await deleteUser(firebaseUser);
      showToast({ type: 'info', title: 'Account permanently deleted' });
      onLoggedOut();
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Re-authentication required',
        description: formatUserFriendlyError(
          err,
          'Please log out and sign back in right before deleting your account.'
        ),
      });
    } finally {
      setDeletingAccount(false);
      setConfirmDeleteOpen(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-[#F8F9FA]">Settings</h1>
        <p className="text-xs text-[#A1A1AA] mt-0.5">
          Manage your account, security, privacy, notifications, and blocked members
        </p>
      </div>

      {/* Upload Your Avatar */}
      <AvatarUploadCard />

      {/* Edit Account */}
      <form
        onSubmit={handleSaveAccount}
        className="bg-[#151519] border border-white/[0.08] rounded-2xl p-6 space-y-4"
      >
        <div className="flex items-center gap-2.5 pb-2 border-b border-white/[0.06]">
          <User className="w-4 h-4 text-[#D4AF37]" />
          <h2 className="font-display text-base font-semibold text-[#F8F9FA]">Account Details</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block text-xs font-medium text-[#A1A1AA]">
            Full Name
            <input
              type="text"
              required
              maxLength={64}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1.5 w-full rounded-xl bg-[#0A0A0C] border border-white/10 px-3.5 py-2.5 text-sm text-[#F8F9FA] focus:outline-none focus:border-[#D4AF37]"
            />
          </label>
          <label className="block text-xs font-medium text-[#A1A1AA]">
            Username
            <input
              type="text"
              required
              minLength={3}
              maxLength={24}
              value={username}
              onChange={(e) => setUsername(sanitizeUsername(e.target.value))}
              className="mt-1.5 w-full rounded-xl bg-[#0A0A0C] border border-white/10 px-3.5 py-2.5 text-sm text-[#F8F9FA] focus:outline-none focus:border-[#D4AF37]"
            />
          </label>
        </div>

        <label className="block text-xs font-medium text-[#A1A1AA]">
          Hostel or Institution
          <input
            type="text"
            maxLength={80}
            value={hostel}
            onChange={(e) => setHostel(e.target.value)}
            className="mt-1.5 w-full rounded-xl bg-[#0A0A0C] border border-white/10 px-3.5 py-2.5 text-sm text-[#F8F9FA] focus:outline-none focus:border-[#D4AF37]"
          />
        </label>

        <label className="block text-xs font-medium text-[#A1A1AA]">
          Bio
          <textarea
            rows={2}
            maxLength={240}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="mt-1.5 w-full rounded-xl bg-[#0A0A0C] border border-white/10 px-3.5 py-2.5 text-sm text-[#F8F9FA] focus:outline-none focus:border-[#D4AF37] resize-none"
          />
        </label>

        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-[#71717A]">
            Account email: {privateSettings?.email || firebaseUser?.email}
          </span>
          <button
            type="submit"
            disabled={savingAccount}
            className="gold-gradient-btn px-5 py-2 rounded-xl text-xs font-semibold disabled:opacity-50"
          >
            {savingAccount ? 'Saving...' : 'Save Account'}
          </button>
        </div>
      </form>

      {/* Change Password */}
      <form
        onSubmit={handleChangePassword}
        className="bg-[#151519] border border-white/[0.08] rounded-2xl p-6 space-y-4"
      >
        <div className="flex items-center gap-2.5 pb-2 border-b border-white/[0.06]">
          <Lock className="w-4 h-4 text-[#D4AF37]" />
          <h2 className="font-display text-base font-semibold text-[#F8F9FA]">
            Password & Security
          </h2>
        </div>

        <div className="rounded-xl bg-[#0A0A0C] border border-white/[0.08] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-[#F8F9FA]">Google Account Connection</p>
            <p className="text-xs text-[#A1A1AA] mt-0.5">
              {hasGoogleProvider
                ? `Connected to ${firebaseUser?.email || 'your Google account'} for one-tap sign-in.`
                : 'Connect your Google account for effortless one-tap sign-in.'}
            </p>
          </div>
          {hasGoogleProvider ? (
            <span className="text-xs font-medium text-[#D4AF37] shrink-0">Connected</span>
          ) : (
            <button
              type="button"
              disabled={linkingGoogle}
              onClick={handleLinkGoogle}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-[#D4AF37]/40 text-[#F8F9FA] hover:border-[#D4AF37] hover:bg-white/[0.04] disabled:opacity-50 shrink-0"
            >
              {linkingGoogle ? 'Connecting...' : 'Connect Google Account'}
            </button>
          )}
        </div>

        {!hasPasswordProvider ? (
          <p className="text-xs text-[#A1A1AA] leading-relaxed">
            You sign in using Google Authentication. Your password is managed securely through your
            Google Account.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block text-xs font-medium text-[#A1A1AA]">
              Current Password
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="mt-1.5 w-full rounded-xl bg-[#0A0A0C] border border-white/10 px-3.5 py-2.5 text-sm text-[#F8F9FA] focus:outline-none focus:border-[#D4AF37]"
              />
            </label>
            <label className="block text-xs font-medium text-[#A1A1AA]">
              New Password
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1.5 w-full rounded-xl bg-[#0A0A0C] border border-white/10 px-3.5 py-2.5 text-sm text-[#F8F9FA] focus:outline-none focus:border-[#D4AF37]"
              />
            </label>
          </div>
        )}

        {hasPasswordProvider && (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={changingPassword}
              className="px-5 py-2 rounded-xl text-xs font-semibold border border-white/15 text-[#F8F9FA] hover:border-[#D4AF37]/40 disabled:opacity-50"
            >
              {changingPassword ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        )}
      </form>

      {/* Privacy & Notification Preferences */}
      <div className="bg-[#151519] border border-white/[0.08] rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-2.5 pb-2 border-b border-white/[0.06]">
          <Bell className="w-4 h-4 text-[#D4AF37]" />
          <h2 className="font-display text-base font-semibold text-[#F8F9FA]">
            Privacy & Notifications
          </h2>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-[#F8F9FA]">Profile Discovery Mode</p>
            <p className="text-xs text-[#A1A1AA]">
              Choose who can interact directly with your account
            </p>
          </div>
          <div className="inline-flex p-1 bg-[#0A0A0C] rounded-xl border border-white/10 self-start">
            <button
              type="button"
              onClick={() => handlePrivacyChange('public')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                privateSettings?.privacyMode !== 'followers'
                  ? 'bg-[#D4AF37] text-[#0A0A0C]'
                  : 'text-[#A1A1AA]'
              }`}
            >
              Public Campus
            </button>
            <button
              type="button"
              onClick={() => handlePrivacyChange('followers')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                privateSettings?.privacyMode === 'followers'
                  ? 'bg-[#D4AF37] text-[#0A0A0C]'
                  : 'text-[#A1A1AA]'
              }`}
            >
              Followers Only
            </button>
          </div>
        </div>

        <div className="space-y-3 pt-2 border-t border-white/[0.06]">
          {(
            [
              { key: 'notifyLikes', label: 'Likes on your posts' },
              { key: 'notifyComments', label: 'New comments & replies' },
              { key: 'notifyFollows', label: 'New followers' },
              { key: 'notifyMessages', label: 'Direct message alerts' },
            ] as const
          ).map((item) => {
            const checked = privateSettings ? privateSettings[item.key] : true;
            return (
              <label
                key={item.key}
                className="flex items-center justify-between gap-4 cursor-pointer py-1"
              >
                <span className="text-sm text-[#F8F9FA]">{item.label}</span>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => handleToggleNotify(item.key, e.target.checked)}
                  className="w-4 h-4 accent-[#D4AF37]"
                />
              </label>
            );
          })}

          <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Volume2 className="w-4 h-4 text-[#D4AF37] shrink-0" />
              <div>
                <p className="text-sm text-[#F8F9FA]">Sound Effects (VFX)</p>
                <p className="text-xs text-[#A1A1AA]">
                  Subtle chimes for notifications, messages, uploads, likes, and comments
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (!soundEnabled) setSoundVfxEnabled(true);
                  playSound('notification');
                }}
                className="px-2.5 py-1 rounded-lg text-xs font-medium border border-white/10 text-[#A1A1AA] hover:text-[#F8F9FA] hover:border-[#D4AF37]/40 transition-colors"
              >
                Test
              </button>
              <input
                type="checkbox"
                aria-label="Enable Sound Effects (VFX)"
                checked={soundEnabled}
                onChange={(e) => setSoundVfxEnabled(e.target.checked)}
                className="w-4 h-4 accent-[#D4AF37] cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Blocked Users */}
      <div className="bg-[#151519] border border-white/[0.08] rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2.5 pb-2 border-b border-white/[0.06]">
          <ShieldAlert className="w-4 h-4 text-[#D4AF37]" />
          <h2 className="font-display text-base font-semibold text-[#F8F9FA]">Blocked Members</h2>
        </div>

        {blockedUsers.length === 0 ? (
          <p className="text-xs text-[#71717A]">You have not blocked any members.</p>
        ) : (
          <div className="space-y-3">
            {blockedUsers.map((u) => (
              <div key={u.uid} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar src={u.avatarUrl} name={u.fullName} size="sm" />
                  <div>
                    <p className="text-sm font-medium text-[#F8F9FA]">{u.fullName}</p>
                    <p className="text-xs text-[#A1A1AA]">@{u.username}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleUnblock(u.uid)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 text-[#F8F9FA] hover:border-[#D4AF37]/40"
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Session & Account Deletion */}
      <div className="bg-[#151519] border border-white/[0.08] rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button
          type="button"
          onClick={handleLogout}
          className="px-4 py-2.5 rounded-xl text-xs font-semibold border border-white/15 text-[#F8F9FA] hover:bg-white/[0.04] inline-flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          <span>Log Out</span>
        </button>

        <button
          type="button"
          onClick={() => setConfirmDeleteOpen(true)}
          className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 inline-flex items-center justify-center gap-2"
        >
          <Trash2 className="w-4 h-4" />
          <span>Delete Account</span>
        </button>
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Permanently delete your account?"
        description="Your profile, username reservation, and private settings will be permanently erased. This cannot be undone."
        confirmLabel="Delete My Account"
        destructive
        loading={deletingAccount}
        onConfirm={handleDeleteAccount}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </div>
  );
}
