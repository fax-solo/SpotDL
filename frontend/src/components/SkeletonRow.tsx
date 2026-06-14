export function SkeletonRow({ hideIndex }: { hideIndex?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 animate-pulse">
      {!hideIndex && <div className="w-6 h-4 bg-gray-200 dark:bg-zinc-700 rounded flex-shrink-0" />}
      <div className="w-11 h-11 rounded bg-gray-200 dark:bg-zinc-700 flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 bg-gray-200 dark:bg-zinc-700 rounded w-2/3" />
        <div className="h-3 bg-gray-200 dark:bg-zinc-700 rounded w-1/3" />
      </div>
      <div className="w-9 h-9 rounded-lg bg-gray-200 dark:bg-zinc-700 flex-shrink-0" />
    </div>
  )
}
