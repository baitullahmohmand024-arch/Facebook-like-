import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, MessageSquare, Search, Send } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ChatMessage, Conversation, UserProfile } from '../types';
import {
  getOrCreateConversation,
  markConversationRead,
  sendMessage,
  subscribeConversations,
  subscribeMessages,
} from '../services/socialService';
import { fetchDiscoverMembers } from '../services/userService';
import { Avatar } from '../components/Avatar';
import { formatRelativeTime } from '../utils/formatters';

interface MessagesPageProps {
  initialTargetUser?: UserProfile | null;
  onClearInitialTarget?: () => void;
  onOpenProfile: (userId: string) => void;
}

export function MessagesPage({
  initialTargetUser,
  onClearInitialTarget,
  onOpenProfile,
}: MessagesPageProps) {
  const { profile, privateSettings } = useAuth();
  const { showToast } = useToast();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [allMembers, setAllMembers] = useState<UserProfile[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const blockedSet = useMemo(
    () => new Set(privateSettings?.blockedUserIds || []),
    [privateSettings]
  );

  // Load conversations list in real time
  useEffect(() => {
    if (!profile) return;
    setLoadingConvs(true);
    const unsub = subscribeConversations(profile.uid, (list) => {
      setConversations(list);
      setLoadingConvs(false);
    });
    fetchDiscoverMembers(40)
      .then((m) => setAllMembers(m.filter((u) => u.uid !== profile.uid)))
      .catch(() => {});
    return () => unsub();
  }, [profile]);

  // Open target user conversation if navigated from a Profile
  useEffect(() => {
    if (!profile || !initialTargetUser) return;
    if (blockedSet.has(initialTargetUser.uid)) {
      showToast({ type: 'error', title: 'Cannot message a blocked member' });
      onClearInitialTarget?.();
      return;
    }
    getOrCreateConversation(profile, initialTargetUser)
      .then((conv) => {
        setSelectedConv(conv);
        onClearInitialTarget?.();
      })
      .catch(() => {
        showToast({ type: 'error', title: 'Could not start conversation' });
      });
  }, [profile, initialTargetUser, blockedSet, onClearInitialTarget, showToast]);

  // Subscribe to messages for selected conversation
  useEffect(() => {
    if (!profile || !selectedConv) {
      setMessages([]);
      return;
    }
    markConversationRead(selectedConv, profile.uid).catch(() => {});
    const unsub = subscribeMessages(selectedConv.id, profile.uid, (msgs) => {
      setMessages(msgs);
      markConversationRead(selectedConv, profile.uid).catch(() => {});
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
    });
    return () => unsub();
  }, [profile, selectedConv]);

  const getOtherParticipant = (conv: Conversation) => {
    if (!profile) {
      return {
        uid: conv.participantBId,
        name: conv.participantBName,
        username: conv.participantBUsername,
        avatar: conv.participantBAvatar,
        unread: 0,
      };
    }
    const isA = conv.participantAId === profile.uid;
    return {
      uid: isA ? conv.participantBId : conv.participantAId,
      name: isA ? conv.participantBName : conv.participantAName,
      username: isA ? conv.participantBUsername : conv.participantAUsername,
      avatar: isA ? conv.participantBAvatar : conv.participantAAvatar,
      unread: isA ? conv.unreadByA : conv.unreadByB,
    };
  };

  const handleStartChatWithMember = async (member: UserProfile) => {
    if (!profile) return;
    try {
      const conv = await getOrCreateConversation(profile, member);
      setSelectedConv(conv);
      setMemberSearch('');
    } catch {
      showToast({ type: 'error', title: 'Could not open conversation' });
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !selectedConv || !messageText.trim() || sending) return;
    const other = getOtherParticipant(selectedConv);
    if (blockedSet.has(other.uid)) {
      showToast({ type: 'error', title: 'Unblock this member before sending messages' });
      return;
    }
    setSending(true);
    const outgoing = messageText;
    setMessageText('');
    try {
      await sendMessage(selectedConv, profile.uid, outgoing);
    } catch {
      setMessageText(outgoing);
      showToast({ type: 'error', title: 'Failed to send message' });
    } finally {
      setSending(false);
    }
  };

  const matchingMembers = memberSearch.trim()
    ? allMembers
        .filter((m) => !blockedSet.has(m.uid))
        .filter(
          (m) =>
            m.usernameLower.includes(memberSearch.trim().toLowerCase().replace(/^@/, '')) ||
            m.fullName.toLowerCase().includes(memberSearch.trim().toLowerCase())
        )
        .slice(0, 5)
    : [];

  const activeOther = selectedConv ? getOtherParticipant(selectedConv) : null;

  return (
    <div className="bg-[#151519] border border-white/[0.08] rounded-2xl overflow-hidden h-[calc(100vh-11rem)] md:h-[calc(100vh-5rem)] grid grid-cols-1 md:grid-cols-12">
      {/* Left Conversation List */}
      <div
        className={`md:col-span-4 border-r border-white/[0.08] flex flex-col min-h-0 ${
          selectedConv ? 'hidden md:flex' : 'flex'
        }`}
      >
        <div className="p-4 border-b border-white/[0.06] space-y-3">
          <h1 className="font-display text-lg font-bold text-[#F8F9FA]">Messages</h1>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#71717A] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Start chat with @member..."
              className="w-full rounded-xl bg-[#0A0A0C] border border-white/10 pl-9 pr-3 py-2 text-xs text-[#F8F9FA] placeholder:text-[#71717A] focus:outline-none focus:border-[#D4AF37]"
            />
          </div>

          {matchingMembers.length > 0 && (
            <div className="rounded-xl bg-[#0A0A0C] border border-white/10 divide-y divide-white/[0.06]">
              {matchingMembers.map((m) => (
                <button
                  key={m.uid}
                  type="button"
                  onClick={() => handleStartChatWithMember(m)}
                  className="w-full px-3 py-2.5 text-left flex items-center gap-2.5 hover:bg-white/[0.04]"
                >
                  <Avatar src={m.avatarUrl} name={m.fullName} size="xs" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#F8F9FA] truncate">{m.fullName}</p>
                    <p className="text-[11px] text-[#A1A1AA] truncate">@{m.username}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-white/[0.05]">
          {loadingConvs ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 rounded-xl bg-white/[0.04] animate-pulse" />
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-8 text-center">
              <MessageSquare className="w-7 h-7 text-[#D4AF37] mx-auto" />
              <p className="mt-3 text-xs font-medium text-[#F8F9FA]">No conversations yet</p>
              <p className="mt-1 text-[11px] text-[#71717A]">
                Search for a hostel member above or tap Message on their profile.
              </p>
            </div>
          ) : (
            conversations.map((conv) => {
              const other = getOtherParticipant(conv);
              const isSelected = selectedConv?.id === conv.id;
              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => setSelectedConv(conv)}
                  className={`w-full px-4 py-3.5 text-left flex items-center gap-3 transition-colors ${
                    isSelected ? 'bg-[#D4AF37]/10' : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <Avatar src={other.avatar} name={other.name} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[#F8F9FA] truncate">{other.name}</p>
                      <span className="text-[11px] text-[#71717A] shrink-0">
                        {formatRelativeTime(conv.lastMessageAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-xs text-[#A1A1AA] truncate">
                        {conv.lastMessageText || `@${other.username}`}
                      </p>
                      {other.unread > 0 && (
                        <span className="font-mono text-[11px] font-semibold text-[#D4AF37] shrink-0">
                          {other.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right Chat Thread */}
      <div
        className={`md:col-span-8 flex flex-col min-h-0 ${
          selectedConv ? 'flex' : 'hidden md:flex'
        }`}
      >
        {selectedConv && activeOther ? (
          <>
            <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setSelectedConv(null)}
                  aria-label="Back to conversations"
                  className="md:hidden p-1.5 rounded-lg text-[#A1A1AA] hover:text-[#F8F9FA]"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => onOpenProfile(activeOther.uid)}
                  className="flex items-center gap-3 text-left group min-w-0"
                >
                  <Avatar src={activeOther.avatar} name={activeOther.name} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#F8F9FA] group-hover:text-[#D4AF37] truncate">
                      {activeOther.name}
                    </p>
                    <p className="text-xs text-[#A1A1AA] truncate">@{activeOther.username}</p>
                  </div>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-[#0A0A0C]/40">
              {messages.length === 0 ? (
                <p className="text-xs text-[#71717A] text-center py-10">
                  Say hello to @{activeOther.username}. Messages are private between you two.
                </p>
              ) : (
                messages.map((msg) => {
                  const mine = msg.senderId === profile?.uid;
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words ${
                          mine
                            ? 'bg-[#D4AF37] text-[#0A0A0C] font-medium'
                            : 'bg-[#151519] border border-white/10 text-[#F8F9FA]'
                        }`}
                      >
                        {msg.text}
                      </div>
                      <span className="mt-1 text-[10px] text-[#71717A] px-1">
                        {formatRelativeTime(msg.createdAt)}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            <form
              onSubmit={handleSend}
              className="p-4 border-t border-white/[0.06] flex items-center gap-2.5 bg-[#151519]"
            >
              <input
                type="text"
                maxLength={1000}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder={`Message @${activeOther.username}...`}
                className="flex-1 rounded-xl bg-[#0A0A0C] border border-white/10 px-4 py-2.5 text-sm text-[#F8F9FA] placeholder:text-[#71717A] focus:outline-none focus:border-[#D4AF37]"
              />
              <button
                type="submit"
                disabled={sending || !messageText.trim()}
                aria-label="Send message"
                className="gold-gradient-btn px-4 py-2.5 rounded-xl flex items-center justify-center disabled:opacity-40"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <MessageSquare className="w-10 h-10 text-[#D4AF37]" />
            <h2 className="mt-4 font-display text-lg font-semibold text-[#F8F9FA]">
              Private Hostel Messaging
            </h2>
            <p className="mt-1.5 text-xs text-[#A1A1AA] max-w-sm">
              Select a conversation from the left or search for a member to start a direct chat.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
