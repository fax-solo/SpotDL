import { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Download, Play, Clock, User } from 'lucide-react'
import { ArtworkImage } from '../components/ArtworkImage'
import { getVideoInfo, type YouTubeInfo } from '../lib/youtubeClient'
import { downloadTrack } from '../lib/api'
import { saveOrCacheBlob } from '../lib/capacitorBridge'
import { useToast } from '../components/Toast'
import { useHistory } from '../hooks/useHistory'

export function YtTrackDetail() {
  const { videoId } = useParams<{ videoId: string }>()
  const navigate = useNavigate()
  const location = useLocation()

  const state = location.state as { title?: string; thumbnail?: string; url?: string; author?: string } | null
  const stateUrl = state?.url || `https://music.youtube.com/watch?v=${videoId}`
  const { toast } = useToast()
  const { addEntry } = useHistory()

  const [info, setInfo] = useState<YouTubeInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [downloadStatus, setDownloadStatus] = useState('')

  useEffect(() => {
    if (!videoId) return
    setLoading(true)
    getVideoInfo(stateUrl)
      .then(setInfo)
      .catch(() => setInfo(null))
      .finally(() => setLoading(false))
  }, [videoId, stateUrl])

  const title = info?.title || state?.title || 'Unknown'
  const thumbnail = info?.thumbnail || state?.thumbnail || null
  const author = info?.author || state?.author || 'Unknown'
  const duration = info?.duration

  const handleDownload = async () => {
    setDownloading(true)
    setDownloadProgress(0)
    setDownloadStatus('Starting download...')
    try {
      const meta = {
        title,
        artist: author,
        album: 'YouTube',
        artwork_url: thumbnail,
        url: stateUrl,
        type: 'track',
      }
      const { blob, filename } = await downloadTrack(meta, (stage, pct) => {
        setDownloadStatus(stage)
        if (pct) setDownloadProgress(pct)
      }, undefined, 1)
      const filePath = await saveOrCacheBlob(blob, filename)
      toast(`Downloaded ${title}`, 'success')
      addEntry({
        title,
        artist: author,
        album: 'YouTube',
        artworkUrl: thumbnail,
        filePath,
      })
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Download failed', 'error')
    }
    setDownloading(false)
    setDownloadStatus('')
    setDownloadProgress(0)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-light-bg dark:bg-dark-bg pb-32 flex flex-col items-center justify-center px-6">
        <div className="w-64 h-64 rounded-2xl bg-zinc-800 animate-pulse mb-8" />
        <div className="h-8 bg-zinc-800 rounded-lg animate-pulse w-48 mb-3" />
        <div className="h-4 bg-zinc-800 rounded-lg animate-pulse w-32" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text pb-32">
      <button
        onClick={() => navigate(-1)}
        className="absolute left-4 z-10 w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center cursor-pointer text-white safe-top-1rem"
        aria-label="Go back"
      >
        <ArrowLeft className="w-5 h-5" aria-hidden="true" />
      </button>

      <div className="flex flex-col items-center px-6 pt-16">
        <div className="w-64 h-64 rounded-2xl overflow-hidden shadow-2xl mb-8 bg-red-500/10">
          {thumbnail ? (
            <ArtworkImage src={thumbnail} alt={title} className="w-full h-full" iconSize={48} loading="eager" fetchPriority="high" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Play className="w-12 h-12 text-red-400/40" />
            </div>
          )}
        </div>

        <div className="text-center w-full max-w-sm">
          <h1 className="text-2xl font-bold text-light-text dark:text-white leading-tight mb-1 line-clamp-2">
            {title}
          </h1>

          <p className="text-base text-light-muted dark:text-zinc-400">
            <User className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
            {author}
          </p>

          {duration && Number(duration) > 0 && (
            <p className="text-xs text-light-muted dark:text-zinc-600 mt-3 flex items-center justify-center gap-1">
              <Clock className="w-3 h-3" />
              {Math.floor(Number(duration) / 60)}:{String(Math.floor(Number(duration) % 60)).padStart(2, '0')}
            </p>
          )}
        </div>

        <div className="w-full max-w-sm mt-8">
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="w-full py-3.5 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden"
          >
            {downloading && (
              <div 
                ref={el => { if (el) el.style.width = `${downloadProgress}%` }}
                className="absolute left-0 top-0 bottom-0 bg-red-600 transition-all duration-300"
              />
            )}
            <span className="relative flex items-center gap-2 z-10">
              <Download className="w-5 h-5" />
              {downloading ? downloadStatus || 'Downloading...' : 'Download'}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-4 mt-8 text-xs text-light-muted dark:text-zinc-600">
          <button onClick={() => navigate('/')} className="hover:text-accent transition-colors cursor-pointer">Home</button>
          <span>•</span>
          <button onClick={() => navigate('/download')} className="hover:text-accent transition-colors cursor-pointer">Download</button>
        </div>
      </div>
    </div>
  )
}
