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

// Recharts is only needed here, so the charting code stays out of the first load.
const Stats = lazy(() => import('./pages/Stats').then((module) => ({ default: module.Stats })))

export default function App() {
  // `null` means "still asking", which is not the same as "locked out": showing
  // the login form before the answer arrives would flash it on every reload.
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  // Whether the scheduled catch-up already ran this session.
  const [caughtUp, setCaughtUp] = useState(false)

  useEffect(() => {
    // A session can expire while the app is open, from any page. Registering
    // this once means no screen has to handle the 401 itself.
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
      .catch(() => {
        // The API is unreachable or refused the call. Either way there is
        // nothing to show but the door.
        if (alive) setAuthenticated(false)
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    // Register what came due, once, right when the app opens. This is the only
    // moment it can happen: the free tier sleeps the server between uses, so
    // there is no cron to fall back on. It runs before anything renders, or the
    // first screen would show a balance that is one Netflix out of date.
    if (authenticated !== true || caughtUp) return
    let alive = true
    // Recurring rules and installments catch up together, so the app waits once
    // and not twice before the first screen.
    Promise.all([api.recurring.generate(), api.installments.generate()])
      // A failure here must not keep the app shut. Nothing was lost: the rules
      // are still waiting and the next time the app opens it tries again.
      .catch(() => undefined)
      .finally(() => {
        if (alive) setCaughtUp(true)
      })
    return () => {
      alive = false
    }
  }, [authenticated, caughtUp])

  const signedIn = useCallback(() => setAuthenticated(true), [])

  if (authenticated === null) return <LoginLoading />
  if (!authenticated) return <Login onSignedIn={signedIn} />
  if (!caughtUp) return <LoginLoading />

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
