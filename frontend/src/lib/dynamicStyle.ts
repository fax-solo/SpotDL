import { type RefCallback } from 'react'

export function dynamicStyle(styles: Record<string, string | number>): RefCallback<HTMLElement> {
  return (el) => {
    if (!el) return
    for (const [prop, value] of Object.entries(styles)) {
      (el.style as any)[prop] = String(value)
    }
  }
}
