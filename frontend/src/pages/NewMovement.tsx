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

/** The "quick add" screen reached from the bottom bar on mobile. */
export function NewMovement() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'expense' | 'income' | 'transfer'>('expense')
  const [open, setOpen] = useState(false)

  const accounts = useAsync(() => api.accounts.list(), [])
  const categories = useAsync(() => api.categories.list(), [])

  function handleSaved() {
    void accounts.reload()
    void categories.reload()
    // Going back to the dashboard is what the user wants after saving.
    navigate('/')
  }

  return (
    <div className="space-y-5">
      <h1 className="text-sm font-medium uppercase tracking-wide text-muted">Nuevo</h1>

      <div className="grid grid-cols-3 gap-2">
        {MODES.map((item) => (
          <button
            key={item.value}
            onClick={() => {
              setMode(item.value)
              setOpen(true)
            }}
            className="card flex flex-col items-center gap-2 py-6 transition hover:border-brand"
          >
            <span
              aria-hidden="true"
              className={`grid place-items-center w-10 h-10 rounded-xl bg-raised ${
                item.value === 'income'
                  ? 'text-income'
                  : item.value === 'expense'
                    ? 'text-expense'
                    : 'text-brand'
              }`}
            >
              <Icon name={item.icon} size={20} />
            </span>
            <span className="text-sm font-medium">{item.label}</span>
          </button>
        ))}
      </div>

      <Card>
        <p className="text-sm text-muted">
          Elegí qué querés registrar. También podés agregar movimientos desde el inicio y desde
          cualquier cuenta.
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
