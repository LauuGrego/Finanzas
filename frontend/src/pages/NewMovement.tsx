import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '../components/Card'
import { Icon, type IconName } from '../components/Icon'
import { TransactionModal, TransferModal } from '../components/TransactionModal'
import { useAsync } from '../hooks/useAsync'
import { api } from '../services/api'

const MODES: { value: 'expense' | 'income' | 'transfer'; icon: IconName; label: string }[] = [
  { value: 'expense', icon: 'expense', label: 'Gasto' },
  { value: 'income', icon: 'income', label: 'Ingreso' },
  { value: 'transfer', icon: 'transfer', label: 'Transferir' },
]

/** The "quick add" screen, reached from the gold button on the mobile bar. */
export function NewMovement() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'expense' | 'income' | 'transfer'>('expense')
  const [open, setOpen] = useState(false)

  const accounts = useAsync(() => api.accounts.list(), [])
  const categories = useAsync(() => api.categories.list(), [])

  function handleSaved() {
    void accounts.reload()
    void categories.reload()
    navigate('/')
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">Nuevo movimiento</h1>
        <p className="text-xs sm:text-sm text-neutral-400 mt-1">Elegí la acción que querés registrar.</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {MODES.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => {
              setMode(item.value)
              setOpen(true)
            }}
            className="bg-[#141414] border border-white/5 rounded-3xl p-6 transition hover:border-white/20 hover:scale-[1.02] active:scale-[0.98] flex flex-col items-center gap-3 cursor-pointer group"
          >
            <span
              aria-hidden="true"
              className={`grid place-items-center w-14 h-14 rounded-2xl transition ${
                item.value === 'income'
                  ? 'bg-income/10 text-income group-hover:bg-income group-hover:text-black'
                  : item.value === 'expense'
                    ? 'bg-expense/10 text-expense group-hover:bg-expense group-hover:text-black'
                    : 'bg-gold/10 text-gold group-hover:bg-gold group-hover:text-black'
              }`}
            >
              <Icon name={item.icon} size={24} />
            </span>
            <span className="text-base font-bold text-white tracking-tight">{item.label}</span>
          </button>
        ))}
      </div>

      <Card className="bg-[#141414] border border-white/5 rounded-3xl p-6">
        <p className="text-sm text-neutral-400">
          Registrá tus gastos cotidianos, acreditaciones o transferencias entre tus distintas cuentas para mantener la agenda al día.
        </p>
      </Card>

      <TransactionModal
        open={open && mode !== 'transfer'}
        accounts={accounts.data?.accounts ?? []}
        categories={categories.data ?? []}
        defaultType={mode === 'income' ? 'INCOME' : 'EXPENSE'}
        onClose={() => setOpen(false)}
        onSaved={handleSaved}
      />

      <TransferModal
        open={open && mode === 'transfer'}
        accounts={accounts.data?.accounts ?? []}
        onClose={() => setOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  )
}
