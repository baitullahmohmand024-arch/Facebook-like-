import { useEffect, useState } from 'react';
import { AtSign, Bell, CheckCheck, Heart, MessageCircle, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { NotificationItem } from '../types';
import {
  markAllNotificationsRead,
  markNotificationRead,
  subscribeNotifications,
} from '../services/socialService';
import { Avatar } from '../components/Avatar';
import { formatRelativeTime } from '../utils/formatters';

interface NotificationsPageProps {
  onOpenProfile: (userId: string) => void;
}

export function NotificationsPage({ onOpenProfile }: NotificationsPageProps) {
  const { profile } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    setLoading(true);
    const unsub = subscribeNotifications(profile.uid, (list) => {
      setItems(list);
      setLoading(false);
    });
    return () => unsub();
  }, [profile]);

  const unreadCount = items.filter((n) => !n.isRead).length;

  const getTypeIcon = (type: NotificationItem['type']) => {
    if (type === 'like') return <Heart className="w-4 h-4 text-[#D4AF37]" />;
    if (type === 'comment') return <MessageCircle className="w-4 h-4 text-[#D4AF37]" />;
    if (type === 'follow') return <UserPlus className="w-4 h-4 text-[#D4AF37]" />;
    if (type === 'mention') return <AtSign className="w-4 h-4 text-[#D4AF37]" />;
    return <Bell className="w-4 h-4 text-[#D4AF37]" />;
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#F8F9FA]">
            Notifications
          </h1>
          <p className="text-xs text-[#A1A1AA] mt-0.5">
            Real-time followers, likes, comments, and @mentions
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => markAllNotificationsRead(items)}
            className="px-4 py-2 rounded-xl text-xs font-medium border border-white/10 bg-[#151519] text-[#F8F9FA] hover:border-[#D4AF37]/40 inline-flex items-center gap-2 self-start sm:self-auto"
          >
            <CheckCheck className="w-4 h-4 text-[#D4AF37]" />
            <span>Mark all as read</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 rounded-2xl bg-[#151519] border border-white/[0.08] animate-pulse"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-[#151519] border border-white/[0.08] rounded-2xl p-12 text-center">
          <Bell className="w-9 h-9 text-[#D4AF37] mx-auto" />
          <h2 className="mt-4 font-display text-lg font-semibold text-[#F8F9FA]">
            All caught up
          </h2>
          <p className="mt-1.5 text-sm text-[#A1A1AA]">
            Activity from likes, comments, follows, and mentions will appear here instantaneously.
          </p>
        </div>
      ) : (
        <div className="bg-[#151519] border border-white/[0.08] rounded-2xl divide-y divide-white/[0.06] overflow-hidden">
          {items.map((item) => (
            <div
              key={item.id}
              onClick={() => {
                if (!item.isRead) markNotificationRead(item.id);
              }}
              className={`px-5 py-4 flex items-center justify-between gap-4 transition-colors cursor-pointer ${
                item.isRead ? 'hover:bg-white/[0.02]' : 'bg-[#D4AF37]/[0.04] hover:bg-[#D4AF37]/[0.07]'
              }`}
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenProfile(item.actorId);
                  }}
                  className="shrink-0"
                >
                  <Avatar src={item.actorAvatarUrl} name={item.actorName} size="md" />
                </button>
                <div className="min-w-0">
                  <p className="text-sm text-[#F8F9FA] leading-snug">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenProfile(item.actorId);
                      }}
                      className="font-semibold hover:text-[#D4AF37] mr-1.5"
                    >
                      {item.actorName}
                    </button>
                    <span className="text-[#A1A1AA]">{item.message}</span>
                  </p>
                  <p className="mt-1 text-xs text-[#71717A] flex items-center gap-2">
                    {getTypeIcon(item.type)}
                    <span>{formatRelativeTime(item.createdAt)}</span>
                  </p>
                </div>
              </div>

              {!item.isRead && (
                <span className="text-[11px] font-medium text-[#D4AF37] shrink-0">Unread</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
