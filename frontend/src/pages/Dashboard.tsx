import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../components/Card'
import { Icon } from '../components/Icon'
import { MonthStepper } from '../components/MonthStepper'
import { EmptyState, StateWrapper } from '../components/States'
import { TransactionItem } from '../components/TransactionItem'
import { TransactionModal, TransferModal } from '../components/TransactionModal'
import { useAsync } from '../hooks/useAsync'
import { api } from '../services/api'
import type { Transaction } from '../types'
import { resolveColor } from '../utils/colors'
import {
  currentPeriod,
  formatDate,
  monthLabel,
  money,
  relativeDay,
  todayIso,
} from '../utils/format'

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
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-sm font-medium uppercase tracking-wide text-muted">
          {monthLabel(period)}
        </h1>
        {/* La barra de abajo no tiene Estadísticas, así que la home es la
            puerta de entrada desde el teléfono. El mismo argumento que con
            Recurrentes, y por el mismo motivo: son pantallas que solo se
            necesitan a mano, no todo el rato.
            Va con Link y no con <a href>: un href plano es una navegación de
            página entera, o sea re-descargar y re-arrancar la app en el
            teléfono, cuando alcanza con cambiar de pantalla. */}
        <div className="flex items-center gap-3">
          <Link to="/estadisticas" className="text-sm text-gold hover:underline">
            Estadísticas
          </Link>
          <MonthStepper period={period} onChange={setPeriod} />
        </div>
      </header>

      <StateWrapper
        loading={dashboard.loading}
        error={dashboard.error}
        onRetry={() => void dashboard.reload()}
      >
        {data && (
          <>
            <section className="card-hero rounded-2xl p-5 border">
              <p className="text-muted text-sm">Dinero disponible</p>
              <p className="text-3xl sm:text-4xl font-bold mt-1 tabular-nums tracking-tight">
                {money(data.available_balance)}
              </p>

              <dl className="grid grid-cols-3 gap-2 sm:gap-3 mt-6 pt-5 border-t border-line">
                <div className="min-w-0">
                  <dt className="text-muted text-xs">Ingresos</dt>
                  <dd className="font-semibold tabular-nums text-sm sm:text-base text-income truncate">
                    {money(data.month_summary.income)}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-muted text-xs">Gastos</dt>
                  <dd className="font-semibold tabular-nums text-sm sm:text-base text-expense truncate">
                    {money(data.month_summary.expense)}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-white/60 text-xs">Balance</dt>
                  <dd className="font-semibold tabular-nums text-sm sm:text-base truncate">
                    {data.month_summary.balance >= 0 ? '+' : '−'}
                    {money(Math.abs(data.month_summary.balance))}
                  </dd>
                </div>
              </dl>
            </section>

            <div className="grid gap-3 sm:grid-cols-2">
              <ActionCard
                icon="expense"
                title="Registrar gasto"
                hint="En dos segundos"
                onClick={() => setShowNew(true)}
              />
              <ActionCard
                icon="transfer"
                title="Transferir dinero"
                hint="Entre tus cuentas"
                onClick={() => setShowTransfer(true)}
              />
            </div>

            {data.expenses_by_category.length > 0 && (
              <Card title="Distribución de gastos">
                <ul className="space-y-3">
                  {data.expenses_by_category.map((item, index) => (
                    <li key={item.category_id ?? item.category_name}>
                      <div className="flex items-center justify-between text-sm mb-1.5 gap-3">
                        <span className="flex items-center gap-2 min-w-0">
                          <span
                            aria-hidden="true"
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{
                              backgroundColor: resolveColor(
                                item.color,
                                item.category_id ?? index,
                              ),
                            }}
                          />
                          <span className="truncate">{item.category_name}</span>
                        </span>
                        <span className="font-medium tabular-nums shrink-0">
                          {money(item.total)}
                        </span>
                      </div>
                      <div className="h-1.5 bg-raised rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${item.percentage}%`,
                            backgroundColor: resolveColor(item.color, item.category_id ?? index),
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
                  <Link to="/movimientos" className="text-sm text-gold hover:underline">
                    Ver todos
                  </Link>
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

            <Card
              title="Próximos compromisos"
              // Siempre con enlace, incluso sin nada programado: la barra de
              // abajo en el móvil no tiene esta pantalla, así que la home es la
              // única puerta de entrada desde el teléfono.
              action={
                <Link to="/recurrentes" className="text-sm text-gold hover:underline">
                  Ver todos
                </Link>
              }
            >
              {data.upcoming.length === 0 ? (
                <EmptyState
                  title="Nada programado"
                  hint="Si el alquiler, Netflix o el sueldo se repiten, o si compraste algo en cuotas, cargalo una vez y te van a avisar acá."
                />
              ) : (
                <ul className="divide-y divide-line">
                  {data.upcoming.map((item, index) => (
                    <li
                      key={`${item.date}-${index}`}
                      className="flex items-center justify-between py-3 gap-3"
                    >
                      <span className="text-sm min-w-0 truncate">
                        <span className="text-muted">{formatDate(item.date)}</span>{' '}
                        {item.description}
                        <span className="text-muted"> · {relativeDay(item.date)}</span>
                      </span>
                      <span className="font-medium tabular-nums shrink-0">
                        {money(item.amount)}
                      </span>
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

function ActionCard({
  icon,
  title,
  hint,
  onClick,
}: {
  icon: 'expense' | 'transfer'
  title: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="card p-5 text-left hover:border-gold-dim transition flex items-center gap-3.5"
    >
      <span
        aria-hidden="true"
        className="w-10 h-10 rounded-xl grid place-items-center bg-raised text-gold shrink-0"
      >
        <Icon name={icon} size={20} />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="text-sm text-muted">{hint}</span>
      </span>
    </button>
  )
}
