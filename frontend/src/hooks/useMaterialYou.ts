import { useEffect, useMemo } from 'react'
import { useTheme } from './useTheme'

interface MaterialPalette {
  primary: string
  onPrimary: string
  primaryContainer: string
  secondary: string
  surface: string
  surfaceVariant: string
  surfaceContainerLow: string
  surfaceContainerHigh: string
  onSurface: string
  onSurfaceVariant: string
  outline: string
  outlineVariant: string
  error: string
  scrim: string
}

function hexToRgb(hex: string) {
  const val = parseInt(hex.replace('#', ''), 16)
  return { r: (val >> 16) & 255, g: (val >> 8) & 255, b: val & 255 }
}

function rgbToHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map(c => Math.round(c).toString(16).padStart(2, '0')).join('')
}

function blend(fg: string, bg: string, alpha: number) {
  const f = hexToRgb(fg)
  const b = hexToRgb(bg)
  return rgbToHex(
    f.r * alpha + b.r * (1 - alpha),
    f.g * alpha + b.g * (1 - alpha),
    f.b * alpha + b.b * (1 - alpha),
  )
}

const ACCENT = '#10B981'

export function useMaterialYou() {
  const { isDark } = useTheme()

  const palette: MaterialPalette = useMemo(() => {
    const bg = isDark ? '#0B0F19' : '#F8FAFC'
    const surface = isDark ? '#111827' : '#FFFFFF'
    const surfaceV = isDark ? '#1E293B' : '#F1F5F9'
    const onSurface = isDark ? '#F1F5F9' : '#0F172A'

    return {
      primary: ACCENT,
      onPrimary: '#FFFFFF',
      primaryContainer: blend(ACCENT, bg, 0.15),
      secondary: isDark ? '#6EE7B7' : '#059669',
      surface,
      surfaceVariant: surfaceV,
      surfaceContainerLow: isDark ? '#131B2A' : '#F8FAFC',
      surfaceContainerHigh: isDark ? '#1A2332' : '#F1F5F9',
      onSurface,
      onSurfaceVariant: isDark ? '#94A3B8' : '#64748B',
      outline: isDark ? '#334155' : '#CBD5E1',
      outlineVariant: isDark ? '#1E293B' : '#E2E8F0',
      error: '#EF4444',
      scrim: 'rgba(0,0,0,0.6)',
    }
  }, [isDark])

  useEffect(() => {
    const root = document.documentElement
    Object.entries(palette).forEach(([key, val]) => {
      root.style.setProperty(`--md-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`, val)
    })
  }, [palette])

  return palette
}
