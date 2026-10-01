import { useState, type FormEvent } from 'react'
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

export function LoginLoading() {
  return (
    <div className="min-h-dvh flex items-center justify-center">
      <Spinner label="Verificando la sesión" />
    </div>
  )
}
