import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const VARIANTS: Record<Variant, string> = {
  // The brand colour is a light indigo, so the label is dark ink on it rather
  // than white, which would not clear contrast.
  primary: 'bg-brand text-brand-ink hover:brightness-110 disabled:opacity-50',
  secondary: 'bg-raised text-ink border border-line hover:border-brand/50',
  ghost: 'text-muted hover:text-ink hover:bg-raised',
  danger: 'bg-expense text-canvas hover:brightness-110',
}

const SIZES: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-4 py-2.5 rounded-xl',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...rest
}: Props) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 font-medium transition
                  disabled:cursor-not-allowed disabled:opacity-60
                  ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
