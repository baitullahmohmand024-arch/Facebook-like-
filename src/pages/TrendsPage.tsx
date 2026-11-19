import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowUpRight, Clock, Flame, Hash, RefreshCw, TrendingUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Post } from '../types';
import { fetchTrendsSample } from '../services/postService';
import { formatCount } from '../utils/formatters';
import {
  computeCommunityTrends,
  TrendsMediaFilter,
  TrendsTimeframe,
} from '../utils/trendsAnalytics';

interface TrendsPageProps {
  onSearchHashtag: (tag: string) => void;
  onNavigateCreate?: () => void;
}

interface CustomTooltipPayloadItem {
  name?: string;
  value?: number;
  color?: string;
  payload?: Record<string, unknown>;
}

interface CustomChartTooltipProps {
  active?: boolean;
  payload?: CustomTooltipPayloadItem[];
  label?: string;
}

function HashtagTooltip({ active, payload }: CustomChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0]?.payload as
    | {
        label?: string;
        posts?: number;
        likes?: number;
        comments?: number;
        engagement?: number;
        sharePct?: number;
      }
    | undefined;
  if (!item) return null;

  return (
    <div className="bg-[#0A0A0C]/95 border border-white/15 rounded-xl px-3.5 py-2.5 shadow-xl text-xs">
      <p className="font-display font-semibold text-[#D4AF37]">{item.label}</p>
      <div className="mt-1.5 space-y-1 text-[#A1A1AA] font-mono tabular-nums">
        <div className="flex items-center justify-between gap-5">
          <span>Posts</span>
          <span className="text-[#F8F9FA] font-semibold">{formatCount(item.posts || 0)}</span>
        </div>
        <div className="flex items-center justify-between gap-5">
          <span>Likes</span>
          <span className="text-[#F8F9FA]">{formatCount(item.likes || 0)}</span>
        </div>
        <div className="flex items-center justify-between gap-5">
          <span>Comments</span>
          <span className="text-[#F8F9FA]">{formatCount(item.comments || 0)}</span>
        </div>
        <div className="flex items-center justify-between gap-5 pt-1 border-t border-white/[0.08]">
          <span>Engagement</span>
          <span className="text-[#E7C96F] font-semibold">{formatCount(item.engagement || 0)}</span>
        </div>
      </div>
    </div>
  );
}

function ActivityTooltip({ active, payload, label }: CustomChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as
    | {
        label?: string;
        posts?: number;
        engagement?: number;
        likes?: number;
        comments?: number;
      }
    | undefined;
  if (!point) return null;

  return (
    <div className="bg-[#0A0A0C]/95 border border-white/15 rounded-xl px-3.5 py-2.5 shadow-xl text-xs">
      <p className="font-display font-semibold text-[#F8F9FA]">{point.label || label}</p>
      <div className="mt-1.5 space-y-1 text-[#A1A1AA] font-mono tabular-nums">
        <div className="flex items-center justify-between gap-5">
          <span className="text-[#D4AF37]">Posts</span>
          <span className="text-[#F8F9FA] font-semibold">{formatCount(point.posts || 0)}</span>
        </div>
        <div className="flex items-center justify-between gap-5">
          <span>Interactions</span>
          <span className="text-[#F8F9FA] font-semibold">{formatCount(point.engagement || 0)}</span>
        </div>
      </div>
    </div>
  );
}

export function TrendsPage({ onSearchHashtag, onNavigateCreate }: TrendsPageProps) {
  const { privateSettings } = useAuth();
  const { showToast } = useToast();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [timeframe, setTimeframe] = useState<TrendsTimeframe>('all');
  const [mediaFilter, setMediaFilter] = useState<TrendsMediaFilter>('all');
  const [hashtagMetric, setHashtagMetric] = useState<'posts' | 'engagement'>('posts');
  const [activityView, setActivityView] = useState<'hourly' | 'weekday'>('hourly');

  const blockedSet = useMemo(
    () => new Set(privateSettings?.blockedUserIds || []),
    [privateSettings]
  );

  const loadTrends = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setErrorMsg('');
      try {
        const sampled = await fetchTrendsSample(100);
        setPosts(sampled);
      } catch {
        setErrorMsg('Could not load community trends right now.');
        showToast({ type: 'error', title: 'Could not load trends' });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    loadTrends(false);
  }, [loadTrends]);

  const visiblePosts = useMemo(
    () => posts.filter((p) => !blockedSet.has(p.authorId)),
    [posts, blockedSet]
  );

  const summary = useMemo(
    () =>
      computeCommunityTrends(visiblePosts, {
        timeframe,
        mediaFilter,
      }),
    [visiblePosts, timeframe, mediaFilter]
  );

  const rankedHashtags = useMemo(() => {
    const list = [...summary.topHashtags];
    if (hashtagMetric === 'engagement') {
      list.sort((a, b) => b.engagement - a.engagement || b.posts - a.posts);
    } else {
      list.sort((a, b) => b.posts - a.posts || b.engagement - a.engagement);
    }
    return list.slice(0, 8);
  }, [summary.topHashtags, hashtagMetric]);

  const localTimezoneLabel = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local Time';
    } catch {
      return 'Local Time';
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#F8F9FA]">
            Community Trends
          </h1>
          <p className="text-xs text-[#A1A1AA] mt-0.5">
            Popular hashtags and peak posting &amp; engagement hours across HOSTELVERSE
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Timeframe Selector */}
          <div className="inline-flex items-center gap-1 p-1 bg-[#151519] rounded-xl border border-white/[0.08]">
            {(
              [
                { id: 'all', label: 'Recent 100' },
                { id: '7d', label: '7 Days' },
                { id: '24h', label: '24 Hours' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTimeframe(opt.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  timeframe === opt.id
                    ? 'bg-[#D4AF37] text-[#0A0A0C]'
                    : 'text-[#A1A1AA] hover:text-[#F8F9FA]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Media Type Filter */}
          <div className="inline-flex items-center gap-1 p-1 bg-[#151519] rounded-xl border border-white/[0.08]">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'image', label: 'Photos' },
                { id: 'video', label: 'Videos' },
                { id: 'text', label: 'Notes' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setMediaFilter(opt.id)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  mediaFilter === opt.id
                    ? 'bg-white/10 text-[#F8F9FA]'
                    : 'text-[#A1A1AA] hover:text-[#F8F9FA]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={loading || refreshing}
            onClick={() => loadTrends(true)}
            className="px-3.5 py-2 rounded-xl text-xs font-medium border border-white/10 bg-[#151519] text-[#F8F9FA] hover:border-[#D4AF37]/40 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#D4AF37] ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-white/[0.08] rounded-2xl overflow-hidden border border-white/[0.08]">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-[#151519] animate-pulse" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-6 h-88 rounded-2xl bg-[#151519] border border-white/[0.08] animate-pulse" />
            <div className="lg:col-span-6 h-88 rounded-2xl bg-[#151519] border border-white/[0.08] animate-pulse" />
          </div>
        </div>
      ) : errorMsg ? (
        <div className="bg-[#151519] border border-white/[0.08] rounded-2xl p-10 text-center">
          <p className="font-display text-base font-semibold text-[#F8F9FA]">{errorMsg}</p>
          <button
            type="button"
            onClick={() => loadTrends(false)}
            className="mt-4 gold-gradient-btn px-5 py-2 rounded-xl text-xs font-semibold"
          >
            Try Again
          </button>
        </div>
      ) : summary.totalPosts === 0 ? (
        <div className="bg-[#151519] border border-white/[0.08] rounded-2xl p-12 text-center">
          <TrendingUp className="w-8 h-8 text-[#D4AF37] mx-auto" />
          <h2 className="mt-3 font-display text-lg font-semibold text-[#F8F9FA]">
            No posts found for this filter
          </h2>
          <p className="mt-1.5 text-xs text-[#A1A1AA] max-w-md mx-auto">
            Widen the timeframe or media filter to inspect hashtag momentum and hourly activity.
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            {(timeframe !== 'all' || mediaFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setTimeframe('all');
                  setMediaFilter('all');
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold border border-white/15 text-[#F8F9FA] hover:border-[#D4AF37]/40"
              >
                Reset Filters
              </button>
            )}
            {onNavigateCreate && (
              <button
                type="button"
                onClick={onNavigateCreate}
                className="gold-gradient-btn px-4 py-2 rounded-xl text-xs font-semibold"
              >
                Share a Post
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Single-Elevation KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-white/[0.08] rounded-2xl overflow-hidden border border-white/[0.08]">
            <div className="bg-[#151519] p-5">
              <p className="text-xs text-[#A1A1AA]">Posts Analyzed</p>
              <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-[#F8F9FA]">
                {formatCount(summary.totalPosts)}
              </p>
              <p className="mt-1 text-[11px] text-[#71717A] font-mono tabular-nums">
                {summary.uniqueHashtags} active hashtags
              </p>
            </div>

            <div className="bg-[#151519] p-5">
              <p className="text-xs text-[#A1A1AA]">Leading Hashtag</p>
              {summary.topHashtags[0] ? (
                <>
                  <button
                    type="button"
                    onClick={() => onSearchHashtag(summary.topHashtags[0].tag)}
                    className="mt-1.5 font-display text-xl font-bold text-[#D4AF37] hover:text-[#E7C96F] truncate block max-w-full text-left"
                  >
                    {summary.topHashtags[0].label}
                  </button>
                  <p className="mt-1 text-[11px] text-[#71717A] font-mono tabular-nums">
                    {summary.topHashtags[0].posts} posts · {summary.topHashtags[0].sharePct}% of feed
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-1.5 font-display text-xl font-semibold text-[#71717A]">—</p>
                  <p className="mt-1 text-[11px] text-[#71717A]">No hashtags tagged yet</p>
                </>
              )}
            </div>

            <div className="bg-[#151519] p-5">
              <p className="text-xs text-[#A1A1AA]">Peak Activity Hour</p>
              <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-[#F8F9FA]">
                {summary.peakHour ? summary.peakHour.label : '—'}
              </p>
              <p className="mt-1 text-[11px] text-[#71717A] font-mono tabular-nums truncate">
                {summary.peakHour
                  ? `${summary.peakHour.posts} posts · ${formatCount(summary.peakHour.engagement)} interactions`
                  : localTimezoneLabel}
              </p>
            </div>

            <div className="bg-[#151519] p-5">
              <p className="text-xs text-[#A1A1AA]">Community Engagement</p>
              <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-[#F8F9FA]">
                {formatCount(summary.totalEngagement)}
              </p>
              <p className="mt-1 text-[11px] text-[#71717A] font-mono tabular-nums">
                {formatCount(summary.totalLikes)} likes · {formatCount(summary.totalComments)} comments
              </p>
            </div>
          </div>

          {/* Primary Recharts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Chart 1: Popular Hashtags */}
            <section className="lg:col-span-6 bg-[#151519] border border-white/[0.08] rounded-2xl p-5 flex flex-col">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <Hash className="w-4 h-4 text-[#D4AF37]" />
                  <div>
                    <h2 className="font-display text-base font-semibold text-[#F8F9FA]">
                      Most Popular Hashtags
                    </h2>
                    <p className="text-[11px] text-[#71717A]">
                      Click any bar to explore posts with that tag
                    </p>
                  </div>
                </div>

                <div className="inline-flex items-center gap-1 p-1 bg-[#0A0A0C] rounded-lg border border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => setHashtagMetric('posts')}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      hashtagMetric === 'posts'
                        ? 'bg-[#D4AF37] text-[#0A0A0C]'
                        : 'text-[#A1A1AA] hover:text-[#F8F9FA]'
                    }`}
                  >
                    Posts
                  </button>
                  <button
                    type="button"
                    onClick={() => setHashtagMetric('engagement')}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      hashtagMetric === 'engagement'
                        ? 'bg-[#D4AF37] text-[#0A0A0C]'
                        : 'text-[#A1A1AA] hover:text-[#F8F9FA]'
                    }`}
                  >
                    Engagement
                  </button>
                </div>
              </div>

              {rankedHashtags.length === 0 ? (
                <div className="flex-1 min-h-[280px] flex flex-col items-center justify-center text-center p-6">
                  <p className="text-sm font-medium text-[#F8F9FA]">No hashtags in this sample</p>
                  <p className="mt-1 text-xs text-[#71717A] max-w-xs">
                    Add #hashtags to captions when sharing posts to surface trending topics here.
                  </p>
                </div>
              ) : (
                <div className="mt-4 h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={rankedHashtags}
                      layout="vertical"
                      margin={{ top: 4, right: 20, left: 4, bottom: 4 }}
                    >
                      <CartesianGrid
                        stroke="rgba(255,255,255,0.06)"
                        strokeDasharray="3 3"
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        stroke="#71717A"
                        tick={{ fill: '#71717A', fontSize: 11 }}
                        axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                        tickLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="label"
                        width={116}
                        stroke="#A1A1AA"
                        tick={{ fill: '#F8F9FA', fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(212, 175, 55, 0.08)' }}
                        content={<HashtagTooltip />}
                      />
                      <Bar
                        dataKey={hashtagMetric}
                        radius={[0, 6, 6, 0]}
                        barSize={20}
                        className="cursor-pointer"
                        onClick={(data) => {
                          const tag = (data as { tag?: string })?.tag;
                          if (tag) onSearchHashtag(tag);
                        }}
                      >
                        {rankedHashtags.map((entry, idx) => (
                          <Cell
                            key={entry.tag}
                            fill={
                              idx === 0
                                ? '#E7C96F'
                                : idx <= 2
                                ? '#D4AF37'
                                : 'rgba(212, 175, 55, 0.62)'
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            {/* Chart 2: Peak Activity Times */}
            <section className="lg:col-span-6 bg-[#151519] border border-white/[0.08] rounded-2xl p-5 flex flex-col">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#D4AF37]" />
                  <div>
                    <h2 className="font-display text-base font-semibold text-[#F8F9FA]">
                      Peak Activity Times
                    </h2>
                    <p className="text-[11px] text-[#71717A]">
                      Posts and engagement rhythm ({localTimezoneLabel})
                    </p>
                  </div>
                </div>

                <div className="inline-flex items-center gap-1 p-1 bg-[#0A0A0C] rounded-lg border border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => setActivityView('hourly')}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      activityView === 'hourly'
                        ? 'bg-[#D4AF37] text-[#0A0A0C]'
                        : 'text-[#A1A1AA] hover:text-[#F8F9FA]'
                    }`}
                  >
                    24-Hour Cycle
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivityView('weekday')}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      activityView === 'weekday'
                        ? 'bg-[#D4AF37] text-[#0A0A0C]'
                        : 'text-[#A1A1AA] hover:text-[#F8F9FA]'
                    }`}
                  >
                    Day of Week
                  </button>
                </div>
              </div>

              <div className="mt-4 h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {activityView === 'hourly' ? (
                    <AreaChart
                      data={summary.hourlyActivity}
                      margin={{ top: 8, right: 12, left: -16, bottom: 4 }}
                    >
                      <defs>
                        <linearGradient id="goldPostsGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.38} />
                          <stop offset="95%" stopColor="#D4AF37" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="pearlEngagementGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#F8F9FA" stopOpacity={0.14} />
                          <stop offset="95%" stopColor="#F8F9FA" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        stroke="rgba(255,255,255,0.06)"
                        strokeDasharray="3 3"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="shortLabel"
                        interval={2}
                        stroke="#71717A"
                        tick={{ fill: '#A1A1AA', fontSize: 11 }}
                        axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        stroke="#71717A"
                        tick={{ fill: '#71717A', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={<ActivityTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="engagement"
                        name="Interactions"
                        stroke="#F8F9FA"
                        strokeOpacity={0.55}
                        strokeWidth={1.5}
                        fill="url(#pearlEngagementGradient)"
                      />
                      <Area
                        type="monotone"
                        dataKey="posts"
                        name="Posts"
                        stroke="#D4AF37"
                        strokeWidth={2.25}
                        fill="url(#goldPostsGradient)"
                        activeDot={{ r: 5, fill: '#E7C96F', stroke: '#0A0A0C', strokeWidth: 2 }}
                      />
                    </AreaChart>
                  ) : (
                    <BarChart
                      data={summary.weekdayActivity}
                      margin={{ top: 8, right: 12, left: -16, bottom: 4 }}
                    >
                      <CartesianGrid
                        stroke="rgba(255,255,255,0.06)"
                        strokeDasharray="3 3"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="label"
                        stroke="#71717A"
                        tick={{ fill: '#F8F9FA', fontSize: 12 }}
                        axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        stroke="#71717A"
                        tick={{ fill: '#71717A', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(212, 175, 55, 0.08)' }}
                        content={<ActivityTooltip />}
                      />
                      <Bar dataKey="posts" name="Posts" fill="#D4AF37" radius={[6, 6, 0, 0]} barSize={24} />
                      <Bar
                        dataKey="engagement"
                        name="Interactions"
                        fill="rgba(248, 249, 250, 0.25)"
                        radius={[6, 6, 0, 0]}
                        barSize={24}
                      />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>

              <div className="mt-3 pt-3 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#A1A1AA]">
                <div className="flex items-center gap-4">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#D4AF37] inline-block" />
                    Posts Published
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-white/50 inline-block" />
                    Likes &amp; Comments
                  </span>
                </div>
                {summary.peakDay && (
                  <span className="font-mono tabular-nums text-[#D4AF37]">
                    Most active day: {summary.peakDay.label} ({summary.peakDay.posts} posts)
                  </span>
                )}
              </div>
            </section>
          </div>

          {/* Detailed Breakdowns */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Trending Hashtag Leaderboard Table */}
            <section className="lg:col-span-7 bg-[#151519] border border-white/[0.08] rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-[#D4AF37]" />
                  <h2 className="font-display text-base font-semibold text-[#F8F9FA]">
                    Hashtag Breakdown
                  </h2>
                </div>
                <span className="text-[11px] font-mono tabular-nums text-[#71717A]">
                  Top {summary.topHashtags.length} tags
                </span>
              </div>

              {summary.topHashtags.length === 0 ? (
                <p className="p-6 text-xs text-[#71717A] text-center">
                  No hashtags recorded for the selected filters.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/[0.06] text-[11px] font-medium text-[#71717A]">
                        <th className="py-3 pl-5 pr-2 w-10">#</th>
                        <th className="py-3 px-3">Hashtag</th>
                        <th className="py-3 px-3 text-right">Posts</th>
                        <th className="py-3 px-3 text-right">Likes</th>
                        <th className="py-3 px-3 text-right">Comments</th>
                        <th className="py-3 pl-3 pr-5 text-right">Feed Share</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.05] text-xs">
                      {summary.topHashtags.map((item, idx) => (
                        <tr
                          key={item.tag}
                          onClick={() => onSearchHashtag(item.tag)}
                          className="hover:bg-white/[0.03] cursor-pointer transition-colors group"
                        >
                          <td className="py-2.5 pl-5 pr-2 font-mono tabular-nums text-[#71717A]">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-[#F8F9FA] group-hover:text-[#D4AF37] flex items-center gap-1.5">
                            <span>{item.label}</span>
                            <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#F8F9FA]">
                            {formatCount(item.posts)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#A1A1AA]">
                            {formatCount(item.likes)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#A1A1AA]">
                            {formatCount(item.comments)}
                          </td>
                          <td className="py-2.5 pl-3 pr-5 text-right font-mono tabular-nums text-[#D4AF37]">
                            {item.sharePct}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Time-of-Day Windows */}
            <section className="lg:col-span-5 bg-[#151519] border border-white/[0.08] rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <h2 className="font-display text-base font-semibold text-[#F8F9FA]">
                  Hostel Activity Windows
                </h2>
                <p className="text-[11px] text-[#71717A] mt-0.5">
                  Share of posts published across each 6-hour window
                </p>

                <div className="mt-5 space-y-4">
                  {summary.dayPeriods.map((period) => (
                    <div key={period.id} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <div className="min-w-0">
                          <span className="font-medium text-[#F8F9FA]">{period.label}</span>
                          <span className="text-[#71717A] ml-2">{period.range}</span>
                        </div>
                        <span className="font-mono tabular-nums text-[#A1A1AA] shrink-0">
                          {period.posts} posts ·{' '}
                          <span className="text-[#D4AF37] font-semibold">{period.pct}%</span>
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-[#0A0A0C] overflow-hidden border border-white/[0.05]">
                        <div
                          className="h-full rounded-full bg-[#D4AF37] transition-all duration-300"
                          style={{ width: `${period.pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-white/[0.06] flex items-center justify-between text-xs text-[#A1A1AA]">
                <span>Sampled from latest hostel posts</span>
                <span className="font-mono tabular-nums text-[#F8F9FA]">
                  {summary.totalPosts} / 100
                </span>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
