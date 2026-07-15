export type Bitrate = '128' | '192' | '256' | '320'
export type OutputFormat = 'mp3' | 'm4a'
export type AudioVariant = 'normal' | 'sped_up' | 'slowed_reverb'

export interface QualitySettings {
  bitrate: Bitrate
  format: OutputFormat
  variant?: AudioVariant
}

const STORAGE_KEY = 'download_quality'

export function getQualitySettings(): QualitySettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch {}
  return { bitrate: '320', format: 'mp3', variant: 'normal' }
}

export function setQualitySettings(settings: QualitySettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export const VARIANT_LABELS: Record<AudioVariant, string> = {
  normal: 'Normal',
  sped_up: 'Sped Up',
  slowed_reverb: 'Slowed + Reverb',
}

export const VARIANT_FILENAME_SUFFIXES: Record<AudioVariant, string> = {
  normal: '',
  sped_up: ' (Sped Up)',
  slowed_reverb: ' (Slowed + Reverb)',
}
