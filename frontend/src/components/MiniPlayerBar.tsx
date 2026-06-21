import { useNavigate, useLocation } from 'react-router-dom'
import { Play, Pause, ChevronUp } from 'lucide-react'
import { ArtworkImage } from './ArtworkImage'
import { usePlayer } from '../hooks/usePlayer'
import { useBottomBar } from '../hooks/useBottomBar'

export function MiniPlayerBar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { currentTrack, isPlaying, pause, resume } = usePlayer()
  const bottomBarHidden = useBottomBar(s => s.hidden)
  const isPlayerPage = location.pathname === '/player'
  const showBottomBar = !bottomBarHidden && !isPlayerPage

  if (!currentTrack) return null

  return (
    <div
      className={`fixed left-2 right-2 z-50 mx-auto max-w-xl ${
        showBottomBar ? 'bottom-[66px]' : 'bottom-2'
      }`}
    >
      <button
        onClick={() => navigate('/player')}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-white/95 dark:bg-dark-surface/95 backdrop-mobile border border-light-border/60 dark:border-dark-border/60 elevation-2 hover:shadow-md transition-shadow cursor-pointer text-left press-scale"
      >
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent/20 to-blue-500/20 flex-shrink-0 overflow-hidden elevation-1">
          {currentTrack.artworkUrl ? <ArtworkImage src={currentTrack.artworkUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-light-text dark:text-dark-text truncate leading-tight">{currentTrack.title}</p>
          <p className="text-xs text-light-muted dark:text-dark-muted truncate">{currentTrack.artist}</p>
        </div>
        <button
          onClick={e => { e.stopPropagation(); isPlaying ? pause() : resume() }}
          className="w-9 h-9 rounded-full bg-accent flex items-center justify-center flex-shrink-0 hover:bg-accent-hover transition-colors cursor-pointer active:scale-90"
          style={{ transition: 'transform 0.15s cubic-bezier(0.4, 0, 0.2, 1)' }}
        >
          {isPlaying ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white ml-0.5" />}
        </button>
        <ChevronUp className="w-4 h-4 text-light-muted dark:text-dark-muted flex-shrink-0" />
      </button>
    </div>
  )
}
