export function PostCardSkeleton() {
  return (
    <div className="bg-[#151519] border border-white/[0.08] rounded-2xl overflow-hidden animate-pulse">
      <div className="p-4 flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-white/[0.06]" />
        <div className="space-y-2 flex-1">
          <div className="h-3.5 w-36 bg-white/[0.06] rounded" />
          <div className="h-2.5 w-24 bg-white/[0.04] rounded" />
        </div>
      </div>
      <div className="aspect-[4/3] w-full bg-white/[0.04]" />
      <div className="p-4 space-y-2.5">
        <div className="h-3 w-3/4 bg-white/[0.06] rounded" />
        <div className="h-3 w-1/2 bg-white/[0.04] rounded" />
      </div>
    </div>
  );
}

export function MemberCardSkeleton() {
  return (
    <div className="bg-[#151519] border border-white/[0.08] rounded-2xl p-5 animate-pulse flex items-center gap-3.5">
      <div className="w-12 h-12 rounded-full bg-white/[0.06] shrink-0" />
      <div className="space-y-2 flex-1">
        <div className="h-3.5 w-28 bg-white/[0.06] rounded" />
        <div className="h-3 w-20 bg-white/[0.04] rounded" />
      </div>
    </div>
  );
}
