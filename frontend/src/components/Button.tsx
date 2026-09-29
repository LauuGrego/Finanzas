import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const VARIANTS: Record<Variant, string> = {
  // Oro con tinta oscura: en blanco no alcanzaba contraste.
  primary: 'bg-gold text-gold-ink hover:brightness-110 disabled:opacity-50',
  secondary: 'bg-raised text-ink border border-line hover:border-gold-dim',
  ghost: 'text-muted hover:text-ink hover:bg-raised',
  danger: 'bg-expense text-gold-ink hover:brightness-110',
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
