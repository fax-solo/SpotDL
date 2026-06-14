export function SkeletonCard() {
  return (
    <div className="flex-shrink-0 w-[160px] rounded-xl overflow-hidden bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 animate-pulse">
      <div className="aspect-square bg-gray-200 dark:bg-zinc-700" />
      <div className="p-3 space-y-2">
        <div className="h-3.5 bg-gray-200 dark:bg-zinc-700 rounded w-3/4" />
        <div className="h-3 bg-gray-200 dark:bg-zinc-700 rounded w-1/2" />
      </div>
    </div>
  )
}
