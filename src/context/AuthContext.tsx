import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  User,
} from 'firebase/auth';
import { auth, googleProvider, testFirestoreConnection } from '../lib/firebase';
import {
  checkIsAdmin,
  createUserProfileAndSettings,
  getUserPrivateSettings,
  getUserProfile,
} from '../services/userService';
import {
  fetchPlatformSettings,
  subscribeConversations,
  subscribeNotifications,
} from '../services/socialService';
import { PlatformSettings, UserPrivateSettings, UserProfile } from '../types';

export interface PendingOnboardingDraft {
  fullName: string;
  username: string;
  hostel: string;
  avatarUrl: string;
}

interface AuthContextValue {
  firebaseUser: User | null;
  profile: UserProfile | null;
  privateSettings: UserPrivateSettings | null;
  platformSettings: PlatformSettings;
  isAdmin: boolean;
  authReady: boolean;
  connectionOk: boolean;
  needsOnboarding: boolean;
  needsVerification: boolean;
  unreadNotifications: number;
  unreadMessages: number;
  pendingDraft: PendingOnboardingDraft | null;
  signInWithGoogle: () => Promise<void>;
  signUpWithEmail: (params: {
    email: string;
    password: string;
    fullName: string;
    username: string;
    hostel?: string;
    avatarUrl?: string;
  }) => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  sendResetEmail: (email: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  refreshVerificationStatus: () => Promise<boolean>;
  completeOnboarding: (params: {
    fullName: string;
    username: string;
    hostel?: string;
    avatarUrl?: string;
  }) => Promise<void>;
  refreshUserState: () => Promise<void>;
  refreshPlatformSettings: () => Promise<void>;
  setProfile: React.Dispatch<React.SetStateAction<UserProfile | null>>;
  setPrivateSettings: React.Dispatch<React.SetStateAction<UserPrivateSettings | null>>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const DRAFT_KEY = 'hostelverse_onboarding_draft';

const DEFAULT_PLATFORM: PlatformSettings = {
  maxUploadSizeMB: 25,
  allowNewRegistrations: true,
  maintenanceNotice: '',
  featuredHashtags: ['hostellife', 'latenightstudy', 'rooftop', 'campusfilm', 'coffeehour'],
  updatedBy: 'system',
  updatedAt: null,
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [privateSettings, setPrivateSettings] = useState<UserPrivateSettings | null>(null);
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>(DEFAULT_PLATFORM);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [connectionOk, setConnectionOk] = useState(true);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [pendingDraft, setPendingDraft] = useState<PendingOnboardingDraft | null>(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      return saved ? (JSON.parse(saved) as PendingOnboardingDraft) : null;
    } catch {
      return null;
    }
  });

  const refreshPlatformSettings = useCallback(async () => {
    const settings = await fetchPlatformSettings();
    setPlatformSettings(settings);
  }, []);

  const loadUserRecords = useCallback(async (user: User) => {
    const [prof, priv, adminFlag] = await Promise.all([
      getUserProfile(user.uid),
      getUserPrivateSettings(user.uid),
      checkIsAdmin(user.uid, user.email, user.emailVerified),
    ]);
    setProfile(prof);
    setPrivateSettings(priv);
    setIsAdmin(adminFlag);
    return prof;
  }, []);

  useEffect(() => {
    testFirestoreConnection().then(setConnectionOk);
    refreshPlatformSettings();

    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        try {
          const loadedProfile = await loadUserRecords(user);
          // If the user just verified their email and had a saved onboarding draft, auto-create profile
          if (!loadedProfile && user.emailVerified) {
            const rawDraft = localStorage.getItem(DRAFT_KEY);
            if (rawDraft) {
              try {
                const draft = JSON.parse(rawDraft) as PendingOnboardingDraft;
                const created = await createUserProfileAndSettings({
                  uid: user.uid,
                  email: user.email || '',
                  fullName: draft.fullName,
                  username: draft.username,
                  hostel: draft.hostel,
                  avatarUrl: draft.avatarUrl,
                });
                setProfile(created.profile);
                setPrivateSettings(created.settings);
                localStorage.removeItem(DRAFT_KEY);
                setPendingDraft(null);
              } catch {
                // Keep onboarding form open if username conflicted
              }
            }
          }
        } catch {
          setProfile(null);
          setPrivateSettings(null);
        }
      } else {
        setProfile(null);
        setPrivateSettings(null);
        setIsAdmin(false);
        setUnreadNotifications(0);
        setUnreadMessages(0);
      }
      setAuthReady(true);
    });

    return () => unsub();
  }, [loadUserRecords, refreshPlatformSettings]);

  // Real-time notification and unread message counters
  useEffect(() => {
    if (!authReady || !firebaseUser || !profile) return;

    const unsubNotifs = subscribeNotifications(firebaseUser.uid, (items) => {
      setUnreadNotifications(items.filter((n) => !n.isRead).length);
    });

    const unsubConvs = subscribeConversations(firebaseUser.uid, (convs) => {
      const totalUnread = convs.reduce((acc, c) => {
        const isA = c.participantAId === firebaseUser.uid;
        return acc + (isA ? c.unreadByA : c.unreadByB);
      }, 0);
      setUnreadMessages(totalUnread);
    });

    return () => {
      unsubNotifs();
      unsubConvs();
    };
  }, [authReady, firebaseUser, profile]);

  const signInWithGoogle = async () => {
    const result = await signInWithPopup(auth, googleProvider);
    await loadUserRecords(result.user);
  };

  const signUpWithEmail = async (params: {
    email: string;
    password: string;
    fullName: string;
    username: string;
    hostel?: string;
    avatarUrl?: string;
  }) => {
    if (!platformSettings.allowNewRegistrations) {
      throw new Error('New member registrations are temporarily paused by administrators.');
    }
    const cred = await createUserWithEmailAndPassword(auth, params.email.trim(), params.password);
    await updateProfile(cred.user, {
      displayName: params.fullName.trim(),
      photoURL: params.avatarUrl || undefined,
    });
    const draft: PendingOnboardingDraft = {
      fullName: params.fullName.trim(),
      username: params.username.trim(),
      hostel: (params.hostel || '').trim(),
      avatarUrl: params.avatarUrl || '',
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    setPendingDraft(draft);
    await sendEmailVerification(cred.user);
  };

  const loginWithEmail = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    await loadUserRecords(cred.user);
  };

  const sendResetEmail = async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  };

  const resendVerificationEmail = async () => {
    if (!auth.currentUser) throw new Error('No active session found.');
    await sendEmailVerification(auth.currentUser);
  };

  const refreshVerificationStatus = async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    await reload(auth.currentUser);
    await auth.currentUser.getIdToken(true);
    const updatedUser = auth.currentUser;
    setFirebaseUser({ ...updatedUser } as User);
    if (updatedUser.emailVerified) {
      const existing = await loadUserRecords(updatedUser);
      if (!existing && pendingDraft) {
        const created = await createUserProfileAndSettings({
          uid: updatedUser.uid,
          email: updatedUser.email || '',
          fullName: pendingDraft.fullName,
          username: pendingDraft.username,
          hostel: pendingDraft.hostel,
          avatarUrl: pendingDraft.avatarUrl,
        });
        setProfile(created.profile);
        setPrivateSettings(created.settings);
        localStorage.removeItem(DRAFT_KEY);
        setPendingDraft(null);
      }
      return true;
    }
    return false;
  };

  const completeOnboarding = async (params: {
    fullName: string;
    username: string;
    hostel?: string;
    avatarUrl?: string;
  }) => {
    if (!auth.currentUser) throw new Error('Please sign in first.');
    if (!platformSettings.allowNewRegistrations) {
      throw new Error('New member registrations are temporarily paused by administrators.');
    }
    const created = await createUserProfileAndSettings({
      uid: auth.currentUser.uid,
      email: auth.currentUser.email || '',
      fullName: params.fullName,
      username: params.username,
      hostel: params.hostel,
      avatarUrl: params.avatarUrl || auth.currentUser.photoURL || '',
    });
    setProfile(created.profile);
    setPrivateSettings(created.settings);
    localStorage.removeItem(DRAFT_KEY);
    setPendingDraft(null);
  };

  const refreshUserState = async () => {
    if (!auth.currentUser) return;
    await loadUserRecords(auth.currentUser);
  };

  const logout = async () => {
    localStorage.removeItem(DRAFT_KEY);
    setPendingDraft(null);
    await signOut(auth);
  };

  const needsVerification = Boolean(firebaseUser && !firebaseUser.emailVerified);
  const needsOnboarding = Boolean(firebaseUser && firebaseUser.emailVerified && !profile);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        privateSettings,
        platformSettings,
        isAdmin,
        authReady,
        connectionOk,
        needsOnboarding,
        needsVerification,
        unreadNotifications,
        unreadMessages,
        pendingDraft,
        signInWithGoogle,
        signUpWithEmail,
        loginWithEmail,
        sendResetEmail,
        resendVerificationEmail,
        refreshVerificationStatus,
        completeOnboarding,
        refreshUserState,
        refreshPlatformSettings,
        setProfile,
        setPrivateSettings,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
