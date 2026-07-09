// Shape-matched loading placeholders. `animate-pulse` is disabled under
// prefers-reduced-motion by the global CSS rule, degrading to a static block.
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200/70 ${className}`} aria-hidden />
}

export function FixtureCardSkeleton() {
  return (
    <div className="soft-card rounded-2xl p-6 h-full">
      <div className="flex items-start justify-between mb-6">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-8 w-8 rounded-xl" />
      </div>
      <div className="space-y-3 mb-6">
        <div className="flex items-center gap-2.5"><Skeleton className="h-6 w-6 rounded-full" /><Skeleton className="h-6 w-32" /></div>
        <Skeleton className="h-3 w-8" />
        <div className="flex items-center gap-2.5"><Skeleton className="h-6 w-6 rounded-full" /><Skeleton className="h-6 w-28" /></div>
      </div>
      <div className="pt-4 border-t border-slate-100 flex justify-between">
        <Skeleton className="h-3 w-24" /><Skeleton className="h-3 w-16" />
      </div>
    </div>
  )
}

export function RowSkeleton() {
  return (
    <div className="soft-card rounded-2xl px-5 py-4 flex items-center gap-4">
      <Skeleton className="h-9 w-9 rounded-full" />
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-4 w-16 ml-auto" />
      <Skeleton className="h-4 w-16" />
    </div>
  )
}
