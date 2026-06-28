export type Bitrate = '128' | '192' | '256' | '320'
export type OutputFormat = 'mp3' | 'm4a'

export interface QualitySettings {
  bitrate: Bitrate
  format: OutputFormat
}

const STORAGE_KEY = 'download_quality'

export function getQualitySettings(): QualitySettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch {}
  return { bitrate: '320', format: 'mp3' }
}

export function setQualitySettings(settings: QualitySettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}
