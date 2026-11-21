import React, { useEffect, useRef, useState } from 'react';
import {
  ConfirmationResult,
  EmailAuthProvider,
  RecaptchaVerifier,
  deleteUser,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import { Bell, BellRing, Lock, LogOut, Phone, ShieldAlert, Trash2, User, Volume2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { auth } from '../lib/firebase';
import { NotificationPreferences, UserProfile } from '../types';
import {
  deleteOwnAccountRecords,
  getUserProfile,
  updateUserPrivateSettings,
  updateUserProfile,
} from '../services/userService';
import { updateNotificationPreferences } from '../services/notificationService';
import {
  getBrowserNotificationPermission,
  getPushSupportState,
  PushSupportState,
  unregisterCurrentFcmToken,
} from '../services/fcmService';
import { Avatar } from '../components/Avatar';
import { AvatarUploadCard } from '../components/AvatarUploadCard';
import { CoverUploadCard } from '../components/CoverUploadCard';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { sanitizeUsername } from '../utils/formatters';
import { formatUserFriendlyError } from '../lib/firestoreError';
import {
  COUNTRY_DIAL_CODES,
  mapPhoneAuthError,
  normalizePhoneToE164,
} from '../utils/phoneAuth';
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
    notificationPreferences,
    setProfile,
    setPrivateSettings,
    setNotificationPreferences,
    enablePushNotifications,
    linkGoogleAccount,
    sendLinkPhoneOtp,
    confirmLinkPhoneOtp,
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

  // Phone verification linking
  const [showPhoneLinkForm, setShowPhoneLinkForm] = useState(false);
  const [phoneDialCode, setPhoneDialCode] = useState('+92');
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneOtpCode, setPhoneOtpCode] = useState('');
  const [phoneConfirmation, setPhoneConfirmation] = useState<ConfirmationResult | null>(null);
  const [sentLinkPhone, setSentLinkPhone] = useState('');
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const settingsRecaptchaRef = useRef<HTMLDivElement | null>(null);
  const settingsRecaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  const [soundEnabled, setSoundEnabled] = useState(() => isSoundVfxEnabled());
  const [pushSupport, setPushSupport] = useState<PushSupportState>('supported');
  const [pushBusy, setPushBusy] = useState(false);
  const [browserPerm, setBrowserPerm] = useState<NotificationPermission | 'unsupported'>(() =>
    getBrowserNotificationPermission()
  );

  const clearSettingsRecaptcha = () => {
    if (settingsRecaptchaVerifierRef.current) {
      try {
        settingsRecaptchaVerifierRef.current.clear();
      } catch {
        // Ignore teardown errors
      }
      settingsRecaptchaVerifierRef.current = null;
    }
    if (settingsRecaptchaRef.current) {
      settingsRecaptchaRef.current.innerHTML = '';
    }
  };

  useEffect(() => {
    getPushSupportState().then(setPushSupport);
    setBrowserPerm(getBrowserNotificationPermission());
    const unsubSound = subscribeSoundPreference(setSoundEnabled);
    return () => {
      unsubSound();
      clearSettingsRecaptcha();
    };
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
  const verifiedPhone = firebaseUser?.phoneNumber || '';

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

  const handleSendLinkPhoneCode = async () => {
    setPhoneError('');
    const normalized = normalizePhoneToE164(phoneInput, phoneDialCode);
    if (!normalized) {
      setPhoneError('Enter a valid mobile number (e.g., 0300 1234567 or +923001234567).');
      return;
    }
    setPhoneBusy(true);
    try {
      clearSettingsRecaptcha();
      if (!settingsRecaptchaRef.current) {
        throw new Error('Verification container is not ready. Please try again.');
      }
      const verifier = new RecaptchaVerifier(auth, settingsRecaptchaRef.current, {
        size: 'invisible',
        'expired-callback': () => clearSettingsRecaptcha(),
      });
      await verifier.render();
      settingsRecaptchaVerifierRef.current = verifier;
      const result = await sendLinkPhoneOtp(normalized, verifier);
      setPhoneConfirmation(result);
      setSentLinkPhone(normalized);
      setPhoneOtpCode('');
      showToast({ type: 'success', title: 'Verification SMS sent' });
    } catch (err) {
      clearSettingsRecaptcha();
      setPhoneError(mapPhoneAuthError(err));
    } finally {
      setPhoneBusy(false);
    }
  };

  const handleConfirmLinkPhoneCode = async () => {
    if (!phoneConfirmation) return;
    setPhoneError('');
    const cleanCode = phoneOtpCode.replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      setPhoneError('Please enter the 6-digit SMS code.');
      return;
    }
    setPhoneBusy(true);
    try {
      await confirmLinkPhoneOtp(phoneConfirmation, cleanCode);
      clearSettingsRecaptcha();
      setPhoneConfirmation(null);
      setShowPhoneLinkForm(false);
      setPhoneInput('');
      setPhoneOtpCode('');
      showToast({ type: 'success', title: 'Phone number verified and linked' });
    } catch (err) {
      setPhoneError(mapPhoneAuthError(err));
    } finally {
      setPhoneBusy(false);
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

  const handleTogglePreference = async (
    field: keyof Omit<NotificationPreferences, 'uid' | 'updatedAt' | 'pushEnabled'>,
    nextVal: boolean
  ) => {
    if (!profile) return;
    try {
      const updated = await updateNotificationPreferences(profile.uid, { [field]: nextVal });
      setNotificationPreferences(updated);
    } catch {
      showToast({ type: 'error', title: 'Could not update notification preference' });
    }
  };

  const handleTogglePushNotifications = async (nextEnabled: boolean) => {
    if (!profile || pushBusy) return;
    setPushBusy(true);
    try {
      if (nextEnabled) {
        const res = await enablePushNotifications();
        setBrowserPerm(getBrowserNotificationPermission());
        void getPushSupportState().then(setPushSupport);
        if (!res.ok) {
          showToast({
            type: 'info',
            title: 'Push notifications',
            description: res.reason,
          });
          return;
        }
        const updated = await updateNotificationPreferences(profile.uid, { pushEnabled: true });
        setNotificationPreferences(updated);
        showToast({ type: 'success', title: 'Push notifications enabled' });
      } else {
        await unregisterCurrentFcmToken(profile.uid);
        const updated = await updateNotificationPreferences(profile.uid, { pushEnabled: false });
        setNotificationPreferences(updated);
        setBrowserPerm(getBrowserNotificationPermission());
        showToast({ type: 'info', title: 'Push notifications disabled on this device' });
      }
    } catch {
      showToast({ type: 'error', title: 'Could not update push setting' });
    } finally {
      setPushBusy(false);
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

      {/* Upload Your Avatar & Cover Photo */}
      <AvatarUploadCard />
      <CoverUploadCard />

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
            Account contact:{' '}
            {privateSettings?.email || firebaseUser?.email || verifiedPhone || 'Verified Member'}
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

        <div className="rounded-xl bg-[#0A0A0C] border border-white/[0.08] p-3.5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Phone className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-[#F8F9FA]">Phone Number Verification</p>
                <p className="text-xs text-[#A1A1AA] mt-0.5">
                  {verifiedPhone
                    ? `Verified phone number: ${verifiedPhone}`
                    : 'Verify your mobile number via SMS OTP to sign in with phone.'}
                </p>
              </div>
            </div>
            {verifiedPhone ? (
              <span className="text-xs font-medium text-[#D4AF37] shrink-0">Verified</span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setShowPhoneLinkForm((prev) => !prev);
                  setPhoneError('');
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-[#D4AF37]/40 text-[#F8F9FA] hover:border-[#D4AF37] hover:bg-white/[0.04] shrink-0"
              >
                {showPhoneLinkForm ? 'Cancel' : 'Verify Phone Number'}
              </button>
            )}
          </div>

          {!verifiedPhone && showPhoneLinkForm && (
            <div className="pt-3 border-t border-white/[0.06] space-y-3">
              {phoneError && (
                <div role="alert" className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-2.5 text-xs text-rose-300">
                  {phoneError}
                </div>
              )}

              {!phoneConfirmation ? (
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    aria-label="Country dial code"
                    value={phoneDialCode}
                    onChange={(e) => setPhoneDialCode(e.target.value)}
                    className="rounded-xl bg-[#151519] border border-white/10 px-2.5 py-2 text-xs text-[#F8F9FA] focus:outline-none focus:border-[#D4AF37]"
                  >
                    {COUNTRY_DIAL_CODES.map((opt) => (
                      <option key={opt.code} value={opt.code}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="300 1234567"
                    className="min-w-0 flex-1 rounded-xl bg-[#151519] border border-white/10 px-3 py-2 text-xs text-[#F8F9FA] placeholder:text-[#71717A] focus:outline-none focus:border-[#D4AF37]"
                  />
                  <button
                    type="button"
                    disabled={phoneBusy}
                    onClick={() => void handleSendLinkPhoneCode()}
                    className="gold-gradient-btn px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-50 shrink-0"
                  >
                    {phoneBusy ? 'Sending...' : 'Send Code'}
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
                    <span>
                      Enter the 6-digit code sent to <strong className="text-[#F8F9FA]">{sentLinkPhone}</strong>
                    </span>
                    <button
                      type="button"
                      disabled={phoneBusy}
                      onClick={() => {
                        clearSettingsRecaptcha();
                        setPhoneConfirmation(null);
                        setPhoneOtpCode('');
                      }}
                      className="text-[#D4AF37] hover:text-[#E7C96F]"
                    >
                      Change
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={phoneOtpCode}
                      onChange={(e) => setPhoneOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="123456"
                      className="min-w-0 flex-1 rounded-xl bg-[#151519] border border-white/10 px-3 py-2 text-center font-mono text-sm tracking-[0.35em] text-[#F8F9FA] focus:outline-none focus:border-[#D4AF37]"
                    />
                    <button
                      type="button"
                      disabled={phoneBusy || phoneOtpCode.length !== 6}
                      onClick={() => void handleConfirmLinkPhoneCode()}
                      className="gold-gradient-btn px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-50 shrink-0"
                    >
                      {phoneBusy ? 'Verifying...' : 'Verify OTP'}
                    </button>
                  </div>
                </div>
              )}
              <div ref={settingsRecaptchaRef} />
            </div>
          )}
        </div>

        {!hasPasswordProvider ? (
          <p className="text-xs text-[#A1A1AA] leading-relaxed">
            {hasGoogleProvider
              ? 'You sign in using Google Authentication. Your password is managed securely through your Google Account.'
              : 'You sign in using verified Phone Number OTP authentication.'}
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
          <div className="rounded-xl bg-[#0A0A0C] border border-[#F5C542]/20 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <BellRing className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-[#F8F9FA]">
                  Push Notifications (Web & Android PWA)
                </p>
                <p className="text-xs text-[#A1A1AA] mt-0.5 leading-relaxed">
                  {pushSupport === 'ios-needs-install'
                    ? 'On iPhone/iPad Safari, add Hostel Friend to your Home Screen first (iOS 16.4+) to enable push alerts.'
                    : pushSupport === 'missing-vapid'
                    ? 'In-app alerts are active. Set VITE_FIREBASE_VAPID_KEY in Vercel & redeploy to activate background Web Push.'
                    : pushSupport === 'unsupported-browser'
                    ? 'Your current browser or embedded preview frame blocks PushManager.'
                    : browserPerm === 'denied'
                    ? 'Notifications are blocked in your browser site settings. Re-enable them in browser permissions.'
                    : notificationPreferences?.pushEnabled && browserPerm === 'granted'
                    ? 'Active on this device. You will receive push alerts for enabled categories.'
                    : 'Receive real-time alerts even when the app is minimized or closed.'}
                </p>
              </div>
            </div>
            <label className="inline-flex items-center gap-2 shrink-0 cursor-pointer self-end sm:self-center">
              <span className="text-xs text-[#A1A1AA]">
                {pushBusy
                  ? 'Updating...'
                  : notificationPreferences?.pushEnabled &&
                    browserPerm === 'granted' &&
                    pushSupport === 'supported'
                  ? 'Enabled'
                  : 'Off'}
              </span>
              <input
                type="checkbox"
                disabled={pushBusy}
                checked={Boolean(
                  notificationPreferences?.pushEnabled &&
                    browserPerm === 'granted' &&
                    pushSupport === 'supported'
                )}
                onChange={(e) => void handleTogglePushNotifications(e.target.checked)}
                className="w-4 h-4 accent-[#D4AF37] cursor-pointer"
              />
            </label>
          </div>

          {(
            [
              { key: 'messages', label: 'Direct messages' },
              { key: 'likes', label: 'Likes on your posts' },
              { key: 'comments', label: 'Comments on your posts' },
              { key: 'commentReplies', label: 'Replies to your comments' },
              { key: 'follows', label: 'New followers' },
              { key: 'friendRequests', label: 'Friend requests & acceptances' },
              { key: 'mentions', label: '@Mentions in posts and comments' },
              { key: 'announcements', label: 'Important Hostel Friend announcements' },
            ] as const
          ).map((item) => {
            const checked = notificationPreferences ? notificationPreferences[item.key] : true;
            return (
              <label
                key={item.key}
                className="flex items-center justify-between gap-4 cursor-pointer py-1"
              >
                <span className="text-sm text-[#F8F9FA]">{item.label}</span>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => void handleTogglePreference(item.key, e.target.checked)}
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

          <div className="pt-3 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-[#F8F9FA]">Mobile & Desktop App</p>
              <p className="text-xs text-[#A1A1AA]">
                Install Hostel Friend on your home screen for fast app launch
              </p>
            </div>
            <PWAInstallButton variant="card" />
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
