import React, { useEffect, useState } from 'react';
import {
  Bell,
  Compass,
  Film,
  Home,
  LogOut,
  MessageSquare,
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
    <div className="min-h-screen bg-[#0A0A0C] text-[#F8F9FA] flex flex-col md:flex-row">
      {/* Desktop Left Sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-20 lg:w-64 md:fixed md:inset-y-0 md:left-0 bg-[#0A0A0C] border-r border-white/[0.08] z-30">
        <div className="px-4 lg:px-6 h-20 flex items-center justify-center lg:justify-start border-b border-white/[0.06]">
          <button
            type="button"
            onClick={() => onNavigate('feed')}
            className="flex items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C8FF] rounded-lg"
          >
            <img
              src="/icons/icon-192.png"
              alt="Hostel Friend"
              className="w-8 h-8 rounded-lg object-cover border border-white/15 shrink-0"
            />
            <span className="hidden lg:inline font-display font-bold tracking-tight text-lg text-[#F8F9FA] whitespace-nowrap shrink-0">
              Hostel Friend
            </span>
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
                    ? 'bg-[#151519] text-[#D4AF37] border border-[#D4AF37]/25'
                    : 'text-[#A1A1AA] hover:text-[#F8F9FA] hover:bg-white/[0.04] border border-transparent'
                }`}
              >
                <span className="flex items-center gap-3.5 min-w-0">
                  <Icon className="w-5 h-5 shrink-0" />
                  <span className="hidden lg:inline text-sm font-medium truncate">{item.label}</span>
                </span>
                {typeof item.count === 'number' && item.count > 0 && (
                  <span className="hidden lg:inline font-mono text-xs tabular-nums text-[#D4AF37] font-medium">
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

      {/* Mobile Compact Top Bar */}
      <header className="md:hidden sticky top-0 z-30 h-14 px-4 bg-[#0A0A0C]/90 backdrop-blur-xl border-b border-white/[0.08] flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => onNavigate('feed')}
          className="flex items-center gap-2.5 whitespace-nowrap shrink-0"
        >
          <img
            src="/icons/icon-192.png"
            alt="Hostel Friend"
            className="w-7 h-7 rounded-lg object-cover border border-white/15 shrink-0"
          />
          <span className="font-display font-bold tracking-tight text-base text-[#F8F9FA]">
            Hostel Friend
          </span>
        </button>

        <div className="flex items-center gap-0.5">
          <PWAInstallButton variant="compact" className="mr-1" />
          <button
            type="button"
            onClick={() => toggleSoundVfx()}
            aria-label={soundOn ? 'Mute Sound VFX' : 'Enable Sound VFX'}
            className={`min-w-[40px] min-h-[44px] flex items-center justify-center rounded-xl transition-colors ${
              soundOn ? 'text-[#D4AF37]' : 'text-[#71717A]'
            }`}
          >
            {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('notifications')}
            aria-label="Notifications"
            className={`relative min-w-[42px] min-h-[44px] flex items-center justify-center rounded-xl transition-colors ${
              activeView === 'notifications' ? 'text-[#D4AF37]' : 'text-[#A1A1AA]'
            }`}
          >
            <Bell className="w-5 h-5" />
            {unreadNotifications > 0 && (
              <span className="absolute top-2 right-2 text-[10px] font-mono font-semibold text-[#D4AF37]">
                {unreadNotifications}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('messages')}
            aria-label="Messages"
            className={`relative min-w-[42px] min-h-[44px] flex items-center justify-center rounded-xl transition-colors ${
              activeView === 'messages' ? 'text-[#D4AF37]' : 'text-[#A1A1AA]'
            }`}
          >
            <MessageSquare className="w-5 h-5" />
            {unreadMessages > 0 && (
              <span className="absolute top-2 right-2 text-[10px] font-mono font-semibold text-[#D4AF37]">
                {unreadMessages}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            aria-label="Settings"
            className={`min-w-[42px] min-h-[44px] flex items-center justify-center rounded-xl transition-colors ${
              activeView === 'settings' ? 'text-[#D4AF37]' : 'text-[#A1A1AA]'
            }`}
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 md:pl-20 lg:pl-64 pb-20 md:pb-10 min-w-0">
        {maintenanceNotice && (
          <div className="bg-[#151519] border-b border-[#D4AF37]/30 px-4 py-2.5 text-center text-xs text-[#E7C96F]">
            {maintenanceNotice}
          </div>
        )}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">{children}</div>
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 h-16 bg-[#0A0A0C]/95 backdrop-blur-xl border-t border-white/[0.08] grid grid-cols-5 items-center"
      >
        {mobileTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeView === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onNavigate(tab.id)}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-1 transition-colors ${
                isActive ? 'text-[#D4AF37]' : 'text-[#A1A1AA]'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium tracking-tight">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
