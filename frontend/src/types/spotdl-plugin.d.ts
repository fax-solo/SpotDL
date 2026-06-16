declare module '@capacitor/core' {
  interface PluginRegistry {
    SpotDL: SpotDLPlugin
  }
}

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
