declare module 'browser-id3-writer' {
  interface APICOptions {
    type: number
    data: ArrayBuffer
    description: string
    useUnicodeEncoding: boolean
  }

  class ID3Writer {
    constructor(buffer: ArrayBuffer)
    setFrame(frame: string, value: string | string[] | Record<string, unknown> | APICOptions): void
    addTag(): Promise<ArrayBuffer>
  }

  export default ID3Writer
}
