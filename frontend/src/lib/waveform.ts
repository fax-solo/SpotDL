// Waveform-as-structure: every progress/scrubber surface renders a
// deterministic per-track waveform instead of a flat bar. The algorithm here
// is mirrored 1:1 in the Android app (WaveformGenerator.kt) so both codebases
// produce the same shape for the same track id.

/** FNV-1a 32-bit hash — stable string -> uint32 seed. */
export function hashTrackId(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Mulberry32 PRNG — returns () => [0,1). Mirrors WaveformGenerator.kt. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Deterministic bar amplitudes (0.08..1) for a track id.
 * A bell envelope keeps edges quiet and the centre full so the shape reads as
 * "music" rather than noise. Results are identical on web + Android.
 */
export function generateWaveform(trackId: string, bars: number): number[] {
  if (bars <= 0) return []
  const rand = mulberry32(hashTrackId(trackId))
  const out: number[] = []
  for (let i = 0; i < bars; i++) {
    const t = bars === 1 ? 0.5 : i / (bars - 1)
    const envelope = Math.sin(Math.PI * t)
    const base = 0.18 + 0.62 * envelope
    const n = 1 - rand() * 0.6
    const v = base * n * (0.5 + rand() * 0.5)
    out.push(Math.min(1, Math.max(0.08, v)))
  }
  return out
}

/** Animated "listening" loading bars — the signature applied to resolving state. */
export function loadingWaveform(bars: number): number[] {
  const out: number[] = []
  for (let i = 0; i < bars; i++) {
    const t = bars === 1 ? 0.5 : i / (bars - 1)
    out.push(0.25 + 0.65 * Math.sin(Math.PI * t))
  }
  return out
}