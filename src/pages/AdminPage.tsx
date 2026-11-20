import React, { useCallback, useEffect, useState } from 'react';
import { Check, Megaphone, Send, Shield, Sliders, Trash2, UserX, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ModerationReport, UserProfile } from '../types';
import {
  adminDeletePostById,
  adminToggleUserSuspension,
  fetchAdminActivityOverview,
  fetchAllReports,
  savePlatformSettings,
  updateReportStatus,
} from '../services/socialService';
import { sendAdminAnnouncement } from '../services/notificationService';
import { Avatar } from '../components/Avatar';
import { formatRelativeTime } from '../utils/formatters';

export function AdminPage() {
  const { profile, isAdmin, platformSettings, refreshPlatformSettings } = useAuth();
  const { showToast } = useToast();

  const [tab, setTab] = useState<'reports' | 'members' | 'announcements' | 'settings'>('reports');
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [postsSampled, setPostsSampled] = useState(0);
  const [loading, setLoading] = useState(true);

  // Announcement broadcast form
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementBody, setAnnouncementBody] = useState('');
  const [sendingAnnouncement, setSendingAnnouncement] = useState(false);

  // Platform config form
  const [maxUploadSizeMB, setMaxUploadSizeMB] = useState(platformSettings.maxUploadSizeMB);
  const [allowNewRegistrations, setAllowNewRegistrations] = useState(
    platformSettings.allowNewRegistrations
  );
  const [maintenanceNotice, setMaintenanceNotice] = useState(platformSettings.maintenanceNotice);
  const [hashtagsCsv, setHashtagsCsv] = useState(platformSettings.featuredHashtags.join(', '));
  const [savingSettings, setSavingSettings] = useState(false);

  const loadAdminData = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const [reportList, overview] = await Promise.all([
        fetchAllReports(),
        fetchAdminActivityOverview(),
      ]);
      setReports(reportList);
      setMembers(overview.users);
      setPostsSampled(overview.totalPostsSampled);
    } catch {
      showToast({ type: 'error', title: 'Could not load moderation console' });
    } finally {
      setLoading(false);
    }
  }, [isAdmin, showToast]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  useEffect(() => {
    setMaxUploadSizeMB(platformSettings.maxUploadSizeMB);
    setAllowNewRegistrations(platformSettings.allowNewRegistrations);
    setMaintenanceNotice(platformSettings.maintenanceNotice);
    setHashtagsCsv(platformSettings.featuredHashtags.join(', '));
  }, [platformSettings]);

  if (!isAdmin) {
    return (
      <div className="max-w-lg mx-auto bg-[#151519] border border-white/[0.08] rounded-2xl p-10 text-center">
        <Shield className="w-8 h-8 text-rose-400 mx-auto" />
        <h1 className="mt-3 font-display text-xl font-bold text-[#F8F9FA]">Access Restricted</h1>
        <p className="mt-2 text-sm text-[#A1A1AA]">
          Administrator privileges are required to view community moderation tools.
        </p>
      </div>
    );
  }

  const handleResolveReport = async (report: ModerationReport, removeTargetPost: boolean) => {
    if (!profile) return;
    try {
      if (removeTargetPost && report.targetType === 'post') {
        await adminDeletePostById(report.targetId);
      }
      await updateReportStatus(report.id, 'resolved', profile.uid);
      setReports((prev) =>
        prev.map((r) =>
          r.id === report.id ? { ...r, status: 'resolved', reviewedBy: profile.uid } : r
        )
      );
      showToast({
        type: 'success',
        title: removeTargetPost ? 'Post removed & report resolved' : 'Report marked resolved',
      });
    } catch {
      showToast({ type: 'error', title: 'Action failed' });
    }
  };

  const handleDismissReport = async (report: ModerationReport) => {
    if (!profile) return;
    try {
      await updateReportStatus(report.id, 'dismissed', profile.uid);
      setReports((prev) =>
        prev.map((r) =>
          r.id === report.id ? { ...r, status: 'dismissed', reviewedBy: profile.uid } : r
        )
      );
      showToast({ type: 'info', title: 'Report dismissed' });
    } catch {
      showToast({ type: 'error', title: 'Could not dismiss report' });
    }
  };

  const handleToggleSuspend = async (member: UserProfile) => {
    const nextSuspended = !member.isSuspended;
    try {
      await adminToggleUserSuspension(member.uid, nextSuspended);
      setMembers((prev) =>
        prev.map((m) => (m.uid === member.uid ? { ...m, isSuspended: nextSuspended } : m))
      );
      showToast({
        type: 'success',
        title: nextSuspended ? `@${member.username} suspended` : `@${member.username} reinstated`,
      });
    } catch {
      showToast({ type: 'error', title: 'Could not update suspension state' });
    }
  };

  const handleSavePlatformSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSavingSettings(true);
    try {
      const tags = hashtagsCsv
        .split(',')
        .map((t) => t.trim().replace(/^#/, '').toLowerCase())
        .filter(Boolean)
        .slice(0, 10);
      await savePlatformSettings(profile.uid, {
        maxUploadSizeMB,
        allowNewRegistrations,
        maintenanceNotice,
        featuredHashtags: tags,
      });
      await refreshPlatformSettings();
      showToast({ type: 'success', title: 'Platform settings saved' });
    } catch {
      showToast({ type: 'error', title: 'Could not save platform settings' });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSendAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || sendingAnnouncement) return;
    setSendingAnnouncement(true);
    try {
      const count = await sendAdminAnnouncement({
        adminProfile: profile,
        title: announcementTitle,
        body: announcementBody,
      });
      setAnnouncementTitle('');
      setAnnouncementBody('');
      showToast({
        type: 'success',
        title: 'Announcement published',
        description:
          count > 0
            ? `Delivered in-app notification to ${count} active member${count === 1 ? '' : 's'}.`
            : 'No active recipient accounts found yet.',
      });
    } catch {
      showToast({ type: 'error', title: 'Could not send announcement' });
    } finally {
      setSendingAnnouncement(false);
    }
  };

  const openReportsCount = reports.filter((r) => r.status === 'open').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#F8F9FA]">
            Administration & Safety
          </h1>
          <p className="text-xs text-[#A1A1AA] mt-0.5">
            Moderate reports, manage member access, and configure platform controls
          </p>
        </div>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#151519] border border-white/[0.08] rounded-2xl p-5">
          <p className="text-xs text-[#A1A1AA]">Open Reports</p>
          <p className="mt-1 font-mono text-2xl font-bold text-[#D4AF37] tabular-nums">
            {openReportsCount}
          </p>
        </div>
        <div className="bg-[#151519] border border-white/[0.08] rounded-2xl p-5">
          <p className="text-xs text-[#A1A1AA]">Active Members Sampled</p>
          <p className="mt-1 font-mono text-2xl font-bold text-[#F8F9FA] tabular-nums">
            {members.length}
          </p>
        </div>
        <div className="bg-[#151519] border border-white/[0.08] rounded-2xl p-5">
          <p className="text-xs text-[#A1A1AA]">Recent Posts Indexed</p>
          <p className="mt-1 font-mono text-2xl font-bold text-[#F8F9FA] tabular-nums">
            {postsSampled}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-[#151519] rounded-xl border border-white/[0.08]">
        {(
          [
            { id: 'reports', label: 'Reported Content' },
            { id: 'members', label: 'Member Activity' },
            { id: 'announcements', label: 'Announcements' },
            { id: 'settings', label: 'Platform Settings' },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              tab === item.id
                ? 'bg-[#D4AF37] text-[#0A0A0C]'
                : 'text-[#A1A1AA] hover:text-[#F8F9FA]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="h-48 rounded-2xl bg-[#151519] border border-white/[0.08] animate-pulse" />
      ) : tab === 'reports' ? (
        <div className="space-y-3">
          {reports.length === 0 ? (
            <div className="bg-[#151519] border border-white/[0.08] rounded-2xl p-10 text-center">
              <p className="text-sm text-[#A1A1AA]">No moderation reports have been filed.</p>
            </div>
          ) : (
            reports.map((report) => (
              <div
                key={report.id}
                className="bg-[#151519] border border-white/[0.08] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-[#F8F9FA]">
                    {report.reason} ·{' '}
                    <span className="text-xs font-normal text-[#A1A1AA]">
                      {report.targetType} ({report.targetId})
                    </span>
                  </p>
                  {report.details && (
                    <p className="text-xs text-[#A1A1AA] leading-relaxed">{report.details}</p>
                  )}
                  <p className="text-[11px] text-[#71717A]">
                    Status: <strong className="text-[#D4AF37]">{report.status}</strong> ·{' '}
                    {formatRelativeTime(report.createdAt)}
                  </p>
                </div>

                {report.status === 'open' && (
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {report.targetType === 'post' && (
                      <button
                        type="button"
                        onClick={() => handleResolveReport(report, true)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-500 inline-flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove Post</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleResolveReport(report, false)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10 inline-flex items-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Resolve</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDismissReport(report)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 text-[#A1A1AA] hover:text-[#F8F9FA] inline-flex items-center gap-1.5"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Dismiss</span>
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      ) : tab === 'members' ? (
        <div className="bg-[#151519] border border-white/[0.08] rounded-2xl divide-y divide-white/[0.06] overflow-hidden">
          {members.map((m) => (
            <div
              key={m.uid}
              className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Avatar src={m.avatarUrl} name={m.fullName} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#F8F9FA] truncate">
                    {m.fullName}{' '}
                    <span className="text-xs font-normal text-[#A1A1AA]">@{m.username}</span>
                  </p>
                  <p className="text-xs text-[#71717A] font-mono tabular-nums">
                    {m.postsCount} posts · {m.followersCount} followers ·{' '}
                    {m.isSuspended ? 'Suspended' : 'Active'}
                  </p>
                </div>
              </div>

              {m.uid !== profile?.uid && (
                <button
                  type="button"
                  onClick={() => handleToggleSuspend(m)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 self-start sm:self-auto ${
                    m.isSuspended
                      ? 'border border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10'
                      : 'bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20'
                  }`}
                >
                  <UserX className="w-3.5 h-3.5" />
                  <span>{m.isSuspended ? 'Reinstate' : 'Suspend'}</span>
                </button>
              )}
            </div>
          ))}
        </div>
      ) : tab === 'announcements' ? (
        <form
          onSubmit={handleSendAnnouncement}
          className="bg-[#151519] border border-white/[0.08] rounded-2xl p-6 space-y-5 max-w-xl"
        >
          <div className="flex items-center gap-2.5 pb-2 border-b border-white/[0.06]">
            <Megaphone className="w-4 h-4 text-[#D4AF37]" />
            <div>
              <h2 className="font-display text-base font-semibold text-[#F8F9FA]">
                Important App Announcement
              </h2>
              <p className="text-xs text-[#A1A1AA]">
                Broadcast an official Hostel Friend alert to active community members
              </p>
            </div>
          </div>

          <label className="block text-xs font-medium text-[#A1A1AA]">
            Announcement Title
            <input
              type="text"
              required
              maxLength={120}
              value={announcementTitle}
              onChange={(e) => setAnnouncementTitle(e.target.value)}
              placeholder="e.g., Campus Photography Contest This Friday"
              className="mt-1.5 w-full rounded-xl bg-[#0A0A0C] border border-white/10 px-3.5 py-2.5 text-sm text-[#F8F9FA] placeholder:text-[#71717A] focus:outline-none focus:border-[#D4AF37]"
            />
          </label>

          <label className="block text-xs font-medium text-[#A1A1AA]">
            Announcement Message
            <textarea
              rows={4}
              required
              maxLength={260}
              value={announcementBody}
              onChange={(e) => setAnnouncementBody(e.target.value)}
              placeholder="Write a clear, helpful announcement for Hostel Friend members..."
              className="mt-1.5 w-full rounded-xl bg-[#0A0A0C] border border-white/10 px-3.5 py-2.5 text-sm text-[#F8F9FA] placeholder:text-[#71717A] focus:outline-none focus:border-[#D4AF37] resize-none"
            />
          </label>

          <button
            type="submit"
            disabled={sendingAnnouncement || !announcementTitle.trim() || !announcementBody.trim()}
            className="gold-gradient-btn px-5 py-2.5 rounded-xl text-xs font-semibold inline-flex items-center gap-2 disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{sendingAnnouncement ? 'Sending...' : 'Send Announcement'}</span>
          </button>
        </form>
      ) : (
        <form
          onSubmit={handleSavePlatformSettings}
          className="bg-[#151519] border border-white/[0.08] rounded-2xl p-6 space-y-5 max-w-xl"
        >
          <div className="flex items-center gap-2.5 pb-2 border-b border-white/[0.06]">
            <Sliders className="w-4 h-4 text-[#D4AF37]" />
            <h2 className="font-display text-base font-semibold text-[#F8F9FA]">
              Global Platform Settings
            </h2>
          </div>

          <label className="block text-xs font-medium text-[#A1A1AA]">
            Max Upload Size (MB, 1–100)
            <input
              type="number"
              min={1}
              max={100}
              value={maxUploadSizeMB}
              onChange={(e) => setMaxUploadSizeMB(Number(e.target.value))}
              className="mt-1.5 w-full rounded-xl bg-[#0A0A0C] border border-white/10 px-3.5 py-2.5 text-sm text-[#F8F9FA] focus:outline-none focus:border-[#D4AF37]"
            />
          </label>

          <label className="flex items-center justify-between gap-4 cursor-pointer py-1">
            <span className="text-sm text-[#F8F9FA]">Allow New Member Registrations</span>
            <input
              type="checkbox"
              checked={allowNewRegistrations}
              onChange={(e) => setAllowNewRegistrations(e.target.checked)}
              className="w-4 h-4 accent-[#D4AF37]"
            />
          </label>

          <label className="block text-xs font-medium text-[#A1A1AA]">
            Community Announcement Banner (optional)
            <input
              type="text"
              maxLength={240}
              value={maintenanceNotice}
              onChange={(e) => setMaintenanceNotice(e.target.value)}
              placeholder="Leave blank to hide banner"
              className="mt-1.5 w-full rounded-xl bg-[#0A0A0C] border border-white/10 px-3.5 py-2.5 text-sm text-[#F8F9FA] focus:outline-none focus:border-[#D4AF37]"
            />
          </label>

          <label className="block text-xs font-medium text-[#A1A1AA]">
            Featured Hashtags (comma separated)
            <input
              type="text"
              value={hashtagsCsv}
              onChange={(e) => setHashtagsCsv(e.target.value)}
              className="mt-1.5 w-full rounded-xl bg-[#0A0A0C] border border-white/10 px-3.5 py-2.5 text-sm text-[#F8F9FA] focus:outline-none focus:border-[#D4AF37]"
            />
          </label>

          <button
            type="submit"
            disabled={savingSettings}
            className="gold-gradient-btn px-5 py-2.5 rounded-xl text-xs font-semibold disabled:opacity-50"
          >
            {savingSettings ? 'Saving...' : 'Save Platform Settings'}
          </button>
        </form>
      )}
    </div>
  );
}
