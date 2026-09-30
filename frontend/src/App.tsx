import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Spinner } from './components/States'
import { AccountDetail } from './pages/AccountDetail'
import { Accounts } from './pages/Accounts'
import { Calendar } from './pages/Calendar'
import { Dashboard } from './pages/Dashboard'
import { Login, LoginLoading } from './pages/Login'
import { NewMovement } from './pages/NewMovement'
import { Settings } from './pages/Settings'
import { Transactions } from './pages/Transactions'
import { api, setUnauthorizedHandler } from './services/api'

// Recharts is only needed here, so the charting code stays out of the first load.
const Stats = lazy(() => import('./pages/Stats').then((module) => ({ default: module.Stats })))

export default function App() {
  // `null` means "still asking", which is not the same as "locked out": showing
  // the login form before the answer arrives would flash it on every reload.
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)

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

  const signedIn = useCallback(() => setAuthenticated(true), [])

  if (authenticated === null) return <LoginLoading />
  if (!authenticated) return <Login onSignedIn={signedIn} />

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/agenda" element={<Calendar />} />
        <Route path="/movimientos" element={<Transactions />} />
        <Route path="/cuentas" element={<Accounts />} />
        <Route path="/cuentas/:id" element={<AccountDetail />} />
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
