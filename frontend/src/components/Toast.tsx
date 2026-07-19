import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react'
import { CheckCircle, AlertCircle, X, Loader2 } from 'lucide-react'

type ToastType = 'success' | 'error' | 'loading' | 'info'

interface ToastItem {
  id: string
  type: ToastType
  message: string
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

let toastId = 0

function SwipeableToast({ toast: t, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const startX = useRef(0)
  const currentX = useRef(0)
  const [dragging, setDragging] = useState(false)
  const [offsetX, setOffsetX] = useState(0)
  const toastRef = useRef<HTMLDivElement>(null)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    if (!touch) return
    startX.current = touch.clientX
    currentX.current = 0
    setDragging(true)
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    if (!touch) return
    const diff = touch.clientX - startX.current
    if (Math.abs(diff) > Math.abs(0)) {
      currentX.current = diff
      setOffsetX(diff)
    }
  }, [])

  const handleTouchEnd = useCallback(() => {
    setDragging(false)
    if (Math.abs(currentX.current) > 100) {
      onDismiss(t.id)
    }
    setOffsetX(0)
  }, [t.id, onDismiss])

  return (
    <div
      ref={el => {
        toastRef.current = el
        if (!el) return
        el.style.transform = dragging ? `translateX(${offsetX}px)` : 'none'
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`touch-pan-y pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border backdrop-blur-xl cursor-pointer select-none transition-all duration-300 ${
        t.type === 'success' ? 'bg-green-500/10 dark:bg-green-500/15 border-green-500/30 text-green-700 dark:text-green-400' :
        t.type === 'error' ? 'bg-red-500/10 dark:bg-red-500/15 border-red-500/30 text-red-700 dark:text-red-400' :
        t.type === 'loading' ? 'bg-accent-subtle border-accent/30 text-accent' :
        'bg-white/90 dark:bg-dark-surface/90 border-light-border/50 dark:border-dark-border/50 text-light-text dark:text-dark-text'
      }`}
      role="status"
      aria-live="polite"
    >
      {t.type === 'success' && <CheckCircle className="w-5 h-5 flex-shrink-0" />}
      {t.type === 'error' && <AlertCircle className="w-5 h-5 flex-shrink-0" />}
      {t.type === 'loading' && <Loader2 className="w-5 h-5 flex-shrink-0 animate-spin" />}
      {t.type === 'info' && <Loader2 className="w-5 h-5 flex-shrink-0" />}
      <span className="text-sm font-medium flex-1">{t.message}</span>
      {t.type !== 'loading' && (
        <button onClick={() => onDismiss(t.id)} className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer flex-shrink-0" aria-label="Dismiss notification">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = String(++toastId)
    setToasts(prev => {
      const next = [...prev, { id, message, type }]
      if (next.length > 3) {
        const excess = next.slice(0, next.length - 3)
        excess.forEach(t => setTimeout(() => dismiss(t.id), 0))
        return next.slice(-3)
      }
      return next
    })
    if (type !== 'loading') {
      const delay = Math.min(Math.max(message.length * 80, 2000), 6000)
      setTimeout(() => dismiss(id), delay)
    }
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div className="fixed bottom-[calc(112px+env(safe-area-inset-bottom,0px))] left-4 right-4 md:left-auto md:right-4 md:w-96 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <SwipeableToast key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}
