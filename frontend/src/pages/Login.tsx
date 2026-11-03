import { useEffect, useState, type FormEvent } from 'react'
import { Icon } from '../components/Icon'
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
    <div className="min-h-dvh flex items-center justify-center px-5 bg-[#10100F] text-white">
      <div className="w-full max-w-sm">
        {/* Brand Emblem */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative mb-3">
            <div className="w-14 h-14 rounded-3xl bg-gold flex items-center justify-center text-black shadow-xl shadow-gold/25 ring-4 ring-gold/20">
              <svg
                viewBox="0 0 32 32"
                width="28"
                height="28"
                aria-hidden="true"
                focusable="false"
              >
                <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="2.5" opacity="0.4" />
                <circle cx="16" cy="16" r="7" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.8" />
                <circle cx="16" cy="16" r="3.5" fill="currentColor" />
              </svg>
            </div>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Finanzas</h1>
          <p className="text-xs text-neutral-400 mt-1">Agenda Financiera Personal</p>
        </div>

        {/* Login Form */}
        <form
          onSubmit={submit}
          className="bg-[#141414] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-4"
        >
          <div>
            <label htmlFor="clave" className="text-xs font-bold uppercase tracking-wider text-neutral-400 block mb-2">
              Contraseña de acceso
            </label>
            <input
              id="clave"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full bg-[#18181b] border border-white/10 focus:border-gold focus:ring-2 focus:ring-gold/20 text-white rounded-2xl px-4 py-3.5 text-sm transition-all outline-none placeholder:text-neutral-600 font-medium"
              disabled={busy}
              placeholder="••••••••••••"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="text-xs text-expense font-semibold bg-expense/10 border border-expense/20 rounded-2xl p-3 px-4 text-center"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !password}
            className="w-full bg-gold hover:bg-gold-light disabled:opacity-40 text-black font-extrabold py-3.5 rounded-full text-sm shadow-lg shadow-gold/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed mt-2"
          >
            {busy ? 'Verificando acceso…' : 'Ingresar a Finanzas'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-neutral-500 flex items-center justify-center gap-1.5">
          <Icon name="check" size={13} className="text-gold" />
          <span>Sesión autenticada con cookie segura</span>
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
    <div className="min-h-dvh flex items-center justify-center px-5 bg-[#10100F] text-white">
      <div className="w-full max-w-sm flex flex-col items-center">
        {/* Pulsing Brand Emblem */}
        <div className="relative mb-5">
          <div className="absolute inset-0 rounded-3xl bg-gold/20 blur-xl animate-pulse" />
          <div className="relative w-16 h-16 rounded-3xl bg-gold flex items-center justify-center text-black shadow-2xl shadow-gold/30 ring-4 ring-gold/20">
            <svg
              viewBox="0 0 32 32"
              width="30"
              height="30"
              aria-hidden="true"
              focusable="false"
            >
              <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="2.5" opacity="0.4" />
              <circle cx="16" cy="16" r="7" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.8" />
              <circle cx="16" cy="16" r="3.5" fill="currentColor" />
            </svg>
          </div>
        </div>

        <h1 className="text-2xl font-black text-white tracking-tight">Finanzas</h1>
        <p className="text-xs text-neutral-400 mt-1 mb-6">Agenda Financiera Personal</p>

        {error ? (
          <div className="bg-[#141414] border border-white/10 rounded-3xl p-6 sm:p-7 w-full text-center space-y-4 shadow-2xl">
            <p className="text-expense text-sm font-semibold">{error}</p>
            <p className="text-neutral-400 text-xs leading-relaxed">
              No pudimos conectar con el servidor. Si el servicio estaba inactivo,
              puede haber demorado en despertar o haber un problema de red temporal.
            </p>
            <div className="pt-2 flex flex-col gap-2.5">
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="w-full bg-white/10 hover:bg-white/15 text-white font-semibold py-3 rounded-full text-xs transition cursor-pointer"
                >
                  Reintentar conexión
                </button>
              )}
              {onSkip && (
                <button
                  type="button"
                  onClick={onSkip}
                  className="w-full bg-gold hover:bg-gold-light text-black font-bold py-3 rounded-full text-xs shadow-md shadow-gold/20 transition cursor-pointer"
                >
                  {skipLabel}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center w-full">
            {/* Smooth Status Pill */}
            <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-xs font-semibold text-white shadow-sm">
              <span
                aria-hidden="true"
                className="w-3.5 h-3.5 rounded-full border-2 border-white/20 border-t-gold animate-spin"
              />
              <span>{label}</span>
            </div>

            {sublabel && (
              <p className="text-xs text-neutral-400 text-center mt-3 max-w-xs leading-relaxed">
                {sublabel}
              </p>
            )}

            {/* Cloud Spin-up Explanation */}
            {elapsed >= 4 && (
              <div className="mt-6 p-4 rounded-3xl border border-white/10 bg-[#141414] text-xs text-neutral-400 text-center max-w-xs space-y-2 shadow-xl animate-fade-in">
                <p className="text-white font-semibold flex items-center justify-center gap-1.5">
                  <Icon name="clock" size={14} className="text-gold" />
                  <span>Conectando con el servidor</span>
                </p>
                <p className="leading-relaxed">
                  En el plan gratuito el servidor se suspende tras inactividad y tarda
                  unos instantes en despertar.
                </p>
                <p className="text-gold font-mono text-[11px] font-bold">
                  {elapsed}s transcurridos
                </p>
              </div>
            )}

            {elapsed >= 12 && (
              <div className="mt-5 flex flex-col items-center gap-2.5">
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
