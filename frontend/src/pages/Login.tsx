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
        <div className="flex flex-col items-center mb-8 text-gold">
          <svg
            viewBox="0 0 32 32"
            width="40"
            height="40"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.45" />
            <circle cx="16" cy="16" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.7" />
            <circle cx="16" cy="16" r="3.5" fill="currentColor" />
          </svg>
          <h1 className="mt-3 text-lg font-semibold text-ink">Agenda Financiera</h1>
        </div>

        <form onSubmit={submit} className="card-hero rounded-2xl p-6">
          <label htmlFor="clave" className="label">
            Clave
          </label>
          <input
            id="clave"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="input"
            disabled={busy}
          />

          {error && (
            <p role="alert" className="mt-3 text-sm text-expense">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full mt-5" disabled={busy || !password}>
            {busy ? 'Verificando…' : 'Entrar'}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-muted">
          La clave no se guarda en este dispositivo.
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
        <div className="flex flex-col items-center mb-6 text-gold">
          <svg
            viewBox="0 0 32 32"
            width="40"
            height="40"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.45" />
            <circle cx="16" cy="16" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.7" />
            <circle cx="16" cy="16" r="3.5" fill="currentColor" />
          </svg>
          <h1 className="mt-3 text-lg font-semibold text-ink">Agenda Financiera</h1>
        </div>

        {error ? (
          <div className="card-hero rounded-2xl p-6 w-full text-center space-y-4">
            <p className="text-expense text-sm font-medium">{error}</p>
            <p className="text-muted text-xs">
              No pudimos conectar con el servidor. Si el servicio en Render estaba inactivo,
              puede haber demorado en despertar o haber un problema de red temporal.
            </p>
            <div className="pt-2 flex flex-col gap-2">
              {onRetry && (
                <Button type="button" variant="secondary" className="w-full" onClick={onRetry}>
                  Reintentar conexión
                </Button>
              )}
              {onSkip && (
                <Button type="button" variant="primary" className="w-full" onClick={onSkip}>
                  {skipLabel}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center w-full">
            <Spinner label={label} />
            {sublabel && <p className="text-xs text-muted text-center mt-1">{sublabel}</p>}

            {elapsed >= 5 && (
              <div className="mt-4 p-4 rounded-xl border border-line bg-card/60 text-xs text-muted text-center max-w-xs space-y-2">
                <p className="text-ink font-medium">Conectando con el servidor…</p>
                <p>
                  En el plan gratuito de Render el servidor se suspende tras inactividad y tarda
                  cerca de 50 segundos en despertar.
                </p>
                <p className="text-gold font-mono text-[11px] font-semibold">
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
                    className="text-xs text-gold hover:underline font-medium cursor-pointer"
                  >
                    Reintentar conexión
                  </button>
                )}
                {onSkip && (
                  <button
                    type="button"
                    onClick={onSkip}
                    className="text-xs text-muted hover:text-ink transition cursor-pointer"
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
