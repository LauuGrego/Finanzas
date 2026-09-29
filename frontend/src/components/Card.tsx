import type { ReactNode } from 'react'

export function Card({
  title,
  action,
  children,
  className = '',
}: {
  title?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    // `p-5` is the default but a caller passing className owns the padding:
    // two competing `p-*` utilities would resolve by stylesheet order, not by
    // the order they appear here.
    <section className={`card ${className || 'p-5'}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 mb-4">
          {title && <h2 className="font-semibold text-ink">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  )
}
