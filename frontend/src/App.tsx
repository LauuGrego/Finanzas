import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Spinner } from './components/States'
import { AccountDetail } from './pages/AccountDetail'
import { Accounts } from './pages/Accounts'
import { Calendar } from './pages/Calendar'
import { Dashboard } from './pages/Dashboard'
import { Login, LoginLoading } from './pages/Login'
import { Metas } from './pages/Metas'
import { NewMovement } from './pages/NewMovement'
import { Presupuestos } from './pages/Presupuestos'
import { Recurrentes } from './pages/Recurrentes'
import { Settings } from './pages/Settings'
import { Transactions } from './pages/Transactions'
import { api, setUnauthorizedHandler } from './services/api'

const Stats = lazy(() => import('./pages/Stats').then((module) => ({ default: module.Stats })))

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [caughtUp, setCaughtUp] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [checkKey, setCheckKey] = useState(0)

  useEffect(() => {
    setUnauthorizedHandler(() => setAuthenticated(false))
    return () => setUnauthorizedHandler(null)
  }, [])

  useEffect(() => {
    let alive = true
    api.session
      .check()
      .then((session) => {
        if (alive) setAuthenticated(session.authenticated)
      })
      .catch((err: unknown) => {
        if (!alive) return
        const message =
          err instanceof Error ? err.message : 'No pudimos verificar la conexión con el servidor'
        setSessionError(message)
      })
    return () => {
      alive = false
    }
  }, [checkKey])

  useEffect(() => {
    if (authenticated !== true || caughtUp) return
    let alive = true
    const timer = setTimeout(() => {
      if (alive) setCaughtUp(true)
    }, 8_000)

    Promise.all([api.recurring.generate(), api.installments.generate()])
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(timer)
        if (alive) setCaughtUp(true)
      })
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [authenticated, caughtUp])

  const signedIn = useCallback(() => setAuthenticated(true), [])
  const retrySession = useCallback(() => {
    setSessionError(null)
    setCheckKey((k) => k + 1)
  }, [])
  const goToLogin = useCallback(() => {
    setSessionError(null)
    setAuthenticated(false)
  }, [])

  if (authenticated === null) {
    return (
      <LoginLoading
        label="Verificando la sesión"
        onRetry={retrySession}
        onSkip={goToLogin}
        skipLabel="Ingresar con clave"
        error={sessionError}
      />
    )
  }
  if (!authenticated) return <Login onSignedIn={signedIn} />
  if (!caughtUp) {
    return (
      <LoginLoading
        label="Sincronizando movimientos…"
        sublabel="Actualizando movimientos recurrentes y cuotas pendientes"
        onSkip={() => setCaughtUp(true)}
        skipLabel="Continuar a la app"
      />
    )
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/agenda" element={<Calendar />} />
        <Route path="/movimientos" element={<Transactions />} />
        <Route path="/cuentas" element={<Accounts />} />
        <Route path="/cuentas/:id" element={<AccountDetail />} />
        <Route path="/recurrentes" element={<Recurrentes />} />
        <Route path="/presupuestos" element={<Presupuestos />} />
        <Route path="/metas" element={<Metas />} />
        <Route
          path="/estadisticas"
          element={
            <Suspense fallback={<Spinner />}>
              <Stats />
            </Suspense>
          }
        />
        <Route path="/nuevo" element={<NewMovement />} />
        <Route path="/config" element={<Settings />} />
        <Route path="*" element={<Dashboard />} />
      </Routes>
    </Layout>
  )
}
