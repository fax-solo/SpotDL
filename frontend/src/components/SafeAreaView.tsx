import { type ReactNode } from 'react'

interface SafeAreaViewProps {
  children: ReactNode
  className?: string
  top?: boolean
  bottom?: boolean
  left?: boolean
  right?: boolean
}

export function SafeAreaView({
  children,
  className = '',
  top = true,
  bottom = true,
  left = true,
  right = true,
}: SafeAreaViewProps) {
  const classes = [
    className,
    top ? 'pt-[var(--sat,env(safe-area-inset-top,0px))]' : '',
    bottom ? 'pb-[var(--sab,env(safe-area-inset-bottom,0px))]' : '',
    left ? 'pl-[var(--sal,env(safe-area-inset-left,0px))]' : '',
    right ? 'pr-[var(--sar,env(safe-area-inset-right,0px))]' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return <div className={classes}>{children}</div>
}
