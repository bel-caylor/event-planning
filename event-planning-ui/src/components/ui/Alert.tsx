import * as React from 'react'
import { cn } from '../../lib/cn'

type AlertVariant = 'info' | 'success' | 'warning' | 'error'

const alertStyles: Record<AlertVariant, string> = {
  info: 'border-sky-200 bg-sky-50 text-sky-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  error: 'border-rose-200 bg-rose-50 text-rose-900',
}

export function Alert({
  className,
  variant = 'info',
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: AlertVariant }) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-lg border px-4 py-3 text-sm',
        alertStyles[variant],
        className,
      )}
      {...props}
    />
  )
}
