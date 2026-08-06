type EventMap = {
  'download:start': { trackId: string; title: string; artist: string }
  'download:progress': { trackId: string; pct: number; stage: string }
  'download:complete': { trackId: string; filePath?: string | null }
  'download:error': { trackId: string; error: string }
  'metadata:loaded': { url: string; type: 'track' | 'album' | 'playlist' }
  'player:play': { trackId: string }
  'player:pause': {}
  'player:next': {}
  'player:prev': {}
  'sync:start': { subId: string }
  'sync:complete': { subId: string; downloaded: number; failed: number }
  'sync:error': { subId: string; error: string }
}

type EventCallback<E extends keyof EventMap> = (payload: EventMap[E]) => void

class EventBus {
  private listeners = new Map<string, Set<(payload: any) => void>>()

  on<E extends keyof EventMap>(event: E, cb: EventCallback<E>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(cb)
    return () => this.listeners.get(event)?.delete(cb)
  }

  once<E extends keyof EventMap>(event: E, cb: EventCallback<E>): () => void {
    const wrapper = (payload: EventMap[E]) => {
      cb(payload)
      this.listeners.get(event)?.delete(wrapper)
    }
    return this.on(event, wrapper as any)
  }

  emit<E extends keyof EventMap>(event: E, payload: EventMap[E]): void {
    this.listeners.get(event)?.forEach(cb => cb(payload))
  }

  removeAll(event?: keyof EventMap): void {
    if (event) this.listeners.delete(event)
    else this.listeners.clear()
  }

  listenerCount(event: keyof EventMap): number {
    return this.listeners.get(event)?.size ?? 0
  }
}

export const events = new EventBus()
