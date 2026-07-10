import type { ReactNode } from 'react'

interface ShimmerProps {
  className?: string
  children?: ReactNode
}

export function Shimmer({ className = '', children }: ShimmerProps) {
  if (children) {
    return (
      <div className={`relative overflow-hidden ${className}`} aria-hidden="true">
        {children}
        <div className="absolute inset-0 shimmer" />
      </div>
    )
  }

  return (
    <div
      className={`bg-gray-200 dark:bg-zinc-700 rounded shimmer ${className}`}
      aria-hidden="true"
    />
  )
}

export function ShimmerCard() {
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

export function ShimmerRow({ hideIndex }: { hideIndex?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      {!hideIndex && <Shimmer className="w-6 h-4 rounded flex-shrink-0" />}
      <Shimmer className="w-11 h-11 rounded flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Shimmer className="h-3.5 rounded w-2/3" />
        <Shimmer className="h-3 rounded w-1/3" />
      </div>
      <Shimmer className="w-9 h-9 rounded-lg flex-shrink-0" />
    </div>
  )
}
