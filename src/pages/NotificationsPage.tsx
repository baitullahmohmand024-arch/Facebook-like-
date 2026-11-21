import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AtSign,
  Bell,
  BellRing,
  Check,
  CheckCheck,
  CornerDownRight,
  Heart,
  Megaphone,
  MessageCircle,
  MessageSquare,
  RefreshCw,
  Trash2,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { FriendRequest, NotificationItem } from '../types';
import {
  clearAllNotifications,
  deleteNotificationById,
  markAllNotificationsRead,
  markNotificationRead,
  normalizeNotificationType,
  respondToFriendRequest,
} from '../services/notificationService';
import {
  getBrowserNotificationPermission,
  getPushSupportState,
  PushSupportState,
} from '../services/fcmService';
import { Avatar } from '../components/Avatar';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { formatRelativeTime } from '../utils/formatters';
import { playSound } from '../utils/soundVfx';

interface NotificationsPageProps {
  initialTab?: 'all' | 'unread' | 'requests';
  onOpenProfile: (userId: string) => void;
  onOpenNotification: (item: NotificationItem) => void;
}

type FilterTab = 'all' | 'unread' | 'requests' | 'messages' | 'activity';

function formatExactDateTime(ts: NotificationItem['createdAt']): string {
  if (!ts) return 'Just now';
  try {
    return ts.toDate().toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function NotificationsPage({
  initialTab = 'all',
  onOpenProfile,
  onOpenNotification,
}: NotificationsPageProps) {
  const {
    profile,
    notifications,
    notificationsLoading,
    notificationsError,
    hasMoreNotifications,
    loadingMoreNotifications,
    incomingFriendRequests,
    unreadNotifications,
    loadMoreNotifications,
    refreshNotifications,
    enablePushNotifications,
    notificationPreferences,
  } = useAuth();
  const { showToast } = useToast();

  const [tab, setTab] = useState<FilterTab>(initialTab);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);
  const [clearingAll, setClearingAll] = useState(false);
  const [busyRequestIds, setBusyRequestIds] = useState<Set<string>>(new Set());
  const [enablingPush, setEnablingPush] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<NotificationItem | null>(null);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | 'unsupported'>(
    () => getBrowserNotificationPermission()
  );
  const [pushSupport, setPushSupport] = useState<PushSupportState>('supported');

  useEffect(() => {
    setBrowserPermission(getBrowserNotificationPermission());
    void getPushSupportState().then(setPushSupport);
  }, []);

  const filteredItems = useMemo(() => {
    return notifications.filter((item) => {
      const canonical = normalizeNotificationType(item.type);
      if (tab === 'unread') return !item.isRead;
      if (tab === 'requests') {
        return canonical === 'FRIEND_REQUEST' || canonical === 'FRIEND_REQUEST_ACCEPTED';
      }
      if (tab === 'messages') return canonical === 'NEW_MESSAGE';
      if (tab === 'activity') {
        return (
          canonical === 'POST_LIKE' ||
          canonical === 'POST_COMMENT' ||
          canonical === 'COMMENT_REPLY' ||
          canonical === 'NEW_FOLLOWER' ||
          canonical === 'USER_MENTION'
        );
      }
      return true;
    });
  }, [notifications, tab]);

  const getTypeBadge = (type: NotificationItem['type']) => {
    const canonical = normalizeNotificationType(type);
    switch (canonical) {
      case 'NEW_MESSAGE':
        return {
          icon: <MessageSquare className="w-3.5 h-3.5 text-[#050505]" />,
          bg: 'bg-[#F5C542]',
          label: 'Message',
        };
      case 'POST_LIKE':
        return {
          icon: <Heart className="w-3.5 h-3.5 text-[#F5C542] fill-[#F5C542]" />,
          bg: 'bg-[#19191D] border border-[#F5C542]/40',
          label: 'Like',
        };
      case 'POST_COMMENT':
        return {
          icon: <MessageCircle className="w-3.5 h-3.5 text-[#F5C542]" />,
          bg: 'bg-[#19191D] border border-[#F5C542]/40',
          label: 'Comment',
        };
      case 'COMMENT_REPLY':
        return {
          icon: <CornerDownRight className="w-3.5 h-3.5 text-[#F5C542]" />,
          bg: 'bg-[#19191D] border border-[#F5C542]/40',
          label: 'Reply',
        };
      case 'NEW_FOLLOWER':
        return {
          icon: <UserPlus className="w-3.5 h-3.5 text-[#F5C542]" />,
          bg: 'bg-[#19191D] border border-[#F5C542]/40',
          label: 'Follow',
        };
      case 'FRIEND_REQUEST':
        return {
          icon: <UserPlus className="w-3.5 h-3.5 text-[#050505]" />,
          bg: 'bg-[#F5C542]',
          label: 'Friend Request',
        };
      case 'FRIEND_REQUEST_ACCEPTED':
        return {
          icon: <UserCheck className="w-3.5 h-3.5 text-[#050505]" />,
          bg: 'bg-[#F5C542]',
          label: 'Friend Accepted',
        };
      case 'USER_MENTION':
        return {
          icon: <AtSign className="w-3.5 h-3.5 text-[#F5C542]" />,
          bg: 'bg-[#19191D] border border-[#F5C542]/40',
          label: 'Mention',
        };
      case 'IMPORTANT_APP_ANNOUNCEMENT':
      default:
        return {
          icon: <Megaphone className="w-3.5 h-3.5 text-[#050505]" />,
          bg: 'bg-gradient-to-br from-[#F8D162] to-[#D99B19]',
          label: 'Announcement',
        };
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead(notifications);
      playSound('ui-tap');
      showToast({ type: 'success', title: 'All notifications marked as read' });
    } catch {
      showToast({ type: 'error', title: 'Could not mark notifications as read' });
    }
  };

  const handleClearAll = async () => {
    setClearingAll(true);
    try {
      await clearAllNotifications(notifications);
      setConfirmClearOpen(false);
      showToast({ type: 'success', title: 'Notifications cleared' });
    } catch {
      showToast({ type: 'error', title: 'Could not clear notifications' });
    } finally {
      setClearingAll(false);
    }
  };

  const handleDeleteOne = async (id: string) => {
    try {
      await deleteNotificationById(id);
    } catch {
      showToast({ type: 'error', title: 'Could not remove notification' });
    }
  };

  const handleFriendDecision = async (
    req: FriendRequest,
    decision: 'accepted' | 'declined'
  ) => {
    if (!profile) return;
    setBusyRequestIds((prev) => new Set(prev).add(req.id));
    try {
      await respondToFriendRequest(req, profile, decision);
      const matchingNotifs = notifications.filter(
        (n) => !n.isRead && n.relatedRequestId === req.id
      );
      if (matchingNotifs.length > 0) {
        await Promise.all(matchingNotifs.map((n) => markNotificationRead(n.id).catch(() => {})));
      }
      playSound(decision === 'accepted' ? 'follow' : 'ui-tap');
      showToast({
        type: 'success',
        title:
          decision === 'accepted'
            ? `You and ${req.senderName} are now friends`
            : 'Friend request declined',
      });
    } catch {
      showToast({ type: 'error', title: 'Could not respond to friend request' });
    } finally {
      setBusyRequestIds((prev) => {
        const next = new Set(prev);
        next.delete(req.id);
        return next;
      });
    }
  };

  const handleEnablePush = async () => {
    setEnablingPush(true);
    try {
      const res = await enablePushNotifications();
      setBrowserPermission(getBrowserNotificationPermission());
      void getPushSupportState().then(setPushSupport);
      if (res.ok) {
        showToast({ type: 'success', title: 'Push notifications enabled for this device' });
      } else {
        showToast({
          type: 'info',
          title: 'Push notifications',
          description: res.reason,
        });
      }
    } finally {
      setEnablingPush(false);
    }
  };

  const handleCardClick = (item: NotificationItem) => {
    if (!item.isRead) {
      void markNotificationRead(item.id);
    }
    const canonical = normalizeNotificationType(item.type);
    if (canonical === 'IMPORTANT_APP_ANNOUNCEMENT') {
      setSelectedAnnouncement(item);
      return;
    }
    onOpenNotification(item);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#FFFFFF]">
            Notifications
          </h1>
          <p className="text-xs text-[#A5A5AD] mt-0.5">
            Messages, friend requests, likes, comments, replies, mentions & announcements
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {unreadNotifications > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-[#F5C542]/30 bg-[#111114] text-[#FFFFFF] hover:border-[#F5C542]/60 hover:bg-[#19191D] inline-flex items-center gap-1.5 transition-colors"
            >
              <CheckCheck className="w-4 h-4 text-[#F5C542]" />
              <span>Mark all read</span>
            </button>
          )}
          {notifications.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmClearOpen(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-medium border border-white/10 bg-[#111114] text-[#A5A5AD] hover:text-rose-400 hover:border-rose-500/30 inline-flex items-center gap-1.5 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear all</span>
            </button>
          )}
        </div>
      </div>

      {/* Optional Push Prompt Card */}
      {pushSupport === 'supported' &&
        (browserPermission === 'default' ||
          (browserPermission === 'granted' &&
            notificationPreferences !== null &&
            !notificationPreferences.pushEnabled)) && (
        <div className="rounded-2xl bg-[#111114] border border-[#F5C542]/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#F5C542]/15 border border-[#F5C542]/35 flex items-center justify-center shrink-0">
              <BellRing className="w-4 h-4 text-[#F5C542]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#FFFFFF]">
                Get real-time alerts even when Hostel Friend is closed
              </p>
              <p className="text-xs text-[#A5A5AD] mt-0.5">
                Enable push notifications for instant messages, friend requests, and replies.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={enablingPush}
            onClick={handleEnablePush}
            className="gold-gradient-btn px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            {enablingPush ? 'Enabling...' : 'Enable Push'}
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {(
          [
            { id: 'all', label: 'All', badge: 0 },
            { id: 'unread', label: 'Unread', badge: unreadNotifications },
            { id: 'requests', label: 'Requests', badge: incomingFriendRequests.length },
            { id: 'messages', label: 'Messages', badge: 0 },
            { id: 'activity', label: 'Activity', badge: 0 },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all ${
              tab === item.id
                ? 'bg-gradient-to-r from-[#F5C542] to-[#D99B19] text-[#050505] shadow-[0_2px_12px_rgba(245,197,66,0.28)]'
                : 'bg-[#111114] border border-white/[0.08] text-[#A5A5AD] hover:text-[#FFFFFF]'
            }`}
          >
            <span>{item.label}</span>
            {item.badge > 0 && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none tabular-nums ${
                  tab === item.id ? 'bg-[#050505] text-[#F5C542]' : 'bg-[#F5C542] text-[#050505]'
                }`}
              >
                {item.badge > 99 ? '99+' : item.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Pending Friend Requests Interactive Section */}
      {(tab === 'all' || tab === 'requests') && incomingFriendRequests.length > 0 && (
        <section className="bg-[#111114] border border-[#F5C542]/30 rounded-2xl overflow-hidden shadow-[0_10px_28px_rgba(0,0,0,0.45)]">
          <div className="px-4 sm:px-5 py-3 border-b border-white/[0.08] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-[#F5C542]" />
              <h2 className="font-display text-sm font-semibold text-[#FFFFFF]">
                Pending Friend Requests
              </h2>
            </div>
            <span className="text-xs font-mono font-semibold text-[#F5C542] tabular-nums">
              {incomingFriendRequests.length}
            </span>
          </div>

          <div className="divide-y divide-white/[0.06]">
            {incomingFriendRequests.map((req) => {
              const busy = busyRequestIds.has(req.id);
              return (
                <div
                  key={req.id}
                  className="px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <button
                    type="button"
                    onClick={() => onOpenProfile(req.senderId)}
                    className="flex items-center gap-3 text-left min-w-0 group"
                  >
                    <Avatar src={req.senderAvatarUrl} name={req.senderName} size="md" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#FFFFFF] group-hover:text-[#F5C542] truncate transition-colors">
                        {req.senderName}
                      </p>
                      <p className="text-xs text-[#A5A5AD] truncate">
                        @{req.senderUsername} · {formatRelativeTime(req.createdAt)}
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleFriendDecision(req, 'accepted')}
                      className="gold-gradient-btn px-3.5 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Add Friend</span>
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleFriendDecision(req, 'declined')}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-medium border border-white/15 bg-[#19191D] text-[#A5A5AD] hover:text-[#FFFFFF] inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Decline</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Error State */}
      {notificationsError && (
        <div className="bg-[#111114] border border-rose-500/30 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <p className="text-sm text-[#FFFFFF]">{notificationsError}</p>
          </div>
          <button
            type="button"
            onClick={refreshNotifications}
            className="px-4 py-2 rounded-xl text-xs font-semibold border border-white/15 text-[#FFFFFF] hover:border-[#F5C542]/50 inline-flex items-center gap-1.5 self-start sm:self-auto"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#F5C542]" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Notification List */}
      {notificationsLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-20 rounded-2xl bg-[#111114] border border-white/[0.08] animate-pulse"
            />
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        (tab === 'all' || tab === 'requests') && incomingFriendRequests.length > 0 ? null : (
          <div className="bg-[#111114] border border-[#F5C542]/20 rounded-2xl p-10 sm:p-12 text-center shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
            <div className="w-12 h-12 rounded-2xl bg-[#F5C542]/12 border border-[#F5C542]/30 flex items-center justify-center mx-auto">
              <Bell className="w-6 h-6 text-[#F5C542]" />
            </div>
            <h2 className="mt-4 font-display text-lg font-semibold text-[#FFFFFF]">
              {tab === 'unread' ? 'No unread notifications' : 'All caught up'}
            </h2>
            <p className="mt-1.5 text-sm text-[#A5A5AD] max-w-md mx-auto">
              {tab === 'requests'
                ? 'Incoming friend requests and accepted connections will appear here.'
                : 'Messages, likes, comments, replies, follows, friend requests, and @mentions will show up here in real time.'}
            </p>
          </div>
        )
      ) : (
        <div className="space-y-2.5">
          <div className="bg-[#111114] border border-white/[0.08] rounded-2xl divide-y divide-white/[0.06] overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
            {filteredItems.map((item) => {
              const badge = getTypeBadge(item.type);
              const canonical = normalizeNotificationType(item.type);
              const isAnnouncement = canonical === 'IMPORTANT_APP_ANNOUNCEMENT';
              return (
                <div
                  key={item.id}
                  onClick={() => handleCardClick(item)}
                  className={`px-4 sm:px-5 py-4 flex items-start sm:items-center justify-between gap-3 transition-colors cursor-pointer ${
                    item.isRead
                      ? 'hover:bg-white/[0.02]'
                      : 'bg-[#F5C542]/[0.06] hover:bg-[#F5C542]/[0.1]'
                  }`}
                >
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isAnnouncement) onOpenProfile(item.actorId);
                      }}
                      className="relative shrink-0"
                    >
                      <Avatar src={item.actorAvatarUrl} name={item.actorName} size="md" />
                      <span
                        className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center shadow-md ${badge.bg}`}
                        title={badge.label}
                      >
                        {badge.icon}
                      </span>
                    </button>

                    <div className="min-w-0 flex-1">
                      {isAnnouncement && item.title && (
                        <p className="text-xs font-bold uppercase tracking-wider text-[#F5C542] mb-0.5">
                          {item.title}
                        </p>
                      )}
                      <p className="text-sm text-[#FFFFFF] leading-snug break-words">
                        {!isAnnouncement && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenProfile(item.actorId);
                            }}
                            className="font-semibold hover:text-[#F5C542] mr-1.5"
                          >
                            {item.actorName}
                          </button>
                        )}
                        <span className="text-[#A5A5AD]">
                          {isAnnouncement ? item.body || item.message : item.message}
                        </span>
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-[#A5A5AD]/80">
                        <span>{formatRelativeTime(item.createdAt)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatExactDateTime(item.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  <div
                    className="flex items-center gap-1.5 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {!item.isRead && (
                      <button
                        type="button"
                        onClick={() => void markNotificationRead(item.id)}
                        title="Mark as read"
                        aria-label="Mark as read"
                        className="p-2 rounded-xl text-[#F5C542] hover:bg-[#F5C542]/15 transition-colors flex items-center gap-1"
                      >
                        <span className="w-2 h-2 rounded-full bg-[#F5C542]" />
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleDeleteOne(item.id)}
                      title="Delete notification"
                      aria-label="Delete notification"
                      className="p-2 rounded-xl text-[#A5A5AD] hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {hasMoreNotifications && (
            <div className="pt-2 text-center">
              <button
                type="button"
                disabled={loadingMoreNotifications}
                onClick={loadMoreNotifications}
                className="px-5 py-2.5 rounded-full border border-[#F5C542]/30 bg-[#111114] text-xs font-semibold text-[#F5C542] hover:bg-[#19191D] disabled:opacity-50"
              >
                {loadingMoreNotifications ? 'Loading...' : 'Load Earlier Notifications'}
              </button>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmClearOpen}
        title="Clear all notifications?"
        description="This will permanently remove all notifications from your notification inbox."
        confirmLabel="Clear All"
        destructive
        loading={clearingAll}
        onConfirm={handleClearAll}
        onCancel={() => setConfirmClearOpen(false)}
      />

      {selectedAnnouncement && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedAnnouncement(null)}
        >
          <div
            className="w-full max-w-md bg-[#111114] border border-[#F5C542]/35 rounded-2xl p-6 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#F8D162] to-[#D99B19] flex items-center justify-center">
                  <Megaphone className="w-4 h-4 text-[#050505]" />
                </span>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#F5C542]">
                    Official Announcement
                  </p>
                  <p className="text-xs text-[#A5A5AD]">
                    {formatExactDateTime(selectedAnnouncement.createdAt)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAnnouncement(null)}
                aria-label="Close announcement"
                className="text-[#A5A5AD] hover:text-[#FFFFFF] p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <h3 className="font-display text-lg font-bold text-[#FFFFFF]">
              {selectedAnnouncement.title || 'Hostel Friend Announcement'}
            </h3>
            <p className="text-sm text-[#A5A5AD] leading-relaxed whitespace-pre-wrap">
              {selectedAnnouncement.body || selectedAnnouncement.message}
            </p>
            <button
              type="button"
              onClick={() => setSelectedAnnouncement(null)}
              className="w-full gold-gradient-btn py-2.5 rounded-xl text-xs font-bold"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
