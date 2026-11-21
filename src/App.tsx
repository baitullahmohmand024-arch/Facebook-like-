import { useCallback, useEffect, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { formatUserFriendlyError } from './lib/firestoreError';
import { normalizeNotificationType } from './services/notificationService';
import { getUserProfile } from './services/userService';
import { AppView, NotificationItem, UserProfile } from './types';
import { Layout } from './components/Layout';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PostDetailModal } from './components/PostDetailModal';
import { LandingPage } from './pages/LandingPage';
import { AuthPage } from './pages/AuthPage';
import { FeedPage } from './pages/FeedPage';
import { ExplorePage } from './pages/ExplorePage';
import { TrendsPage } from './pages/TrendsPage';
import { MomentsPage } from './pages/MomentsPage';
import { CreatePostPage } from './pages/CreatePostPage';
import { ProfilePage } from './pages/ProfilePage';
import { NotificationsPage } from './pages/NotificationsPage';
import { MessagesPage } from './pages/MessagesPage';
import { SettingsPage } from './pages/SettingsPage';
import { AdminPage } from './pages/AdminPage';

function HostelverseRouter() {
  const {
    firebaseUser,
    profile,
    isAdmin,
    authReady,
    connectionOk,
    needsVerification,
    needsOnboarding,
    platformSettings,
    unreadNotifications,
    unreadMessages,
    signInWithGoogle,
    logout,
  } = useAuth();
  const { showToast } = useToast();

  const [view, setView] = useState<AppView>('landing');
  const [authInitialMode, setAuthInitialMode] = useState<'login' | 'signup' | 'forgot' | 'phone'>('login');
  const [profileUserId, setProfileUserId] = useState<string>('');
  const [exploreTag, setExploreTag] = useState<string>('');
  const [messageTargetUser, setMessageTargetUser] = useState<UserProfile | null>(null);
  const [initialConversationId, setInitialConversationId] = useState<string | null>(null);
  const [notificationsInitialTab, setNotificationsInitialTab] = useState<
    'all' | 'unread' | 'requests'
  >('all');
  const [detailPostId, setDetailPostId] = useState<string | null>(null);
  const [detailCommentId, setDetailCommentId] = useState<string | undefined>(undefined);
  const [connectingGoogle, setConnectingGoogle] = useState(false);

  const applyDeepLink = useCallback((rawSearch: string) => {
    const queryStr = rawSearch.includes('?') ? rawSearch.split('?')[1] : rawSearch;
    const params = new URLSearchParams(queryStr);
    const targetView = params.get('view') as AppView | null;
    const postParam = params.get('post');
    const commentParam = params.get('commentId');
    const conversationParam = params.get('conversationId');
    const uidParam = params.get('uid');
    const tabParam = params.get('tab');

    if (postParam) {
      setDetailPostId(postParam);
      setDetailCommentId(commentParam || undefined);
      setView('feed');
      return;
    }

    if (targetView === 'messages') {
      if (conversationParam) setInitialConversationId(conversationParam);
      setView('messages');
      return;
    }

    if (targetView === 'profile' && uidParam) {
      setProfileUserId(uidParam);
      setView('profile');
      return;
    }

    if (targetView === 'notifications') {
      setNotificationsInitialTab(
        tabParam === 'requests' ? 'requests' : tabParam === 'unread' ? 'unread' : 'all'
      );
      setView('notifications');
    }
  }, []);

  // Sync authenticated state on initial load + apply query deep links
  useEffect(() => {
    if (!authReady) return;
    if (firebaseUser && (needsVerification || needsOnboarding)) {
      setView('auth');
      return;
    }
    if (firebaseUser && profile && (view === 'landing' || view === 'auth')) {
      const search = window.location.search;
      if (search && (search.includes('view=') || search.includes('post='))) {
        applyDeepLink(search);
        window.history.replaceState({}, '', '/');
      } else {
        setView('feed');
      }
    }
  }, [authReady, firebaseUser, profile, needsVerification, needsOnboarding, applyDeepLink, view]);

  // Listen for push notification click messages sent by the unified service worker or FCM SW
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onSwMessage = (event: MessageEvent) => {
      const payload = event.data as
        | {
            type?: string;
            actionUrl?: string;
            isFirebaseMessaging?: boolean;
            messageType?: string;
            data?: { actionUrl?: string };
            fcmOptions?: { link?: string };
          }
        | undefined;
      if (!payload) return;

      if (payload.type === 'HOSTEL_FRIEND_NOTIFICATION_CLICK' && payload.actionUrl) {
        applyDeepLink(payload.actionUrl);
        return;
      }

      if (payload.isFirebaseMessaging && payload.messageType === 'notification-clicked') {
        const link = payload.fcmOptions?.link || payload.data?.actionUrl;
        if (link) {
          applyDeepLink(link);
        }
      }
    };
    navigator.serviceWorker.addEventListener('message', onSwMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onSwMessage);
  }, [applyDeepLink]);

  const requireAuth = (mode: 'login' | 'signup' | 'phone' = 'login') => {
    setAuthInitialMode(mode);
    setView('auth');
  };

  const handleLandingGoogleConnect = async () => {
    if (connectingGoogle) return;
    setConnectingGoogle(true);
    try {
      await signInWithGoogle();
      showToast({ type: 'success', title: 'Google account connected' });
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/popup-blocked') {
        requireAuth('signup');
        showToast({
          type: 'info',
          title: 'Allow pop-ups to connect Google',
          description: 'Tap Continue with Google below to finish connecting your account.',
        });
      } else if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        showToast({
          type: 'error',
          title: 'Could not connect Google account',
          description: formatUserFriendlyError(err),
        });
      }
    } finally {
      setConnectingGoogle(false);
    }
  };

  const handleNavigate = (nextView: AppView) => {
    const protectedViews: AppView[] = [
      'feed',
      'create',
      'messages',
      'notifications',
      'settings',
      'admin',
    ];
    if (protectedViews.includes(nextView) && !profile) {
      requireAuth('login');
      return;
    }
    if (nextView === 'profile') {
      if (!profile) {
        requireAuth('login');
        return;
      }
      setProfileUserId(profile.uid);
    }
    if (nextView === 'explore') {
      setExploreTag('');
    }
    setView(nextView);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openMemberProfile = (uid: string) => {
    setProfileUserId(uid);
    setView('profile');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openHashtagExplore = (tag: string) => {
    setExploreTag(tag);
    setView('explore');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openMessageWithUser = (target: UserProfile) => {
    if (!profile) {
      requireAuth('login');
      return;
    }
    setInitialConversationId(null);
    setMessageTargetUser(target);
    setView('messages');
  };

  const handleOpenNotificationDestination = async (item: NotificationItem) => {
    const canonical = normalizeNotificationType(item.type);
    const postId = item.relatedPostId || item.postId || '';

    switch (canonical) {
      case 'NEW_MESSAGE': {
        if (item.relatedConversationId) {
          setMessageTargetUser(null);
          setInitialConversationId(item.relatedConversationId);
          setView('messages');
        } else if (item.actorId) {
          const actorProfile = await getUserProfile(item.actorId).catch(() => null);
          if (actorProfile) {
            openMessageWithUser(actorProfile);
          } else {
            setView('messages');
          }
        } else {
          setView('messages');
        }
        break;
      }
      case 'POST_LIKE':
      case 'POST_COMMENT':
      case 'COMMENT_REPLY':
      case 'USER_MENTION': {
        if (postId) {
          setDetailPostId(postId);
          setDetailCommentId(item.relatedCommentId || undefined);
        } else if (item.actorId) {
          openMemberProfile(item.actorId);
        }
        break;
      }
      case 'NEW_FOLLOWER':
      case 'FRIEND_REQUEST_ACCEPTED': {
        if (item.actorId) {
          openMemberProfile(item.actorId);
        }
        break;
      }
      case 'FRIEND_REQUEST': {
        setNotificationsInitialTab('requests');
        setView('notifications');
        break;
      }
      default:
        break;
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#0A0A0C] flex flex-col items-center justify-center gap-4">
        <img
          src="/icons/icon-192.png"
          alt="Hostel Friend"
          className="w-16 h-16 rounded-2xl object-cover border border-white/15 shadow-lg"
        />
        <div className="text-center">
          <p className="font-display font-bold text-lg tracking-tight text-[#F8F9FA]">
            Hostel Friend
          </p>
          <p className="mt-0.5 text-[11px] tracking-[0.16em] uppercase text-[#00C8FF]">
            Connect • Share • Discover
          </p>
        </div>
      </div>
    );
  }

  if (view === 'auth' || (firebaseUser && (needsVerification || needsOnboarding))) {
    return (
      <AuthPage
        initialMode={authInitialMode}
        onBackToLanding={() => setView('landing')}
        onAuthenticated={() => setView('feed')}
      />
    );
  }

  if (view === 'landing' && !profile) {
    return (
      <LandingPage
        onCreateAccount={() => requireAuth('signup')}
        onLogin={() => requireAuth('login')}
        onExploreCommunity={() => setView('explore')}
        onConnectGoogle={handleLandingGoogleConnect}
        onContinueWithPhone={() => requireAuth('phone')}
        connectingGoogle={connectingGoogle}
      />
    );
  }

  if (profile?.isSuspended && view !== 'settings') {
    return (
      <div className="min-h-screen bg-[#0A0A0C] flex items-center justify-center p-4">
        <div className="glass-surface max-w-md w-full rounded-2xl p-8 text-center border border-rose-500/30">
          <h1 className="font-display text-xl font-bold text-[#F8F9FA]">Account Suspended</h1>
          <p className="mt-2 text-sm text-[#A1A1AA] leading-relaxed">
            Your Hostel Friend account is currently suspended following a community safety review.
          </p>
          <button
            type="button"
            onClick={async () => {
              await logout();
              setView('landing');
            }}
            className="mt-6 px-5 py-2.5 rounded-xl text-xs font-semibold border border-white/15 text-[#F8F9FA] hover:bg-white/[0.04]"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // Guest Explore / Moments / Profile view (when browsing from "Explore Community")
  if (!profile) {
    return (
      <div className="min-h-screen bg-[#0A0A0C] text-[#F8F9FA]">
        <header className="sticky top-0 z-30 bg-[#0A0A0C]/90 backdrop-blur-xl border-b border-white/[0.08]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-6">
            <button
              type="button"
              onClick={() => setView('landing')}
              className="flex items-center gap-2.5 font-display font-bold tracking-tight text-lg text-[#F8F9FA] whitespace-nowrap shrink-0"
            >
              <img
                src="/icons/icon-192.png"
                alt="Hostel Friend"
                className="w-7 h-7 rounded-lg object-cover border border-white/15"
              />
              <span>Hostel Friend</span>
            </button>

            <nav className="flex items-center gap-6 text-sm font-medium text-[#A1A1AA]">
              <button
                type="button"
                onClick={() => setView('explore')}
                className={view === 'explore' ? 'text-[#D4AF37]' : 'hover:text-[#F8F9FA]'}
              >
                Explore
              </button>
              <button
                type="button"
                onClick={() => setView('trends')}
                className={view === 'trends' ? 'text-[#D4AF37]' : 'hover:text-[#F8F9FA]'}
              >
                Trends
              </button>
              <button
                type="button"
                onClick={() => setView('moments')}
                className={view === 'moments' ? 'text-[#D4AF37]' : 'hover:text-[#F8F9FA]'}
              >
                Moments
              </button>
            </nav>

            <button
              type="button"
              onClick={() => requireAuth('signup')}
              className="gold-gradient-btn px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0"
            >
              Join Hostel Friend
            </button>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          {view === 'moments' ? (
            <MomentsPage
              onOpenProfile={openMemberProfile}
              onNavigateCreate={() => requireAuth('signup')}
              onRequireAuth={() => requireAuth('login')}
            />
          ) : view === 'trends' ? (
            <TrendsPage
              onSearchHashtag={openHashtagExplore}
              onNavigateCreate={() => requireAuth('signup')}
            />
          ) : view === 'profile' && profileUserId ? (
            <ProfilePage
              targetUserId={profileUserId}
              onOpenProfile={openMemberProfile}
              onMessageUser={openMessageWithUser}
              onSearchHashtag={openHashtagExplore}
              onRequireAuth={() => requireAuth('login')}
            />
          ) : (
            <ExplorePage
              initialHashtag={exploreTag}
              onOpenProfile={openMemberProfile}
              onRequireAuth={() => requireAuth('login')}
              onOpenTrends={() => setView('trends')}
            />
          )}
        </main>
      </div>
    );
  }

  return (
    <Layout
      activeView={view}
      onNavigate={handleNavigate}
      profile={profile}
      isAdmin={isAdmin}
      unreadNotifications={unreadNotifications}
      unreadMessages={unreadMessages}
      maintenanceNotice={
        !connectionOk
          ? 'Offline mode detected. Check your network connection.'
          : platformSettings.maintenanceNotice
      }
      onLogout={async () => {
        await logout();
        setView('landing');
      }}
    >
      {view === 'feed' && (
        <FeedPage
          onNavigateCreate={() => handleNavigate('create')}
          onNavigateExplore={() => handleNavigate('explore')}
          onOpenProfile={openMemberProfile}
          onSearchHashtag={openHashtagExplore}
          onRequireAuth={() => requireAuth('login')}
        />
      )}

      {view === 'explore' && (
        <ExplorePage
          initialHashtag={exploreTag}
          onOpenProfile={openMemberProfile}
          onRequireAuth={() => requireAuth('login')}
          onOpenTrends={() => handleNavigate('trends')}
        />
      )}

      {view === 'trends' && (
        <TrendsPage
          onSearchHashtag={openHashtagExplore}
          onNavigateCreate={() => handleNavigate('create')}
        />
      )}

      {view === 'moments' && (
        <MomentsPage
          onOpenProfile={openMemberProfile}
          onNavigateCreate={() => handleNavigate('create')}
          onRequireAuth={() => requireAuth('login')}
        />
      )}

      {view === 'create' && (
        <CreatePostPage
          onPublished={() => handleNavigate('feed')}
          onCancel={() => handleNavigate('feed')}
        />
      )}

      {view === 'profile' && (
        <ProfilePage
          targetUserId={profileUserId || profile.uid}
          onOpenProfile={openMemberProfile}
          onMessageUser={openMessageWithUser}
          onSearchHashtag={openHashtagExplore}
          onRequireAuth={() => requireAuth('login')}
        />
      )}

      {view === 'notifications' && (
        <NotificationsPage
          initialTab={notificationsInitialTab}
          onOpenProfile={openMemberProfile}
          onOpenNotification={(item) => {
            void handleOpenNotificationDestination(item);
          }}
        />
      )}

      {view === 'messages' && (
        <MessagesPage
          initialTargetUser={messageTargetUser}
          initialConversationId={initialConversationId}
          onClearInitialTarget={() => setMessageTargetUser(null)}
          onClearInitialConversation={() => setInitialConversationId(null)}
          onOpenProfile={openMemberProfile}
        />
      )}

      {view === 'settings' && (
        <SettingsPage onLoggedOut={() => setView('landing')} />
      )}

      {view === 'admin' && <AdminPage />}

      <PostDetailModal
        postId={detailPostId}
        highlightCommentId={detailCommentId}
        openCommentsByDefault={Boolean(detailCommentId) || Boolean(detailPostId)}
        onClose={() => {
          setDetailPostId(null);
          setDetailCommentId(undefined);
        }}
        onOpenProfile={openMemberProfile}
        onSearchHashtag={openHashtagExplore}
        onRequireAuth={() => requireAuth('login')}
      />
    </Layout>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <HostelverseRouter />
        <OfflineIndicator />
        <Analytics />
      </AuthProvider>
    </ToastProvider>
  );
}
