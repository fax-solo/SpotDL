import { useState, useMemo, useEffect, useRef } from 'react'
import { Music } from 'lucide-react'
import { optimizeImageUrl } from '../lib/imageOptimizer'
import { getCachedArtwork, cacheArtwork } from '../lib/dbCache'

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

async function fetchWithCache(url: string, signal: AbortSignal): Promise<string> {
  const cached = await getCachedArtwork(url)
  if (cached) {
    return URL.createObjectURL(cached)
  }
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error('Fetch failed')
  const blob = await res.blob()
  cacheArtwork(url, blob).catch(() => {})
  return URL.createObjectURL(blob)
}

function genFallbackUrls(url: string): string[] {
  try {
    const parsed = new URL(url)
    const fallbacks: string[] = []

    if (parsed.hostname.includes('scdn.co') || parsed.hostname.includes('spotifycdn.com')) {
      const noSize = new URL(url)
      noSize.searchParams.delete('w')
      noSize.searchParams.delete('h')
      noSize.searchParams.delete('fit')
      fallbacks.push(noSize.toString())
      const larger = new URL(url)
      larger.searchParams.set('w', '640')
      larger.searchParams.set('h', '640')
      fallbacks.push(larger.toString())
      return fallbacks
    }

    if (parsed.hostname === 'i.ytimg.com') {
      const vidMatch = parsed.pathname.match(/\/vi\/([^/]+)\//)
      if (vidMatch) {
        fallbacks.push(`https://i.ytimg.com/vi/${vidMatch[1]}/hqdefault.jpg`)
        fallbacks.push(`https://i.ytimg.com/vi/${vidMatch[1]}/default.jpg`)
        fallbacks.push(`https://i.ytimg.com/vi/${vidMatch[1]}/mqdefault.jpg`)
      }
    }

    return fallbacks
  } catch {
    return []
  }
}

const MAX_RETRIES = 2

export function ArtworkImage({ src, alt, className, iconSize = 16, loading = 'lazy', fetchPriority, width, height }: ArtworkImageProps) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const fetchRef = useRef<AbortController | null>(null)

  const optimizedSrc = useMemo(
    () => optimizeImageUrl(src, Math.max(iconSize * 2, 64)),
    [src, iconSize],
  )

  useEffect(() => {
    fetchRef.current?.abort()
    setBlobUrl(null)
    setLoaded(false)
    setFailed(false)

    const url = optimizedSrc
    if (!url) {
      setLoaded(true)
      return
    }

    const ctrl = new AbortController()
    fetchRef.current = ctrl

    const tryFetch = async (urls: string[], attempt = 0): Promise<void> => {
      if (ctrl.signal.aborted) return
      const currentUrl = urls[0]
      if (!currentUrl) {
        if (!ctrl.signal.aborted) { setFailed(true); setLoaded(true) }
        return
      }
      try {
        const blobUrl = await fetchWithCache(currentUrl, ctrl.signal)
        if (!ctrl.signal.aborted) {
          setBlobUrl(blobUrl)
        }
      } catch {
        if (ctrl.signal.aborted) return
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, Math.min(500 * (attempt + 1), 2000)))
          return tryFetch(urls, attempt + 1)
        }
        const fallbacks = genFallbackUrls(currentUrl)
        return tryFetch(fallbacks)
      }
    }

    tryFetch([url])

    return () => { ctrl.abort() }
  }, [optimizedSrc])

  useEffect(() => {
    return () => {
      if (blobUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(blobUrl)
      }
    }
  }, [blobUrl])

  if (!src || failed) {
    return (
      <div className={`${className} bg-gray-200 dark:bg-zinc-700 flex items-center justify-center`}>
        <Music ref={el => { if (el) { el.style.width = `${iconSize}px`; el.style.height = `${iconSize}px` } }} className="text-gray-400" />
      </div>
    )
  }

  return (
    <div className={`${className} relative overflow-hidden`}>
      {!loaded && <div className="absolute inset-0 shimmer" />}
      <img
        src={blobUrl ?? optimizedSrc ?? undefined}
        alt={alt}
        width={width}
        height={height}
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