import { useNavigate, useLocation } from 'react-router-dom'
import { Play, Pause, ChevronUp, Shuffle, Repeat, Clock } from 'lucide-react'
import { ArtworkImage } from './ArtworkImage'
import { usePlayer } from '../hooks/usePlayer'
import { useBottomBar } from '../hooks/useBottomBar'

const RepeatOneIconMini = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="17 1 21 5 17 9" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <polyline points="7 23 3 19 7 15" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    <line x1="11" y1="12" x2="12.5" y2="10" />
    <line x1="12.5" y1="14" x2="11" y2="12" />
  </svg>
)

export function MiniPlayerBar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { currentTrack, isPlaying, pause, resume, shuffle, repeatMode, sleepTimer } = usePlayer()
  const bottomBarHidden = useBottomBar(s => s.hidden)
  const isPlayerPage = location.pathname === '/player'
  const showBottomBar = !bottomBarHidden && !isPlayerPage

  if (!currentTrack) return null

  return (
    <div
      className={`fixed left-2 right-2 z-50 mx-auto max-w-xl pb-[env(safe-area-inset-bottom,0px)] ${
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
        {(shuffle || repeatMode !== 'none') && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {shuffle && <Shuffle className="w-3 h-3 text-accent" />}
            {repeatMode === 'one' && <RepeatOneIconMini className="w-3 h-3 text-accent" />}
            {repeatMode === 'all' && <Repeat className="w-3 h-3 text-accent" />}
          </div>
        )}
        {sleepTimer.mode !== 'off' && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <Clock className="w-3 h-3 text-accent" />
          </div>
        )}
        <ChevronUp className="w-4 h-4 text-light-muted dark:text-dark-muted flex-shrink-0" />
      </button>
    </div>
  )
}
