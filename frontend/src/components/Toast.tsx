import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = String(++toastId)
    setToasts(prev => [...prev, { id, message, type }])
    if (type !== 'loading') {
      setTimeout(() => dismiss(id), 4000)
    }
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div className="fixed bottom-24 left-4 right-4 md:left-auto md:right-4 md:w-96 z-[100] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence mode="popLayout">
          {toasts.map(t => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border backdrop-blur-xl ${
                t.type === 'success' ? 'bg-green-500/10 dark:bg-green-500/15 border-green-500/30 text-green-700 dark:text-green-400' :
                t.type === 'error' ? 'bg-red-500/10 dark:bg-red-500/15 border-red-500/30 text-red-700 dark:text-red-400' :
                t.type === 'loading' ? 'bg-accent-subtle border-accent/30 text-accent' :
                'bg-white/90 dark:bg-dark-surface/90 border-light-border/50 dark:border-dark-border/50 text-light-text dark:text-dark-text'
              }`}
            >
              {t.type === 'success' && <CheckCircle className="w-5 h-5 flex-shrink-0" />}
              {t.type === 'error' && <AlertCircle className="w-5 h-5 flex-shrink-0" />}
              {t.type === 'loading' && <Loader2 className="w-5 h-5 flex-shrink-0 animate-spin" />}
              {t.type === 'info' && <Loader2 className="w-5 h-5 flex-shrink-0" />}
              <span className="text-sm font-medium flex-1">{t.message}</span>
              {t.type !== 'loading' && (
                <button onClick={() => dismiss(t.id)} className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer flex-shrink-0">
                  <X className="w-4 h-4" />
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
