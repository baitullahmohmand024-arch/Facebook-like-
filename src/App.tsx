import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { AppView, UserProfile } from './types';
import { Layout } from './components/Layout';
import { LandingPage } from './pages/LandingPage';
import { AuthPage } from './pages/AuthPage';
import { FeedPage } from './pages/FeedPage';
import { ExplorePage } from './pages/ExplorePage';
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
    logout,
  } = useAuth();

  const [view, setView] = useState<AppView>('landing');
  const [authInitialMode, setAuthInitialMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [profileUserId, setProfileUserId] = useState<string>('');
  const [exploreTag, setExploreTag] = useState<string>('');
  const [messageTargetUser, setMessageTargetUser] = useState<UserProfile | null>(null);

  // Sync authenticated state on initial load
  useEffect(() => {
    if (!authReady) return;
    if (firebaseUser && (needsVerification || needsOnboarding)) {
      setView('auth');
      return;
    }
    if (firebaseUser && profile && (view === 'landing' || view === 'auth')) {
      setView('feed');
    }
  }, [authReady, firebaseUser, profile, needsVerification, needsOnboarding]);

  const requireAuth = (mode: 'login' | 'signup' = 'login') => {
    setAuthInitialMode(mode);
    setView('auth');
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
    setMessageTargetUser(target);
    setView('messages');
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#0A0A0C] flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 rounded-xl gold-gradient-btn flex items-center justify-center font-display font-bold text-lg">
          H
        </div>
        <p className="text-xs tracking-[0.16em] uppercase text-[#A1A1AA]">HOSTELVERSE</p>
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
      />
    );
  }

  if (profile?.isSuspended && view !== 'settings') {
    return (
      <div className="min-h-screen bg-[#0A0A0C] flex items-center justify-center p-4">
        <div className="glass-surface max-w-md w-full rounded-2xl p-8 text-center border border-rose-500/30">
          <h1 className="font-display text-xl font-bold text-[#F8F9FA]">Account Suspended</h1>
          <p className="mt-2 text-sm text-[#A1A1AA] leading-relaxed">
            Your HOSTELVERSE account is currently suspended following a community safety review.
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
              className="font-display font-bold tracking-tight text-lg text-[#F8F9FA] whitespace-nowrap shrink-0"
            >
              HOSTELVERSE
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
              Join HOSTELVERSE
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
        <NotificationsPage onOpenProfile={openMemberProfile} />
      )}

      {view === 'messages' && (
        <MessagesPage
          initialTargetUser={messageTargetUser}
          onClearInitialTarget={() => setMessageTargetUser(null)}
          onOpenProfile={openMemberProfile}
        />
      )}

      {view === 'settings' && (
        <SettingsPage onLoggedOut={() => setView('landing')} />
      )}

      {view === 'admin' && <AdminPage />}
    </Layout>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <HostelverseRouter />
      </AuthProvider>
    </ToastProvider>
  );
}
