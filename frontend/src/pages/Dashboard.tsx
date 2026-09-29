import { useState } from 'react'
import { Card } from '../components/Card'
import { EmptyState, StateWrapper } from '../components/States'
import { TransactionItem } from '../components/TransactionItem'
import { TransactionModal, TransferModal } from '../components/TransactionModal'
import { useAsync } from '../hooks/useAsync'
import { api } from '../services/api'
import type { Transaction } from '../types'
import {
  currentPeriod,
  formatDate,
  monthLabel,
  money,
  shiftPeriod,
  todayIso,
} from '../utils/format'

const PALETTE = [
  '#4f46e5',
  '#0891b2',
  '#059669',
  '#d97706',
  '#dc2626',
  '#7c3aed',
  '#db2777',
  '#65a30d',
]

export function Dashboard() {
  const [period, setPeriod] = useState(currentPeriod())
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)

  const dashboard = useAsync(() => api.dashboard.get(period), [period])
  const accounts = useAsync(() => api.accounts.list(), [])
  const categories = useAsync(() => api.categories.list(), [])

  const data = dashboard.data
  const today = todayIso()

  function reloadAll() {
    void dashboard.reload()
    void accounts.reload()
    void categories.reload()
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-sm font-medium uppercase tracking-wide text-muted">
          {monthLabel(period)}
        </h1>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPeriod(shiftPeriod(period, -1))}
            aria-label="Mes anterior"
            className="w-8 h-8 rounded-lg hover:bg-canvas transition"
          >
            ‹
          </button>
          <button
            onClick={() => setPeriod(currentPeriod())}
            className="text-xs text-muted hover:text-ink px-2 py-1 rounded-lg hover:bg-canvas transition"
          >
            Hoy
          </button>
          <button
            onClick={() => setPeriod(shiftPeriod(period, 1))}
            aria-label="Mes siguiente"
            className="w-8 h-8 rounded-lg hover:bg-canvas transition"
          >
            ›
          </button>
        </div>
      </header>

      <StateWrapper
        loading={dashboard.loading}
        error={dashboard.error}
        onRetry={() => void dashboard.reload()}
      >
        {data && (
          <>
            <section className="card bg-ink text-white border-ink">
              <p className="text-white/60 text-sm">Dinero disponible</p>
              <p className="text-3xl font-bold mt-1 tabular-nums">
                {money(data.available_balance)}
              </p>

              <dl className="grid grid-cols-3 gap-3 mt-6 pt-5 border-t border-white/10">
                <div>
                  <dt className="text-white/60 text-xs">Ingresos</dt>
                  <dd className="font-semibold tabular-nums text-income">
                    {money(data.month_summary.income)}
                  </dd>
                </div>
                <div>
                  <dt className="text-white/60 text-xs">Gastos</dt>
                  <dd className="font-semibold tabular-nums text-expense">
                    {money(data.month_summary.expense)}
                  </dd>
                </div>
                <div>
                  <dt className="text-white/60 text-xs">Balance</dt>
                  <dd className="font-semibold tabular-nums">
                    {data.month_summary.balance >= 0 ? '+' : '−'}
                    {money(Math.abs(data.month_summary.balance))}
                  </dd>
                </div>
              </dl>
            </section>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => setShowNew(true)}
                className="card text-left hover:border-brand transition flex items-center gap-3"
              >
                <span aria-hidden="true" className="text-2xl">💸</span>
                <span>
                  <span className="block font-semibold">Registrar gasto</span>
                  <span className="text-sm text-muted">En dos segundos</span>
                </span>
              </button>
              <button
                onClick={() => setShowTransfer(true)}
                className="card text-left hover:border-brand transition flex items-center gap-3"
              >
                <span aria-hidden="true" className="text-2xl">↔️</span>
                <span>
                  <span className="block font-semibold">Transferir dinero</span>
                  <span className="text-sm text-muted">Entre tus cuentas</span>
                </span>
              </button>
            </div>

            {data.expenses_by_category.length > 0 && (
              <Card title="Distribución de gastos">
                <ul className="space-y-3">
                  {data.expenses_by_category.map((item, index) => (
                    <li key={item.category_id ?? item.category_name}>
                      <div className="flex items-center justify-between text-sm mb-1.5">
                        <span>
                          <span aria-hidden="true">{item.icon}</span> {item.category_name}
                        </span>
                        <span className="font-medium tabular-nums">{money(item.total)}</span>
                      </div>
                      <div className="h-2 bg-canvas rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${item.percentage}%`,
                            backgroundColor: PALETTE[index % PALETTE.length],
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <Card
              title="Últimos movimientos"
              action={
                data.recent_transactions.length > 0 ? (
                  <a href="/movimientos" className="text-sm text-brand hover:underline">
                    Ver todos
                  </a>
                ) : null
              }
            >
              {data.recent_transactions.length === 0 ? (
                <EmptyState
                  title="Todavía no hay movimientos"
                  hint="Registrá tu primer gasto para empezar"
                />
              ) : (
                <ul className="divide-y divide-line">
                  {data.recent_transactions.map((transaction) => (
                    <li key={transaction.id}>
                      <TransactionItem
                        transaction={transaction}
                        showDate={transaction.date === today}
                        onEdit={setEditing}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Próximos compromisos">
              {data.upcoming.length === 0 ? (
                <EmptyState
                  title="Nada programado"
                  hint="Van a aparecer acá los gastos recurrentes y las cuotas."
                />
              ) : (
                <ul className="divide-y divide-line">
                  {data.upcoming.map((item, index) => (
                    <li
                      key={`${item.date}-${index}`}
                      className="flex items-center justify-between py-3"
                    >
                      <span className="text-sm">
                        <span className="text-muted">{formatDate(item.date)}</span>{' '}
                        {item.description}
                      </span>
                      <span className="font-medium tabular-nums">{money(item.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </StateWrapper>

      <TransactionModal
        open={showNew || editing !== null}
        accounts={accounts.data?.accounts ?? []}
        categories={categories.data ?? []}
        transaction={editing}
        onClose={() => {
          setShowNew(false)
          setEditing(null)
        }}
        onSaved={reloadAll}
      />

      <TransferModal
        open={showTransfer}
        accounts={accounts.data?.accounts ?? []}
        onClose={() => setShowTransfer(false)}
        onSaved={reloadAll}
      />
    </div>
  )
}
