import type { ReactNode } from 'react'

export function Spinner({ label = 'Cargando' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-neutral-400">
      <span
        aria-hidden="true"
        className="w-5 h-5 rounded-full border-2 border-white/10 border-t-gold animate-spin"
      />
      <span className="text-sm font-medium">{label}…</span>
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="py-10 text-center">
      <p className="text-expense font-semibold mb-1">No pudimos cargar los datos</p>
      <p className="text-sm text-neutral-400 mb-4">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-sm text-gold hover:underline font-bold cursor-pointer"
        >
          Reintentar
        </button>
      )}
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="py-12 text-center text-neutral-400">
      <p className="font-bold text-white text-base">{title}</p>
      {hint && <p className="text-sm mt-1 text-neutral-400">{hint}</p>}
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
