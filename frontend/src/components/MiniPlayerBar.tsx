import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Play, Pause, ChevronUp } from 'lucide-react'
import { ArtworkImage } from './ArtworkImage'
import { usePlayer } from '../hooks/usePlayer'

export function MiniPlayerBar() {
  const navigate = useNavigate()
  const { currentTrack, isPlaying, pause, resume } = usePlayer()

  if (!currentTrack) return null

  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      className="fixed bottom-[60px] left-2 right-2 z-50 mx-auto max-w-xl"
    >
      <button
        onClick={() => navigate('/player')}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/95 dark:bg-dark-surface/95 backdrop-blur-xl border border-light-border/60 dark:border-dark-border/60 shadow-lg hover:shadow-md transition-shadow cursor-pointer text-left"
      >
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent/20 to-blue-500/20 flex-shrink-0 overflow-hidden">
          {currentTrack.artworkUrl ? <ArtworkImage src={currentTrack.artworkUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-light-text dark:text-dark-text truncate leading-tight">{currentTrack.title}</p>
          <p className="text-xs text-light-muted dark:text-dark-muted truncate">{currentTrack.artist}</p>
        </div>
        <button
          onClick={e => { e.stopPropagation(); isPlaying ? pause() : resume() }}
          className="w-9 h-9 rounded-full bg-accent flex items-center justify-center flex-shrink-0 hover:bg-accent-hover transition-colors cursor-pointer"
        >
          {isPlaying ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white ml-0.5" />}
        </button>
        <ChevronUp className="w-4 h-4 text-light-muted dark:text-dark-muted flex-shrink-0" />
      </button>
    </motion.div>
  )
}
