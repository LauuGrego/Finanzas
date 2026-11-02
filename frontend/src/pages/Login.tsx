import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '../components/Button'
import { Spinner } from '../components/States'
import { api } from '../services/api'

/**
 * The door in front of the app.
 *
 * On a free-tier host the URL is public, so this is the only thing between a
 * guessed address and someone's full financial history. The key is never kept
 * in the browser: it goes to the API, which answers with an httpOnly cookie
 * that JavaScript cannot read.
 */
export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || !password) return

    setBusy(true)
    setError(null)
    try {
      await api.session.login(password)
      onSignedIn()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos verificar la clave')
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gold flex items-center justify-center text-black shadow-lg shadow-gold/20 mb-3">
            <svg
              viewBox="0 0 32 32"
              width="26"
              height="26"
              aria-hidden="true"
              focusable="false"
            >
              <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="2.5" opacity="0.4" />
              <circle cx="16" cy="16" r="7" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.8" />
              <circle cx="16" cy="16" r="3.5" fill="currentColor" />
            </svg>
          </div>
          <h1 className="text-xl font-black text-white tracking-tight">Finanzas</h1>
          <p className="text-xs text-neutral-400 mt-0.5">Agenda Financiera Personal</p>
        </div>

        <form onSubmit={submit} className="bg-[#141414] border border-white/5 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-4">
          <div>
            <label htmlFor="clave" className="label">
              Contraseña de acceso
            </label>
            <input
              id="clave"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="input rounded-xl"
              disabled={busy}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p role="alert" className="text-xs text-expense bg-expense/10 border border-expense/20 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full rounded-full py-3 text-sm font-bold mt-2" disabled={busy || !password}>
            {busy ? 'Verificando…' : 'Ingresar'}
          </Button>
        </form>

        <p className="mt-5 text-center text-xs text-neutral-500">
          La sesión se autentica de forma segura con cookie HttpOnly.
        </p>
      </div>
    </div>
  )
}

export function LoginLoading({
  label = 'Verificando la sesión',
  sublabel,
  onRetry,
  onSkip,
  skipLabel = 'Ingresar con clave',
  error,
}: {
  label?: string
  sublabel?: string
  onRetry?: () => void
  onSkip?: () => void
  skipLabel?: string
  error?: string | null
} = {}) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed((prev) => prev + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="min-h-dvh flex items-center justify-center px-5">
      <div className="w-full max-w-sm flex flex-col items-center">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gold flex items-center justify-center text-black shadow-lg shadow-gold/20 mb-3">
            <svg
              viewBox="0 0 32 32"
              width="26"
              height="26"
              aria-hidden="true"
              focusable="false"
            >
              <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="2.5" opacity="0.4" />
              <circle cx="16" cy="16" r="7" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.8" />
              <circle cx="16" cy="16" r="3.5" fill="currentColor" />
            </svg>
          </div>
          <h1 className="text-xl font-black text-white tracking-tight">Finanzas</h1>
          <p className="text-xs text-neutral-400 mt-0.5">Agenda Financiera</p>
        </div>

        {error ? (
          <div className="bg-[#141414] border border-white/5 rounded-3xl p-6 w-full text-center space-y-4 shadow-2xl">
            <p className="text-expense text-sm font-semibold">{error}</p>
            <p className="text-neutral-400 text-xs">
              No pudimos conectar con el servidor. Si el servicio estaba inactivo,
              puede haber demorado en despertar o haber un problema de red temporal.
            </p>
            <div className="pt-2 flex flex-col gap-2">
              {onRetry && (
                <Button type="button" variant="secondary" className="w-full rounded-full" onClick={onRetry}>
                  Reintentar conexión
                </Button>
              )}
              {onSkip && (
                <Button type="button" variant="primary" className="w-full rounded-full" onClick={onSkip}>
                  {skipLabel}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center w-full">
            <Spinner label={label} />
            {sublabel && <p className="text-xs text-neutral-400 text-center mt-1">{sublabel}</p>}

            {elapsed >= 5 && (
              <div className="mt-4 p-4 rounded-2xl border border-white/5 bg-[#141414] text-xs text-neutral-400 text-center max-w-xs space-y-2">
                <p className="text-white font-semibold">Conectando con el servidor…</p>
                <p>
                  En el plan gratuito el servidor se suspende tras inactividad y tarda
                  unos instantes en despertar.
                </p>
                <p className="text-gold font-mono text-[11px] font-bold">
                  {elapsed}s transcurridos
                </p>
              </div>
            )}

            {elapsed >= 15 && (
              <div className="mt-4 flex flex-col items-center gap-2">
                {onRetry && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="text-xs text-gold hover:underline font-bold cursor-pointer"
                  >
                    Reintentar conexión
                  </button>
                )}
                {onSkip && (
                  <button
                    type="button"
                    onClick={onSkip}
                    className="text-xs text-neutral-400 hover:text-white transition cursor-pointer"
                  >
                    {skipLabel}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
