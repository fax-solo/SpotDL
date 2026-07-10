import { Shimmer } from './Shimmer'

export function SkeletonRow({ hideIndex }: { hideIndex?: boolean }) {
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
