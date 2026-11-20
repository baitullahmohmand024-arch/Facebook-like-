import { clientsClaim } from 'workbox-core';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  PrecacheEntry,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, NetworkOnly } from 'workbox-strategies';
import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';
import firebaseConfig from '../firebase-applet-config.json';

interface SwNotificationActionEvent extends Event {
  notification: Notification & {
    data?: Record<string, unknown> & {
      FCM_MSG?: { data?: Record<string, string> };
    };
  };
  waitUntil(promise: Promise<unknown>): void;
}

interface SwWindowClient {
  url: string;
  focus(): Promise<SwWindowClient>;
  postMessage(message: unknown): void;
}

interface HostelSwGlobalScope {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
  location: Location;
  registration: ServiceWorkerRegistration;
  clients: {
    matchAll(options?: { type?: 'window'; includeUncontrolled?: boolean }): Promise<SwWindowClient[]>;
    openWindow(url: string): Promise<SwWindowClient | null>;
  };
  skipWaiting(): void;
  addEventListener(type: 'notificationclick', listener: (event: SwNotificationActionEvent) => void): void;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
}

declare const self: HostelSwGlobalScope;

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();

const precacheManifest = self.__WB_MANIFEST || [];
precacheAndRoute(precacheManifest);

const hasPrecachedIndex = precacheManifest.some((entry) => {
  const url = typeof entry === 'string' ? entry : entry.url;
  return url === 'index.html' || url === '/index.html';
});

if (hasPrecachedIndex) {
  registerRoute(
    new NavigationRoute(createHandlerBoundToURL('/index.html'), {
      denylist: [/^\/api\//, /^\/__\//],
    })
  );
} else {
  registerRoute(
    ({ request, url }) =>
      request.mode === 'navigate' &&
      !url.pathname.startsWith('/api/') &&
      !url.pathname.startsWith('/__/'),
    new NetworkFirst({
      cacheName: 'hostel-friend-pages',
    })
  );
}

// Never cache server upload/streaming or API routes
registerRoute(({ url }) => url.pathname.startsWith('/api/'), new NetworkOnly());

// Never cache Firebase Auth, Firestore, Storage, or FCM registration requests
registerRoute(
  ({ url }) =>
    /^(.*\.)?(firestore\.googleapis\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|firebasestorage\.googleapis\.com|firebaseio\.com|fcm\.googleapis\.com|fcmregistrations\.googleapis\.com)$/i.test(
      url.hostname
    ),
  new NetworkOnly()
);

// Cache Google Fonts stylesheets & font files
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'gstatic-fonts-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Unified Firebase Cloud Messaging background handler
try {
  const firebaseApp = initializeApp(firebaseConfig);
  const messaging = getMessaging(firebaseApp);

  onBackgroundMessage(messaging, (payload) => {
    // Only synthesize notification for data-only messages to prevent duplicates
    if (payload.notification) return;

    const data = (payload.data || {}) as Record<string, string>;
    const title = data.title || 'Hostel Friend';
    const body = data.body || 'You have a new notification.';
    const icon = data.icon || '/icons/icon-192.png';
    const badge = data.badge || '/icons/icon-192.png';
    const tag = data.tag || data.notificationId || `hf-${Date.now()}`;

    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag,
      data,
    });
  });
} catch {
  // FCM background setup skipped when runtime lacks PushManager
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const rawData = (event.notification.data || {}) as Record<string, unknown> & {
    FCM_MSG?: { data?: Record<string, string> };
  };
  const payloadData = (rawData.FCM_MSG?.data || rawData) as Record<string, string>;
  const rawActionUrl = typeof payloadData.actionUrl === 'string' ? payloadData.actionUrl : '';
  const actionUrl = rawActionUrl.startsWith('/') ? rawActionUrl : '/?view=notifications';
  const targetUrl = new URL(actionUrl, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of clientsList) {
        if (client.url.startsWith(self.location.origin)) {
          client.postMessage({
            type: 'HOSTEL_FRIEND_NOTIFICATION_CLICK',
            actionUrl,
            data: payloadData,
          });
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })()
  );
});
