import { Capacitor } from '@capacitor/core'

interface SpotDLPlugin {
  initialize(): Promise<{}>
  getStatus(): Promise<{
    initialized: boolean
    pythonVersion: string | null
    spotdlVersion: string | null
  }>
  fetchMetadata(options: { url: string }): Promise<{
    tracks: Array<{
      title: string
      artist: string
      album: string
      artworkUrl: string | null
      duration: string
      url: string
    }>
  }>
  downloadTrack(options: {
    url: string
    outputDir?: string
    processId?: string
  }): Promise<{
    progress: number
    line: string
    processId: string
  }>
  cancelDownload(options: { processId: string }): Promise<{ killed: boolean }>
}

function getPlugin(): SpotDLPlugin | null {
  if (!Capacitor.isNativePlatform()) return null
  try {
    const { WebPluginProxy } = require('@capacitor/core') as any
    const plugin = (Capacitor as any).Plugins?.SpotDL as SpotDLPlugin
    return plugin || null
  } catch {
    return null
  }
}

let pluginInstance: SpotDLPlugin | null = null

export async function isNativeSpotDLAvailable(): Promise<boolean> {
  try {
    const p = getPlugin()
    if (!p) return false
    pluginInstance = p
    const status = await p.getStatus()
    return status.initialized
  } catch {
    return false
  }
}

async function ensureInitialized(): Promise<SpotDLPlugin> {
  if (pluginInstance) return pluginInstance
  const p = getPlugin()
  if (!p) throw new Error('SpotDL native plugin not available')
  pluginInstance = p
  await p.initialize()
  return p
}

export async function nativeFetchMetadata(
  url: string,
): Promise<Array<{ title: string; artist: string; album: string; artworkUrl: string | null }>> {
  const p = await ensureInitialized()
  const result = await p.fetchMetadata({ url })
  return result.tracks.map(t => ({
    title: t.title,
    artist: t.artist,
    album: t.album,
    artworkUrl: t.artworkUrl,
    url: t.url,
  }))
}

export async function nativeDownloadTrack(
  url: string,
  onProgress?: (pct: number, line: string) => void,
): Promise<void> {
  const p = await ensureInitialized()

  return new Promise<void>((resolve, reject) => {
    const processId = `dl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    const pollInterval = setInterval(async () => {
      try {
        const result = await p.downloadTrack({ url, processId })
        onProgress?.(result.progress * 100, result.line)

        if (result.progress >= 1) {
          clearInterval(pollInterval)
          resolve()
        }
      } catch (err: any) {
        clearInterval(pollInterval)
        if (err.message?.includes('exited with code')) {
          resolve() // might still have succeeded
        } else {
          reject(err)
        }
      }
    }, 500)

    // Timeout after 5 minutes
    setTimeout(() => {
      clearInterval(pollInterval)
      p.cancelDownload({ processId }).catch(() => {})
      reject(new Error('Download timed out'))
    }, 5 * 60 * 1000)
  })
}
