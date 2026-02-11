import * as React from 'react'
import { cn } from '../../lib/cn'

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  helpText?: string
  errorText?: string
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, helpText, errorText, id, disabled, ...props }, ref) => {
    const inputId = id || React.useId()
    const describedBy = [
      helpText ? `${inputId}-help` : null,
      errorText ? `${inputId}-error` : null,
    ]
      .filter(Boolean)
      .join(' ') || undefined

    return (
      <div className="space-y-2">
        {label ? (
          <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
            {label}
          </label>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:bg-slate-100 disabled:text-slate-400',
            errorText && 'border-rose-400 focus-visible:ring-rose-500',
            className,
          )}
          aria-invalid={errorText ? 'true' : undefined}
          aria-describedby={describedBy}
          disabled={disabled}
          {...props}
        />
        {helpText ? (
          <p id={`${inputId}-help`} className="text-xs text-slate-500">
            {helpText}
          </p>
        ) : null}
        {errorText ? (
          <p id={`${inputId}-error`} className="text-xs text-rose-600">
            {errorText}
          </p>
        ) : null}
      </div>
    )
  },
)

Input.displayName = 'Input'
