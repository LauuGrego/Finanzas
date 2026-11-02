import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-gold text-black hover:bg-gold-hover font-bold shadow-sm transition-all duration-150',
  secondary:
    'bg-surface text-ink border border-white/15 hover:bg-white/10 font-semibold transition-all duration-150',
  ghost: 'text-muted hover:text-ink hover:bg-white/5 transition-all duration-150',
  danger: 'bg-expense text-white hover:brightness-110 font-bold shadow-sm transition-all duration-150',
}

const SIZES: Record<Size, string> = {
  sm: 'px-4 py-1.5 text-xs rounded-full',
  md: 'px-5 py-2.5 text-sm rounded-full',
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
  type = 'button',
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 font-medium transition cursor-pointer
                  disabled:cursor-not-allowed disabled:opacity-50
                  ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
