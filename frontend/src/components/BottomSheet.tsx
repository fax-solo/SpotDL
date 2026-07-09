import { type ReactNode, useRef, useState, useCallback, useEffect } from 'react'


interface BottomSheetProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  snapPoints?: string[]
  title?: string
}

export function BottomSheet({ open, onClose, children, title }: BottomSheetProps) {
  const [sheetY, setSheetY] = useState(0)
  const startY = useRef(0)
  const dragging = useRef(false)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.currentTarget.scrollTop === 0) {
      startY.current = e.touches[0].clientY
      dragging.current = true
    }
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragging.current) return
    const diff = e.touches[0].clientY - startY.current
    if (diff > 0) {
      setSheetY(diff * 0.6)
    }
  }, [])

  const handleTouchEnd = useCallback(() => {
    dragging.current = false
    if (sheetY > 100) {
      onClose()
    }
    setSheetY(0)
  }, [sheetY, onClose])

  useEffect(() => {
    if (open) {
      setSheetY(0)
    }
  }, [open])

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={onClose}
          />
          <div
            ref={el => { if (el) el.style.transform = `translateY(${sheetY}px)` }}
            className="relative w-full max-h-[85vh] bg-white dark:bg-dark-surface rounded-t-2xl overflow-hidden shadow-xl"
          >
            <div
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              className="overflow-y-auto max-h-[85vh]"
            >
              <div className="sticky top-0 z-10 bg-white dark:bg-dark-surface pt-2 pb-1">
                <div className="pull-indicator" />
                {title && (
                  <h3 className="text-base font-semibold text-light-text dark:text-dark-text px-4 pb-2">
                    {title}
                  </h3>
                )}
              </div>
              <div className="px-4 pb-6">
                {children}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
