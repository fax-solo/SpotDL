export async function mapConcurrent<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number = 4,
  onError?: (error: unknown, item: T, index: number) => void,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  let activeErrors = 0
  let backoff = 0

  async function worker() {
    while (next < items.length) {
      if (backoff > 0) {
        await new Promise(r => setTimeout(r, backoff))
        backoff = Math.max(0, backoff - 1000)
      }

      const i = next++
      const item = items[i]

      try {
        results[i] = await fn(item, i)
        activeErrors = Math.max(0, activeErrors - 1)
      } catch (err) {
        activeErrors++
        onError?.(err, item, i)
        // Adaptive backoff: if too many errors, slow down
        if (activeErrors >= 3) {
          backoff = Math.min(backoff + 2000, 30000)
        }
        throw err
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker)
  await Promise.all(workers)
  return results
}
