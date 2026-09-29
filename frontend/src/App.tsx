import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AccountDetail } from './pages/AccountDetail'
import { Accounts } from './pages/Accounts'
import { Calendar } from './pages/Calendar'
import { Dashboard } from './pages/Dashboard'
import { NewMovement } from './pages/NewMovement'
import { Settings } from './pages/Settings'
import { Stats } from './pages/Stats'
import { Transactions } from './pages/Transactions'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/agenda" element={<Calendar />} />
        <Route path="/movimientos" element={<Transactions />} />
        <Route path="/cuentas" element={<Accounts />} />
        <Route path="/cuentas/:id" element={<AccountDetail />} />
        <Route path="/estadisticas" element={<Stats />} />
        <Route path="/nuevo" element={<NewMovement />} />
        <Route path="/config" element={<Settings />} />
        <Route path="*" element={<Dashboard />} />
      </Routes>
    </Layout>
  )
}
