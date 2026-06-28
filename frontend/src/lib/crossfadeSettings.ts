const STORAGE_KEY = 'crossfade_duration'

export function getCrossfadeDuration(): number {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved !== null) {
      const val = parseFloat(saved)
      if (!isNaN(val) && val >= 0 && val <= 12) return val
    }
  } catch {}
  return 0
}

export function setCrossfadeDuration(seconds: number): void {
  localStorage.setItem(STORAGE_KEY, String(Math.max(0, Math.min(12, seconds))))
}
