import { useEffect, useState } from 'react';
import { ArrowRight, Compass, Film, Heart, Lock, MessageSquare, Sparkles } from 'lucide-react';
import { Post, UserProfile } from '../types';
import { fetchPostsPage } from '../services/postService';
import { fetchDiscoverMembers } from '../services/userService';
import { Avatar } from '../components/Avatar';
import { formatCount, formatRelativeTime } from '../utils/formatters';

interface LandingPageProps {
  onCreateAccount: () => void;
  onLogin: () => void;
  onExploreCommunity: () => void;
}

const HERO_IMG = '/src/assets/images/hero_hostel_rooftop_1794541690689.jpg';
const LOUNGE_IMG = '/src/assets/images/showcase_common_room_1794541692315.jpg';
const COURTYARD_IMG = '/src/assets/images/showcase_courtyard_night_1794541690152.jpg';
const VERTICAL_IMG = '/src/assets/images/showcase_vertical_moment_1794541691304.jpg';

export function LandingPage({
  onCreateAccount,
  onLogin,
  onExploreCommunity,
}: LandingPageProps) {
  const [recentPosts, setRecentPosts] = useState<Post[]>([]);
  const [featuredMembers, setFeaturedMembers] = useState<UserProfile[]>([]);
  const [loadingHighlights, setLoadingHighlights] = useState(true);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      fetchPostsPage(null, 4).catch(() => ({ posts: [] as Post[] })),
      fetchDiscoverMembers(6).catch(() => [] as UserProfile[]),
    ]).then(([postRes, members]) => {
      if (!mounted) return;
      setRecentPosts(postRes.posts);
      setFeaturedMembers(members);
      setLoadingHighlights(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-[#F8F9FA]">
      {/* 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 bg-[#0A0A0C]/85 backdrop-blur-xl border-b border-white/[0.08]">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 h-18 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="font-display font-bold tracking-tight text-lg text-[#F8F9FA] whitespace-nowrap shrink-0"
          >
            HOSTELVERSE
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#A1A1AA]">
            <a href="#story" className="hover:text-[#F8F9FA] transition-colors whitespace-nowrap shrink-0">
              Story
            </a>
            <a href="#features" className="hover:text-[#F8F9FA] transition-colors whitespace-nowrap shrink-0">
              Experience
            </a>
            <a href="#highlights" className="hover:text-[#F8F9FA] transition-colors whitespace-nowrap shrink-0">
              Community
            </a>
            <a href="#safety" className="hover:text-[#F8F9FA] transition-colors whitespace-nowrap shrink-0">
              Privacy
            </a>
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={onCreateAccount}
              className="gold-gradient-btn px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap shrink-0"
            >
              Create Your Account
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section id="top" className="relative overflow-hidden border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-14 lg:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center">
              <p className="text-xs font-medium tracking-[0.14em] uppercase text-[#D4AF37]">
                Your Hostel. Your Stories. Your World.
              </p>
              <h1
                className="mt-4 font-display font-bold tracking-tight text-[#F8F9FA] leading-[1.06]"
                style={{ fontSize: 'clamp(2.25rem, 4.4vw, 3.85rem)', textWrap: 'balance' }}
              >
                Your World. Your Memories. Your People.
              </h1>
              <p className="mt-5 text-base sm:text-lg text-[#A1A1AA] leading-relaxed max-w-xl">
                A place where hostel life becomes unforgettable. Capture late-night rooftop talks,
                share cinema-grade photographs and short reels, and stay connected with the people
                who shaped your campus years.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={onCreateAccount}
                  className="gold-gradient-btn px-6 py-3 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all whitespace-nowrap shrink-0"
                >
                  <span>Create Your Account</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={onExploreCommunity}
                  className="px-6 py-3 rounded-xl text-sm font-medium border border-white/15 text-[#F8F9FA] hover:border-[#D4AF37]/50 hover:bg-white/[0.04] transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
                >
                  <Compass className="w-4 h-4 text-[#D4AF37]" />
                  <span>Explore Community</span>
                </button>
                <button
                  type="button"
                  onClick={onLogin}
                  className="px-4 py-3 text-sm font-medium text-[#A1A1AA] hover:text-[#F8F9FA] transition-colors whitespace-nowrap shrink-0"
                >
                  Sign In
                </button>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="relative h-full min-h-[340px] lg:min-h-[460px] rounded-2xl overflow-hidden border border-white/[0.1] bg-[#151519]">
                <img
                  src={HERO_IMG}
                  alt="Students gathered on a golden-lit architectural hostel rooftop at twilight"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0C]/85 via-[#0A0A0C]/20 to-transparent" />
                <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-sm font-display font-semibold text-[#F8F9FA]">
                      Where Hostel Life Comes Alive
                    </p>
                    <p className="text-xs text-[#A1A1AA] mt-0.5">
                      Every Moment Has a Story · Made for Memories. Built for Connection.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Story & Design Philosophy */}
      <section id="story" className="max-w-7xl mx-auto px-5 sm:px-8 py-16 lg:py-24 border-b border-white/[0.06]">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-5 space-y-4">
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#F8F9FA]">
              Designed for the stillness and spark of student life.
            </h2>
            <p className="text-[#A1A1AA] text-base leading-relaxed">
              Ordinary feeds bury real memories beneath algorithmic noise. HOSTELVERSE preserves
              your hostel corridor friendships, studio sessions, and spontaneous midnight walks in a
              calm, obsidian-and-gold digital archive.
            </p>
          </div>
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="rounded-2xl overflow-hidden border border-white/[0.08] bg-[#151519]">
              <div className="aspect-[4/3] overflow-hidden">
                <img
                  src={LOUNGE_IMG}
                  alt="Students collaborating in a sunlit modern hostel common room"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-4">
                <p className="text-sm font-display font-semibold text-[#F8F9FA]">
                  Shared Study & Common Rooms
                </p>
                <p className="text-xs text-[#A1A1AA] mt-1">
                  Discover peers across your hostel or campus block.
                </p>
              </div>
            </div>

            <div className="rounded-2xl overflow-hidden border border-white/[0.08] bg-[#151519]">
              <div className="aspect-[4/3] overflow-hidden">
                <img
                  src={COURTYARD_IMG}
                  alt="Evening gathering of hostel friends in an architectural courtyard"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-4">
                <p className="text-sm font-display font-semibold text-[#F8F9FA]">
                  Curated Nightly Archives
                </p>
                <p className="text-xs text-[#A1A1AA] mt-1">
                  Preserve photographs and reels with friends who lived them.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Showcase (Asymmetric Bento) */}
      <section id="features" className="max-w-7xl mx-auto px-5 sm:px-8 py-16 lg:py-24 border-b border-white/[0.06]">
        <div className="max-w-2xl mb-12">
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#F8F9FA]">
            Your People. Your Place. Your Universe.
          </h2>
          <p className="mt-3 text-[#A1A1AA] text-base">
            Every surface is engineered for effortless storytelling, fast loading on campus
            networks, and authentic human connection.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-7 bg-[#151519] border border-white/[0.08] rounded-2xl p-7 flex flex-col justify-between">
            <div>
              <span className="text-xs font-mono text-[#D4AF37]">01</span>
              <h3 className="mt-3 font-display text-xl font-semibold text-[#F8F9FA]">
                Chronological & Curated Social Feeds
              </h3>
              <p className="mt-2 text-sm text-[#A1A1AA] leading-relaxed">
                Switch seamlessly between For You, Following, and Latest views. React with likes,
                open threaded discussions, bookmark cherished posts, and share stories cleanly.
              </p>
            </div>
            <div className="mt-6 pt-5 border-t border-white/[0.06] flex items-center gap-6 text-xs text-[#A1A1AA]">
              <span className="flex items-center gap-1.5">
                <Heart className="w-3.5 h-3.5 text-[#D4AF37]" /> Real-time engagement
              </span>
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" /> Zero ad clutter
              </span>
            </div>
          </div>

          <div className="md:col-span-5 bg-[#151519] border border-white/[0.08] rounded-2xl overflow-hidden grid grid-cols-1 sm:grid-cols-2">
            <div className="p-6 flex flex-col justify-between">
              <div>
                <span className="text-xs font-mono text-[#D4AF37]">02</span>
                <h3 className="mt-3 font-display text-lg font-semibold text-[#F8F9FA]">
                  Vertical Moments
                </h3>
                <p className="mt-2 text-xs text-[#A1A1AA] leading-relaxed">
                  Full-bleed vertical video viewer with keyboard and swipe controls built for mobile
                  and desktop.
                </p>
              </div>
              <div className="mt-4 flex items-center gap-1.5 text-xs text-[#D4AF37]">
                <Film className="w-3.5 h-3.5" />
                <span>Reels & Clips</span>
              </div>
            </div>
            <div className="aspect-[9/16] sm:aspect-auto h-full max-h-72 sm:max-h-none overflow-hidden">
              <img
                src={VERTICAL_IMG}
                alt="Student photographer capturing golden hour campus views"
                loading="lazy"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          <div className="md:col-span-6 bg-[#151519] border border-white/[0.08] rounded-2xl p-7">
            <span className="text-xs font-mono text-[#D4AF37]">03</span>
            <h3 className="mt-3 font-display text-xl font-semibold text-[#F8F9FA]">
              Private One-to-One Messaging
            </h3>
            <p className="mt-2 text-sm text-[#A1A1AA] leading-relaxed">
              Coordinate hostel meetups, swap notes, and stay close with direct conversations
              protected by participant-only database isolation.
            </p>
            <div className="mt-5 flex items-center gap-2 text-xs text-[#A1A1AA]">
              <MessageSquare className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Instant unread tracking · Private threads</span>
            </div>
          </div>

          <div id="safety" className="md:col-span-6 bg-[#151519] border border-white/[0.08] rounded-2xl p-7">
            <span className="text-xs font-mono text-[#D4AF37]">04</span>
            <h3 className="mt-3 font-display text-xl font-semibold text-[#F8F9FA]">
              Built-in Safety & Privacy Controls
            </h3>
            <p className="mt-2 text-sm text-[#A1A1AA] leading-relaxed">
              Your email and settings stay strictly isolated from public profiles. Block abusive
              accounts, control visibility, and report unsafe content directly to community
              moderators.
            </p>
            <div className="mt-5 flex items-center gap-2 text-xs text-[#A1A1AA]">
              <Lock className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Verified accounts · Zero-trust security rules</span>
            </div>
          </div>
        </div>
      </section>

      {/* Live Community Highlights (Real Firestore Data) */}
      <section id="highlights" className="max-w-7xl mx-auto px-5 sm:px-8 py-16 lg:py-24 border-b border-white/[0.06]">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#F8F9FA]">
              Live From the Community
            </h2>
            <p className="mt-2 text-sm text-[#A1A1AA]">
              Real stories and members currently active on HOSTELVERSE.
            </p>
          </div>
          <button
            type="button"
            onClick={onExploreCommunity}
            className="text-sm font-medium text-[#D4AF37] hover:text-[#E7C96F] flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <span>Open Explore</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {loadingHighlights ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-64 rounded-2xl bg-[#151519] border border-white/[0.08] animate-pulse"
              />
            ))}
          </div>
        ) : recentPosts.length === 0 ? (
          <div className="bg-[#151519] border border-white/[0.08] rounded-2xl p-10 text-center">
            <p className="font-display text-lg font-semibold text-[#F8F9FA]">
              Be the first to anchor your hostel’s archive.
            </p>
            <p className="mt-2 text-sm text-[#A1A1AA] max-w-md mx-auto">
              Create your profile in seconds and publish the inaugural photograph or video story on
              HOSTELVERSE.
            </p>
            <button
              type="button"
              onClick={onCreateAccount}
              className="mt-6 gold-gradient-btn px-5 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2"
            >
              <span>Create Your Account</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {recentPosts.map((post) => (
              <button
                key={post.id}
                type="button"
                onClick={onExploreCommunity}
                className="text-left bg-[#151519] border border-white/[0.08] hover:border-[#D4AF37]/40 rounded-2xl overflow-hidden transition-colors group"
              >
                <div className="aspect-[4/3] bg-[#0A0A0C] overflow-hidden">
                  {post.mediaType === 'video' ? (
                    <video
                      src={post.mediaUrl}
                      muted
                      preload="metadata"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <img
                      src={post.mediaUrl}
                      alt={post.caption || 'Community story'}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                    />
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-2.5">
                    <Avatar src={post.authorAvatarUrl} name={post.authorName} size="xs" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#F8F9FA] truncate">
                        @{post.authorUsername}
                      </p>
                      <p className="text-[11px] text-[#71717A]">
                        {formatRelativeTime(post.createdAt)} · {formatCount(post.likesCount)} likes
                      </p>
                    </div>
                  </div>
                  {post.caption && (
                    <p className="mt-2.5 text-xs text-[#A1A1AA] line-clamp-2">{post.caption}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {featuredMembers.length > 0 && (
          <div className="mt-10 pt-8 border-t border-white/[0.06]">
            <p className="text-xs font-medium text-[#A1A1AA] mb-4">Active Hostelverse Members</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {featuredMembers.map((member) => (
                <button
                  key={member.uid}
                  type="button"
                  onClick={onExploreCommunity}
                  className="bg-[#151519] border border-white/[0.08] hover:border-[#D4AF37]/30 rounded-xl p-3.5 text-left transition-colors"
                >
                  <Avatar src={member.avatarUrl} name={member.fullName} size="sm" />
                  <p className="mt-2.5 text-xs font-semibold text-[#F8F9FA] truncate">
                    {member.fullName}
                  </p>
                  <p className="text-[11px] text-[#A1A1AA] truncate">@{member.username}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Quiet Footer */}
      <footer className="max-w-7xl mx-auto px-5 sm:px-8 py-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 text-xs text-[#71717A]">
        <div>
          <p className="font-display font-semibold text-sm text-[#F8F9FA]">HOSTELVERSE</p>
          <p className="mt-1">Your Hostel. Your Stories. Your World.</p>
        </div>
        <div className="flex flex-wrap items-center gap-6 text-[#A1A1AA]">
          <button type="button" onClick={onExploreCommunity} className="hover:text-[#F8F9FA]">
            Explore
          </button>
          <button type="button" onClick={onCreateAccount} className="hover:text-[#F8F9FA]">
            Create Account
          </button>
          <button type="button" onClick={onLogin} className="hover:text-[#F8F9FA]">
            Sign In
          </button>
          <a href="#safety" className="hover:text-[#F8F9FA]">
            Privacy & Safety
          </a>
        </div>
      </footer>
    </div>
  );
}
