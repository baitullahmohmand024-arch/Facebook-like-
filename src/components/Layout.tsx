import React, { useEffect, useState } from 'react';
import {
  Bell,
  Compass,
  Film,
  Home,
  LogOut,
  MessageSquare,
  Plus,
  PlusSquare,
  Settings,
  Shield,
  TrendingUp,
  User,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { AppView, UserProfile } from '../types';
import { Avatar } from './Avatar';
import { PWAInstallButton } from './PWAInstallButton';
import {
  isSoundVfxEnabled,
  subscribeSoundPreference,
  toggleSoundVfx,
} from '../utils/soundVfx';

interface LayoutProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  profile: UserProfile | null;
  isAdmin: boolean;
  unreadNotifications: number;
  unreadMessages: number;
  maintenanceNotice?: string;
  onLogout: () => void;
  children: React.ReactNode;
}

export function Layout({
  activeView,
  onNavigate,
  profile,
  isAdmin,
  unreadNotifications,
  unreadMessages,
  maintenanceNotice,
  onLogout,
  children,
}: LayoutProps) {
  const [soundOn, setSoundOn] = useState(() => isSoundVfxEnabled());

  useEffect(() => {
    return subscribeSoundPreference(setSoundOn);
  }, []);
  const desktopNav: {
    id: AppView;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    count?: number;
  }[] = [
    { id: 'feed', label: 'Home', icon: Home },
    { id: 'explore', label: 'Explore', icon: Compass },
    { id: 'trends', label: 'Trends', icon: TrendingUp },
    { id: 'moments', label: 'Moments', icon: Film },
    { id: 'messages', label: 'Messages', icon: MessageSquare, count: unreadMessages },
    { id: 'notifications', label: 'Notifications', icon: Bell, count: unreadNotifications },
    { id: 'create', label: 'Create Post', icon: PlusSquare },
    { id: 'profile', label: 'My Profile', icon: User },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  if (isAdmin) {
    desktopNav.push({ id: 'admin', label: 'Admin', icon: Shield });
  }

  const mobileTabs: {
    id: AppView;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'feed', label: 'Home', icon: Home },
    { id: 'explore', label: 'Explore', icon: Compass },
    { id: 'create', label: 'Create', icon: PlusSquare },
    { id: 'moments', label: 'Moments', icon: Film },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  return (
    <div className="min-h-screen bg-[#050505] text-[#FFFFFF] flex flex-col md:flex-row">
      {/* Desktop Left Sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-20 lg:w-64 md:fixed md:inset-y-0 md:left-0 bg-[#050505] border-r border-white/[0.08] z-30">
        <div className="px-4 lg:px-6 h-20 flex items-center justify-center lg:justify-start border-b border-[#F5C542]/15">
          <button
            type="button"
            onClick={() => onNavigate('feed')}
            className="flex items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5C542] rounded-lg min-w-0"
          >
            <img
              src="/icons/icon-192.png"
              alt="Hostel Friend"
              className="w-9 h-9 rounded-xl object-cover border border-[#F5C542]/40 shrink-0"
            />
            <div className="hidden lg:block min-w-0 leading-tight">
              <span className="font-display font-bold tracking-tight text-lg whitespace-nowrap shrink-0 block">
                <span className="text-[#FFFFFF]">Hostel </span>
                <span className="text-[#F5C542]">Friend</span>
              </span>
              <span className="text-[10px] text-[#A5A5AD] tracking-wide block truncate">
                Connect • Share • Discover
              </span>
            </div>
          </button>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1.5 overflow-y-auto" aria-label="Primary navigation">
          {desktopNav.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`w-full min-h-[44px] px-3 lg:px-3.5 py-2.5 rounded-xl flex items-center justify-center lg:justify-between gap-3 transition-colors duration-150 whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-[#111114] text-[#F5C542] border border-[#F5C542]/30 shadow-[0_4px_16px_rgba(245,197,66,0.08)]'
                    : 'text-[#A5A5AD] hover:text-[#FFFFFF] hover:bg-[#111114]/70 border border-transparent'
                }`}
              >
                <span className="flex items-center gap-3.5 min-w-0">
                  <Icon className="w-5 h-5 shrink-0" />
                  <span className="hidden lg:inline text-sm font-medium truncate">{item.label}</span>
                </span>
                {typeof item.count === 'number' && item.count > 0 && (
                  <span className="hidden lg:inline font-mono text-xs tabular-nums text-[#F5C542] font-semibold">
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="px-3 pb-2">
          <PWAInstallButton variant="sidebar" />
        </div>

        {profile && (
          <div className="p-3 lg:p-4 border-t border-white/[0.06]">
            <div className="flex items-center justify-center lg:justify-between gap-2">
              <button
                type="button"
                onClick={() => onNavigate('profile')}
                className="flex items-center gap-3 min-w-0 text-left group"
              >
                <Avatar src={profile.avatarUrl} name={profile.fullName} size="sm" />
                <div className="hidden lg:block min-w-0">
                  <p className="text-sm font-semibold text-[#F8F9FA] group-hover:text-[#D4AF37] transition-colors truncate">
                    {profile.fullName}
                  </p>
                  <p className="text-xs text-[#A1A1AA] truncate">@{profile.username}</p>
                </div>
              </button>
              <div className="hidden lg:flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => toggleSoundVfx()}
                  title={soundOn ? 'Mute Sound VFX' : 'Enable Sound VFX'}
                  aria-label={soundOn ? 'Mute Sound VFX' : 'Enable Sound VFX'}
                  className={`p-2 rounded-xl transition-colors ${
                    soundOn
                      ? 'text-[#D4AF37] hover:bg-white/[0.06]'
                      : 'text-[#71717A] hover:text-[#F8F9FA] hover:bg-white/[0.06]'
                  }`}
                >
                  {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={onLogout}
                  title="Log out"
                  aria-label="Log out"
                  className="p-2 rounded-xl text-[#A1A1AA] hover:text-[#F8F9FA] hover:bg-white/[0.06] transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Mobile Premium Black-and-Gold Header */}
      <header className="md:hidden sticky top-0 z-30 h-15 px-3.5 bg-[#050505]/95 backdrop-blur-xl border-b border-[#F5C542]/20 shadow-[0_2px_20px_rgba(245,197,66,0.08)] flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onNavigate('feed')}
          className="flex items-center gap-2.5 min-w-0 text-left shrink"
        >
          <img
            src="/icons/icon-192.png"
            alt="Hostel Friend"
            className="w-8 h-8 rounded-xl object-cover border border-[#F5C542]/45 shrink-0 shadow-[0_0_12px_rgba(245,197,66,0.18)]"
          />
          <div className="min-w-0 leading-tight">
            <span className="font-display font-extrabold tracking-tight text-[15px] whitespace-nowrap block">
              <span className="text-[#FFFFFF]">Hostel </span>
              <span className="text-[#F5C542]">Friend</span>
            </span>
            <span className="text-[9.5px] text-[#A5A5AD] tracking-wide block truncate">
              Connect • Share • Discover
            </span>
          </div>
        </button>

        <div className="flex items-center gap-0.5 shrink-0">
          <PWAInstallButton variant="compact" className="mr-0.5" />
          <button
            type="button"
            onClick={() => toggleSoundVfx()}
            aria-label={soundOn ? 'Mute Sound VFX' : 'Enable Sound VFX'}
            className={`min-w-[38px] min-h-[44px] flex items-center justify-center rounded-xl transition-colors ${
              soundOn
                ? 'text-[#F5C542] hover:bg-[#19191D]'
                : 'text-[#A5A5AD] hover:text-[#FFFFFF] hover:bg-[#19191D]'
            }`}
          >
            {soundOn ? <Volume2 className="w-[18px] h-[18px]" /> : <VolumeX className="w-[18px] h-[18px]" />}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('notifications')}
            aria-label="Notifications"
            className={`relative min-w-[38px] min-h-[44px] flex items-center justify-center rounded-xl transition-colors ${
              activeView === 'notifications'
                ? 'text-[#F5C542]'
                : 'text-[#F5C542]/90 hover:text-[#F5C542] hover:bg-[#19191D]'
            }`}
          >
            <Bell className="w-5 h-5" />
            {unreadNotifications > 0 && (
              <span className="absolute top-1.5 right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#EF4444] text-[#FFFFFF] text-[10px] font-bold flex items-center justify-center leading-none tabular-nums shadow-sm">
                {unreadNotifications > 99 ? '99+' : unreadNotifications}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('messages')}
            aria-label="Messages"
            className={`relative min-w-[38px] min-h-[44px] flex items-center justify-center rounded-xl transition-colors ${
              activeView === 'messages'
                ? 'text-[#F5C542]'
                : 'text-[#F5C542]/90 hover:text-[#F5C542] hover:bg-[#19191D]'
            }`}
          >
            <MessageSquare className="w-5 h-5" />
            {unreadMessages > 0 && (
              <span className="absolute top-1.5 right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#F5C542] text-[#050505] text-[10px] font-bold flex items-center justify-center leading-none tabular-nums shadow-sm">
                {unreadMessages > 99 ? '99+' : unreadMessages}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            aria-label="Settings"
            className={`min-w-[38px] min-h-[44px] flex items-center justify-center rounded-xl transition-colors ${
              activeView === 'settings'
                ? 'text-[#F5C542]'
                : 'text-[#F5C542]/90 hover:text-[#F5C542] hover:bg-[#19191D]'
            }`}
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 md:pl-20 lg:pl-64 pb-24 md:pb-10 min-w-0">
        {maintenanceNotice && (
          <div className="bg-[#111114] border-b border-[#F5C542]/30 px-4 py-2.5 text-center text-xs text-[#F5C542]">
            {maintenanceNotice}
          </div>
        )}
        <div className="max-w-5xl mx-auto px-3.5 sm:px-6 lg:px-8 py-4 sm:py-6">{children}</div>
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0B0B0E]/95 backdrop-blur-xl border-t border-[#F5C542]/25 shadow-[0_-8px_30px_rgba(0,0,0,0.85)] pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-5 items-center h-16 px-1">
          {mobileTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeView === tab.id;

            if (tab.id === 'create') {
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onNavigate('create')}
                  aria-label="Create"
                  className="flex flex-col items-center justify-center -mt-4 min-h-[48px] focus-visible:outline-none group"
                >
                  <span className="w-12 h-12 rounded-full bg-gradient-to-br from-[#F8D162] via-[#F5C542] to-[#D99B19] text-[#050505] border-2 border-[#050505] ring-1 ring-[#F5C542]/60 shadow-[0_6px_22px_rgba(245,197,66,0.42)] flex items-center justify-center group-active:scale-95 transition-transform">
                    <Plus className="w-6 h-6 stroke-[2.6]" />
                  </span>
                  <span
                    className={`mt-0.5 text-[10px] font-semibold tracking-tight ${
                      isActive ? 'text-[#F5C542]' : 'text-[#A5A5AD]'
                    }`}
                  >
                    {tab.label}
                  </span>
                </button>
              );
            }

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onNavigate(tab.id)}
                className={`relative min-h-[48px] flex flex-col items-center justify-center gap-1 transition-colors ${
                  isActive ? 'text-[#F5C542]' : 'text-[#A5A5AD] hover:text-[#FFFFFF]'
                }`}
              >
                {isActive && (
                  <span
                    className="absolute top-0 w-7 h-0.5 rounded-full bg-[#F5C542] shadow-[0_0_8px_rgba(245,197,66,0.7)]"
                    aria-hidden="true"
                  />
                )}
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-semibold tracking-tight">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
