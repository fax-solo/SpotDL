export interface SyncedLine {
  time: number
  text: string
}

export function parseLRC(lrc: string): SyncedLine[] {
  const lines = lrc.split('\n')
  const result: SyncedLine[] = []
  const timeRegex = /\[(\d{1,3}):(\d{2})\.(\d{2,3})\]/

  for (const line of lines) {
    const match = timeRegex.exec(line)
    if (!match) continue
    const minutes = parseInt(match[1]!, 10)
    const seconds = parseInt(match[2]!, 10)
    const frac = parseInt(match[3]!, 10)
    const ms = match[3]!
    const time = minutes * 60 + seconds + frac / (ms.length === 3 ? 1000 : 100)
    const text = line.replace(timeRegex, '').trim()
    if (text) {
      result.push({ time, text })
    }
  }

  result.sort((a, b) => a.time - b.time)
  return result
}

export function findCurrentLine(lines: SyncedLine[], currentTime: number): number {
  if (lines.length === 0) return -1
  if (!lines[0] || currentTime < lines[0].time) return -1

  let lo = 0
  let hi = lines.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1
    const line = lines[mid]
    if (!line) break
    if (line.time <= currentTime) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }
  return lo
}

export function getCurrentLyricLine(lines: SyncedLine[], currentTime: number): string | null {
  const idx = findCurrentLine(lines, currentTime)
  if (idx < 0 || idx >= lines.length) return null
  return lines[idx]?.text ?? null
}
