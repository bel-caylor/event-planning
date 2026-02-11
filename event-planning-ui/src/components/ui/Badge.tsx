import * as React from 'react'
import { cn } from '../../lib/cn'

type BadgeVariant = 'default' | 'success' | 'warning'

const badgeStyles: Record<BadgeVariant, string> = {
  default: 'bg-slate-100 text-slate-700',
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-800',
}

export function Badge({
  className,
  variant = 'default',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
        badgeStyles[variant],
        className,
      )}
      {...props}
    />
  )
}
