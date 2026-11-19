import { MediaType, Post } from '../types';

export type TrendsTimeframe = 'all' | '7d' | '24h';
export type TrendsMediaFilter = 'all' | MediaType;

export interface HashtagTrendItem {
  tag: string;
  label: string;
  posts: number;
  likes: number;
  comments: number;
  engagement: number;
  sharePct: number;
}

export interface HourlyActivityPoint {
  hour: number;
  label: string;
  shortLabel: string;
  posts: number;
  likes: number;
  comments: number;
  engagement: number;
  activityScore: number;
}

export interface WeekdayActivityPoint {
  dayIndex: number;
  label: string;
  posts: number;
  engagement: number;
  activityScore: number;
}

export interface DayPeriodSummary {
  id: 'morning' | 'afternoon' | 'evening' | 'night';
  label: string;
  range: string;
  posts: number;
  engagement: number;
  pct: number;
}

export interface CommunityTrendsSummary {
  totalPosts: number;
  totalLikes: number;
  totalComments: number;
  totalEngagement: number;
  uniqueHashtags: number;
  topHashtags: HashtagTrendItem[];
  hourlyActivity: HourlyActivityPoint[];
  weekdayActivity: WeekdayActivityPoint[];
  dayPeriods: DayPeriodSummary[];
  peakHour: HourlyActivityPoint | null;
  peakDay: WeekdayActivityPoint | null;
}

function formatHourLabel(hour: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:00 ${period}`;
}

function formatHourShort(hour: number): string {
  const period = hour >= 12 ? 'p' : 'a';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}${period}`;
}

function extractPostHashtags(post: Post): string[] {
  const seen = new Set<string>();
  for (const tag of post.hashtags || []) {
    const clean = tag.trim().toLowerCase().replace(/^#/, '');
    if (/^[a-z0-9_]{1,30}$/.test(clean)) {
      seen.add(clean);
    }
  }
  const captionMatches = post.caption?.match(/#([a-zA-Z0-9_]{1,30})/g) || [];
  for (const match of captionMatches) {
    const clean = match.slice(1).toLowerCase();
    if (clean) seen.add(clean);
  }
  return Array.from(seen);
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function computeCommunityTrends(
  posts: Post[],
  options: {
    timeframe: TrendsTimeframe;
    mediaFilter: TrendsMediaFilter;
    nowMs?: number;
  }
): CommunityTrendsSummary {
  const nowMs = options.nowMs ?? Date.now();
  const cutoffMs =
    options.timeframe === '24h'
      ? nowMs - 24 * 60 * 60 * 1000
      : options.timeframe === '7d'
      ? nowMs - 7 * 24 * 60 * 60 * 1000
      : 0;

  const filtered = posts.filter((post) => {
    if (options.mediaFilter !== 'all' && post.mediaType !== options.mediaFilter) {
      return false;
    }
    if (cutoffMs > 0) {
      const createdMs = post.createdAt?.toMillis() ?? 0;
      if (createdMs < cutoffMs) return false;
    }
    return true;
  });

  const tagMap = new Map<
    string,
    { posts: number; likes: number; comments: number; engagement: number }
  >();

  const hourlyActivity: HourlyActivityPoint[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: formatHourLabel(hour),
    shortLabel: formatHourShort(hour),
    posts: 0,
    likes: 0,
    comments: 0,
    engagement: 0,
    activityScore: 0,
  }));

  const weekdayActivity: WeekdayActivityPoint[] = WEEKDAY_LABELS.map((label, dayIndex) => ({
    dayIndex,
    label,
    posts: 0,
    engagement: 0,
    activityScore: 0,
  }));

  const periodBuckets: Record<
    DayPeriodSummary['id'],
    { posts: number; engagement: number }
  > = {
    morning: { posts: 0, engagement: 0 },
    afternoon: { posts: 0, engagement: 0 },
    evening: { posts: 0, engagement: 0 },
    night: { posts: 0, engagement: 0 },
  };

  let totalLikes = 0;
  let totalComments = 0;

  for (const post of filtered) {
    const likes = Math.max(0, post.likesCount || 0);
    const comments = Math.max(0, post.commentsCount || 0);
    const engagement = likes + comments;
    totalLikes += likes;
    totalComments += comments;

    for (const tag of extractPostHashtags(post)) {
      const entry = tagMap.get(tag) || { posts: 0, likes: 0, comments: 0, engagement: 0 };
      entry.posts += 1;
      entry.likes += likes;
      entry.comments += comments;
      entry.engagement += engagement;
      tagMap.set(tag, entry);
    }

    const createdMs = post.createdAt?.toMillis();
    if (createdMs) {
      const date = new Date(createdMs);
      const hour = date.getHours();
      const jsDay = date.getDay(); // 0=Sun..6=Sat
      const monFirstIndex = jsDay === 0 ? 6 : jsDay - 1;

      const hBucket = hourlyActivity[hour];
      hBucket.posts += 1;
      hBucket.likes += likes;
      hBucket.comments += comments;
      hBucket.engagement += engagement;
      hBucket.activityScore = hBucket.posts * 3 + hBucket.engagement;

      const wBucket = weekdayActivity[monFirstIndex];
      wBucket.posts += 1;
      wBucket.engagement += engagement;
      wBucket.activityScore = wBucket.posts * 3 + wBucket.engagement;

      if (hour >= 6 && hour < 12) {
        periodBuckets.morning.posts += 1;
        periodBuckets.morning.engagement += engagement;
      } else if (hour >= 12 && hour < 18) {
        periodBuckets.afternoon.posts += 1;
        periodBuckets.afternoon.engagement += engagement;
      } else if (hour >= 18 && hour < 24) {
        periodBuckets.evening.posts += 1;
        periodBuckets.evening.engagement += engagement;
      } else {
        periodBuckets.night.posts += 1;
        periodBuckets.night.engagement += engagement;
      }
    }
  }

  const totalPosts = filtered.length;
  const totalEngagement = totalLikes + totalComments;

  const topHashtags: HashtagTrendItem[] = Array.from(tagMap.entries())
    .map(([tag, stats]) => ({
      tag,
      label: `#${tag}`,
      posts: stats.posts,
      likes: stats.likes,
      comments: stats.comments,
      engagement: stats.engagement,
      sharePct: totalPosts > 0 ? Math.round((stats.posts / totalPosts) * 100) : 0,
    }))
    .sort((a, b) => b.posts - a.posts || b.engagement - a.engagement || a.tag.localeCompare(b.tag))
    .slice(0, 10);

  let peakHour: HourlyActivityPoint | null = null;
  for (const point of hourlyActivity) {
    if (point.posts === 0 && point.engagement === 0) continue;
    if (
      !peakHour ||
      point.activityScore > peakHour.activityScore ||
      (point.activityScore === peakHour.activityScore && point.posts > peakHour.posts)
    ) {
      peakHour = point;
    }
  }

  let peakDay: WeekdayActivityPoint | null = null;
  for (const point of weekdayActivity) {
    if (point.posts === 0 && point.engagement === 0) continue;
    if (
      !peakDay ||
      point.activityScore > peakDay.activityScore ||
      (point.activityScore === peakDay.activityScore && point.posts > peakDay.posts)
    ) {
      peakDay = point;
    }
  }

  const dayPeriods: DayPeriodSummary[] = [
    {
      id: 'morning',
      label: 'Morning',
      range: '6 AM – 12 PM',
      posts: periodBuckets.morning.posts,
      engagement: periodBuckets.morning.engagement,
      pct: totalPosts > 0 ? Math.round((periodBuckets.morning.posts / totalPosts) * 100) : 0,
    },
    {
      id: 'afternoon',
      label: 'Afternoon',
      range: '12 PM – 6 PM',
      posts: periodBuckets.afternoon.posts,
      engagement: periodBuckets.afternoon.engagement,
      pct: totalPosts > 0 ? Math.round((periodBuckets.afternoon.posts / totalPosts) * 100) : 0,
    },
    {
      id: 'evening',
      label: 'Evening',
      range: '6 PM – 12 AM',
      posts: periodBuckets.evening.posts,
      engagement: periodBuckets.evening.engagement,
      pct: totalPosts > 0 ? Math.round((periodBuckets.evening.posts / totalPosts) * 100) : 0,
    },
    {
      id: 'night',
      label: 'Late Night',
      range: '12 AM – 6 AM',
      posts: periodBuckets.night.posts,
      engagement: periodBuckets.night.engagement,
      pct: totalPosts > 0 ? Math.round((periodBuckets.night.posts / totalPosts) * 100) : 0,
    },
  ];

  return {
    totalPosts,
    totalLikes,
    totalComments,
    totalEngagement,
    uniqueHashtags: tagMap.size,
    topHashtags,
    hourlyActivity,
    weekdayActivity,
    dayPeriods,
    peakHour,
    peakDay,
  };
}
