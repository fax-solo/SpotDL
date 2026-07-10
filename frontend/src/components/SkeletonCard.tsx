import { Shimmer } from './Shimmer'

export function SkeletonCard() {
  return (
    <div className="flex-shrink-0 w-[160px] rounded-xl overflow-hidden bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50">
      <Shimmer className="aspect-square" />
      <div className="p-3 space-y-2">
        <Shimmer className="h-3.5 rounded w-3/4" />
        <Shimmer className="h-3 rounded w-1/2" />
      </div>
    </div>
  )
}
