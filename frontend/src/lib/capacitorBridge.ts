import { Capacitor } from '@capacitor/core'

export function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

export async function downloadFile(blob: Blob, filename: string): Promise<string | null> {
  if (isNative()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const base64 = await blobToBase64(blob)
    const result = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Documents,
    })
    return result.uri
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return null
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
