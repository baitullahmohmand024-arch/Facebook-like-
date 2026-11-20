import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getMessaging, getToken, isSupported, MessagePayload, onMessage } from 'firebase/messaging';
import { app, db } from '../lib/firebase';
import { FcmTokenRecord } from '../types';

const TOKEN_ID_STORAGE_KEY = 'hostel_friend_fcm_token_id';

export type PushSupportState =
  | 'supported'
  | 'unsupported-browser'
  | 'ios-needs-install'
  | 'insecure-context'
  | 'missing-vapid';

export function detectDevicePlatform(): FcmTokenRecord['platform'] {
  if (typeof window === 'undefined') return 'web';
  const ua = window.navigator.userAgent || '';
  const standalone =
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (/iPad|iPhone|iPod/.test(ua) && standalone) return 'ios-pwa';
  if (/Android/i.test(ua) && standalone) return 'android-pwa';
  return 'web';
}

export function isIosBrowserWithoutPwa(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent || '';
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
  if (!isIos) return false;
  const standalone =
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return !standalone;
}

export async function getPushSupportState(): Promise<PushSupportState> {
  if (typeof window === 'undefined') return 'unsupported-browser';
  if (!window.isSecureContext && window.location.hostname !== 'localhost') {
    return 'insecure-context';
  }
  if (isIosBrowserWithoutPwa()) {
    return 'ios-needs-install';
  }
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    return 'unsupported-browser';
  }
  const supported = await isSupported().catch(() => false);
  if (!supported) {
    return 'unsupported-browser';
  }
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!vapidKey || vapidKey === 'MY_FIREBASE_WEB_PUSH_VAPID_KEY') {
    return 'missing-vapid';
  }
  return 'supported';
}

export function getBrowserNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

async function hashTokenToDocId(token: string): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoded = new TextEncoder().encode(token);
      const digest = await crypto.subtle.digest('SHA-256', encoded);
      const hex = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      return `tok_${hex.slice(0, 40)}`;
    }
  } catch {
    // Fallback deterministic safe key
  }
  let hash = 0;
  for (let i = 0; i < token.length; i += 1) {
    hash = (hash * 31 + token.charCodeAt(i)) | 0;
  }
  return `tok_${Math.abs(hash)}_${token.slice(-12).replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

export async function registerFcmTokenForUser(
  uid: string,
  promptPermission: boolean
): Promise<{ ok: boolean; token?: string; reason?: string }> {
  try {
    const support = await getPushSupportState();
    if (support === 'ios-needs-install') {
      return {
        ok: false,
        reason: 'On iPhone/iPad, tap Share → Add to Home Screen first to enable push notifications.',
      };
    }
    if (support === 'missing-vapid') {
      return {
        ok: false,
        reason: 'Firebase Web Push VAPID key (VITE_FIREBASE_VAPID_KEY) is not configured yet.',
      };
    }
    if (support !== 'supported') {
      return {
        ok: false,
        reason: 'Push notifications are not supported in this browser or embedded frame.',
      };
    }

    let permission = Notification.permission;
    if (permission === 'default' && promptPermission) {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') {
      return {
        ok: false,
        reason:
          permission === 'denied'
            ? 'Notification permission is blocked in browser settings.'
            : 'Notification permission not granted yet.',
      };
    }

    const registration = await navigator.serviceWorker.ready;
    const messaging = getMessaging(app);
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });

    if (!token) {
      return { ok: false, reason: 'Could not retrieve a device push token.' };
    }

    const tokenId = await hashTokenToDocId(token);
    const tokenRef = doc(db, 'users', uid, 'fcmTokens', tokenId);
    const existing = await getDoc(tokenRef).catch(() => null);

    if (existing?.exists()) {
      await setDoc(
        tokenRef,
        {
          id: tokenId,
          uid,
          token,
          platform: detectDevicePlatform(),
          userAgent: (navigator.userAgent || '').slice(0, 300),
          createdAt: existing.data()?.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      await setDoc(tokenRef, {
        id: tokenId,
        uid,
        token,
        platform: detectDevicePlatform(),
        userAgent: (navigator.userAgent || '').slice(0, 300),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    try {
      localStorage.setItem(TOKEN_ID_STORAGE_KEY, tokenId);
    } catch {
      // Ignore storage quota errors
    }

    return { ok: true, token };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : 'Unable to register device for push alerts.',
    };
  }
}

export async function unregisterCurrentFcmToken(uid: string): Promise<void> {
  if (!uid) return;
  try {
    const storedTokenId = localStorage.getItem(TOKEN_ID_STORAGE_KEY);
    if (storedTokenId) {
      await deleteDoc(doc(db, 'users', uid, 'fcmTokens', storedTokenId)).catch(() => {});
      localStorage.removeItem(TOKEN_ID_STORAGE_KEY);
    }
  } catch {
    // Ignore cleanup errors on logout
  }
}

export async function subscribeForegroundPushMessages(
  onPayload: (payload: MessagePayload) => void
): Promise<() => void> {
  try {
    const supported = await isSupported().catch(() => false);
    if (!supported) return () => {};
    const messaging = getMessaging(app);
    return onMessage(messaging, onPayload);
  } catch {
    return () => {};
  }
}
