import { Timestamp } from 'firebase/firestore';

export function formatRelativeTime(ts: Timestamp | Date | null | undefined): string {
  if (!ts) return 'Just now';
  const date = ts instanceof Date ? ts : ts.toDate();
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatShortDate(ts: Timestamp | Date | null | undefined): string {
  if (!ts) return 'Today';
  const date = ts instanceof Date ? ts : ts.toDate();
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatCount(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(num);
}

export function sanitizeUsername(raw: string): string {
  return raw
    .trim()
    .replace(/[^a-zA-Z0-9_]/g, '')
    .slice(0, 24);
}

export function parseHashtags(input: string, caption = ''): string[] {
  const combined = `${input} ${caption}`;
  const matches = combined.match(/#[a-zA-Z0-9_]+/g) || [];
  const manualTokens = input
    .split(/[\s,]+/)
    .map((t) => t.trim().replace(/^#/, ''))
    .filter((t) => /^[a-zA-Z0-9_]{1,30}$/.test(t));

  const tagSet = new Set<string>();
  for (const m of matches) {
    const clean = m.slice(1).toLowerCase();
    if (clean.length >= 1 && clean.length <= 30) tagSet.add(clean);
  }
  for (const t of manualTokens) {
    tagSet.add(t.toLowerCase());
  }
  return Array.from(tagSet).slice(0, 10);
}

export function getConversationId(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join('_');
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return 'H';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
