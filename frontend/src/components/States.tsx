import type { ReactNode } from 'react'

export function Spinner({ label = 'Cargando' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-muted">
      <span
        aria-hidden="true"
        className="w-5 h-5 rounded-full border-2 border-line border-t-gold animate-spin"
      />
      <span className="text-sm">{label}…</span>
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="py-10 text-center">
      <p className="text-expense font-medium mb-1">No pudimos cargar los datos</p>
      <p className="text-sm text-muted mb-4">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-sm text-gold hover:underline font-medium"
        >
          Reintentar
        </button>
      )}
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="py-10 text-center text-muted">
      <p className="font-medium text-ink">{title}</p>
      {hint && <p className="text-sm mt-1">{hint}</p>}
    </div>
  )
}

export function StateWrapper({
  loading,
  error,
  onRetry,
  children,
}: {
  loading: boolean
  error: string | null
  onRetry: () => void
  children: ReactNode
}) {
  if (loading) return <Spinner />
  if (error) return <ErrorState message={error} onRetry={onRetry} />
  return <>{children}</>
}
