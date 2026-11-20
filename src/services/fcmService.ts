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

export function getConfiguredVapidKey(): string {
  const raw = String(import.meta.env.VITE_FIREBASE_VAPID_KEY || '')
    .trim()
    .replace(/^["']|["']$/g, '');
  if (!raw || raw === 'MY_FIREBASE_WEB_PUSH_VAPID_KEY') return '';
  return raw;
}

export function isValidVapidPublicKeyFormat(key: string): boolean {
  return /^[A-Za-z0-9_-]{60,140}$/.test(key);
}

export async function getPushSupportState(): Promise<PushSupportState> {
  if (typeof window === 'undefined') return 'unsupported-browser';
  if (!window.isSecureContext && window.location.hostname !== 'localhost') {
    return 'insecure-context';
  }
  if (isIosBrowserWithoutPwa()) {
    return 'ios-needs-install';
  }
  if (
    !('Notification' in window) ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    return 'unsupported-browser';
  }
  const supported = await isSupported().catch(() => false);
  if (!supported) {
    return 'unsupported-browser';
  }
  const vapidKey = getConfiguredVapidKey();
  if (!vapidKey) {
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

async function getActiveMessagingServiceWorker(timeoutMs = 12000): Promise<ServiceWorkerRegistration> {
  let reg = await navigator.serviceWorker.getRegistration('/');
  if (!reg) {
    reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  }

  const readyPromise = navigator.serviceWorker.ready;
  const timeoutPromise = new Promise<never>((_, reject) => {
    window.setTimeout(() => {
      reject(
        new Error(
          'Service worker did not activate in time. Reload the page on HTTPS (not an embedded preview or private tab) and try again.'
        )
      );
    }, timeoutMs);
  });

  const readyReg = await Promise.race([readyPromise, timeoutPromise]);
  if (readyReg.active) return readyReg;

  const pendingWorker = readyReg.installing || readyReg.waiting || reg.installing || reg.waiting;
  if (!pendingWorker) return readyReg;

  await new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, 4000);
    const onStateChange = () => {
      if (pendingWorker.state === 'activated' || pendingWorker.state === 'redundant') {
        window.clearTimeout(timer);
        pendingWorker.removeEventListener('statechange', onStateChange);
        resolve();
      }
    };
    pendingWorker.addEventListener('statechange', onStateChange);
  });

  return readyReg;
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
        reason: 'On iPhone/iPad, tap Share -> Add to Home Screen first to enable push notifications.',
      };
    }
    if (support === 'missing-vapid') {
      return {
        ok: false,
        reason: 'Firebase Web Push VAPID key (VITE_FIREBASE_VAPID_KEY) is not configured yet.',
      };
    }
    if (support === 'insecure-context') {
      return {
        ok: false,
        reason: 'Push notifications require an HTTPS connection.',
      };
    }
    if (support !== 'supported') {
      return {
        ok: false,
        reason: 'Push notifications are not supported in this browser or embedded frame.',
      };
    }

    const vapidKey = getConfiguredVapidKey();
    if (!isValidVapidPublicKeyFormat(vapidKey)) {
      return {
        ok: false,
        reason:
          'VITE_FIREBASE_VAPID_KEY format is invalid. Paste the public Web Push certificate key from Firebase Console without quotes or spaces.',
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
            ? 'Notification permission is blocked in browser site settings. Tap the lock/site icon in Chrome and allow Notifications.'
            : 'Notification permission not granted yet.',
      };
    }

    const registration = await getActiveMessagingServiceWorker();
    const messaging = getMessaging(app);

    let token = '';
    try {
      token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: registration,
      });
    } catch (tokenErr) {
      // If a stale browser PushSubscription exists from an older/different VAPID key, clear it and retry once
      const errMsg = tokenErr instanceof Error ? tokenErr.message : String(tokenErr || '');
      const existingSub = await registration.pushManager.getSubscription().catch(() => null);
      if (
        existingSub &&
        /applicationServerKey|InvalidAccessError|AbortError|push service/i.test(errMsg)
      ) {
        await existingSub.unsubscribe().catch(() => false);
        token = await getToken(messaging, {
          vapidKey,
          serviceWorkerRegistration: registration,
        });
      } else {
        throw tokenErr;
      }
    }

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
    const rawMsg = err instanceof Error ? err.message : 'Unable to register device for push alerts.';
    if (/fcmregistrations|firebaseinstallations|token-subscribe-failed|403|PERMISSION_DENIED/i.test(rawMsg)) {
      return {
        ok: false,
        reason:
          'Firebase Push registration was rejected. Verify FCM Registration API and Firebase Installations API are enabled for zesty-handler-15fd2 and VITE_FIREBASE_VAPID_KEY matches Firebase Console.',
      };
    }
    return {
      ok: false,
      reason: rawMsg,
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
