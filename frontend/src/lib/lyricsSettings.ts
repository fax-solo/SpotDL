const KEY = 'downloadLyrics'

export function getDownloadLyrics(): boolean {
  return localStorage.getItem(KEY) !== 'false'
}

export function setDownloadLyrics(value: boolean): void {
  localStorage.setItem(KEY, String(value))
}
