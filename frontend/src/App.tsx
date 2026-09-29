import { Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Spinner } from './components/States'
import { AccountDetail } from './pages/AccountDetail'
import { Accounts } from './pages/Accounts'
import { Calendar } from './pages/Calendar'
import { Dashboard } from './pages/Dashboard'
import { NewMovement } from './pages/NewMovement'
import { Settings } from './pages/Settings'
import { Transactions } from './pages/Transactions'

// Recharts is only needed here, so the charting code stays out of the first load.
const Stats = lazy(() => import('./pages/Stats').then((module) => ({ default: module.Stats })))

export default function App() {
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
