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
    <section className={`card ${className || 'p-6'}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 mb-4">
          {title && <h2 className="font-bold text-white text-base tracking-tight">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  )
}
