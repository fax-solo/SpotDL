import { useState, useMemo, useCallback } from 'react'
import { Music } from 'lucide-react'
import { optimizeImageUrl } from '../lib/imageOptimizer'

interface ArtworkImageProps {
  src: string | null
  alt: string
  className: string
  iconSize?: number
  loading?: 'lazy' | 'eager'
  fetchPriority?: 'high' | 'low' | 'auto'
  width?: number
  height?: number
}

export function ArtworkImage({ src, alt, className, iconSize = 16, loading = 'lazy', fetchPriority, width, height }: ArtworkImageProps) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const optimizedSrc = useMemo(
    () => optimizeImageUrl(src, Math.max(iconSize * 2, 64)),
    [src, iconSize],
  )

  const handleLoad = useCallback(() => setLoaded(true), [])
  const handleError = useCallback(() => { setFailed(true); setLoaded(true) }, [])

  if (!src || failed) {
    return (
      <div className={`${className} bg-gray-200 dark:bg-zinc-700 flex items-center justify-center`}>
        <Music size={iconSize} className="text-gray-400 flex-shrink-0" />
      </div>
    )
  }

  return (
    <div className={`${className} relative overflow-hidden`}>
      {!loaded && <div className="absolute inset-0 shimmer" />}
      <img
        src={optimizedSrc ?? undefined}
        alt={alt}
        width={width}
        height={height}
        className={`w-full h-full object-cover ${loaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
        loading={loading}
        decoding="async"
        fetchPriority={fetchPriority}
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  )
}
