import { useState } from 'react'
import { Music } from 'lucide-react'

interface ArtworkImageProps {
  src: string | null
  alt: string
  className: string
  iconSize?: number
  loading?: 'lazy' | 'eager'
  fetchPriority?: 'high' | 'low' | 'auto'
}

export function ArtworkImage({ src, alt, className, iconSize = 16, loading = 'lazy', fetchPriority }: ArtworkImageProps) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)

  if (!src || failed) {
    return (
      <div className={`${className} bg-gray-200 dark:bg-zinc-700 flex items-center justify-center`}>
        <Music className="text-gray-400" style={{ width: iconSize, height: iconSize }} />
      </div>
    )
  }

  return (
    <div className={`${className} relative overflow-hidden`}>
      {!loaded && <div className="absolute inset-0 shimmer" />}
      <img
        src={src}
        alt={alt}
        className={`w-full h-full object-cover ${loaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
        loading={loading}
        decoding="async"
        fetchPriority={fetchPriority}
        onLoad={() => setLoaded(true)}
        onError={() => { setFailed(true); setLoaded(true) }}
      />
    </div>
  )
}
