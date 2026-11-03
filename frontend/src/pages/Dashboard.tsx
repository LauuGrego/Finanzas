import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../components/Card'
import { MonthStepper } from '../components/MonthStepper'
import { EmptyState, ErrorState, Skeleton } from '../components/States'
import { TransactionItem } from '../components/TransactionItem'
import { TransactionModal } from '../components/TransactionModal'
import { useAsync } from '../hooks/useAsync'
import { api } from '../services/api'
import type { Transaction } from '../types'
import { resolveColor } from '../utils/colors'
import {
  currentPeriod,
  formatDate,
  monthLabel,
  money,
} from '../utils/format'

export function Dashboard() {
  const [period, setPeriod] = useState(currentPeriod())
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [showNew, setShowNew] = useState(false)

  const dashboard = useAsync(() => api.dashboard.get(period), [period])
  const accounts = useAsync(() => api.accounts.list(), [])
  const categories = useAsync(() => api.categories.list(), [])
  const budgets = useAsync(() => api.budgets.list(period), [period])
  const goals = useAsync(() => api.goals.list(), [])

  const data = dashboard.data
  const isLoading = dashboard.loading || !data
  const isBudgetsLoading = budgets.loading || !budgets.data
  const isGoalsLoading = goals.loading || !goals.data

  function reloadAll() {
    void dashboard.reload()
    void accounts.reload()
    void categories.reload()
    void budgets.reload()
    void goals.reload()
  }

  // Budget calculations
  const budgetItems = budgets.data?.items ?? []
  const totalBudgeted = budgetItems.reduce((acc, b) => acc + b.amount, 0)
  const totalSpentInBudget = budgetItems.reduce((acc, b) => acc + b.spent, 0)
  const budgetRemaining = Math.max(0, totalBudgeted - totalSpentInBudget)
  const budgetPercentage =
    totalBudgeted > 0 ? Math.min(100, Math.round((totalSpentInBudget / totalBudgeted) * 100)) : 0

  // Featured goal calculation
  const activeGoals = (goals.data?.items ?? []).filter((g) => g.active)
  const featuredGoal = activeGoals[0]

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
          {monthLabel(period)}
        </h1>

        <div className="flex flex-wrap items-center gap-2.5">
          <MonthStepper period={period} onChange={setPeriod} />
        </div>
      </header>

      {dashboard.error ? (
        <ErrorState message={dashboard.error} onRetry={() => void dashboard.reload()} />
      ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column (2 Cols) */}
            <div className="lg:col-span-2 space-y-6">
              {/* Hero Balance Card */}
              <section className="bg-gold text-black rounded-3xl p-6 sm:p-7 shadow-lg relative overflow-hidden">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-xs sm:text-sm font-bold text-black/80 uppercase tracking-wider">
                    {period === currentPeriod() ? 'Saldo acumulado actual' : 'Saldo acumulado'}
                  </p>
                  {isLoading ? (
                    <Skeleton variant="gold" className="h-5 w-24 rounded-full" />
                  ) : data?.previous_balance !== undefined ? (
                    <span className="text-[11px] font-bold text-black/80 bg-black/10 px-3 py-1 rounded-full tabular-nums">
                      Arrancó en ${money(data.previous_balance).replace('$', '').trim()}
                    </span>
                  ) : null}
                </div>

                {isLoading ? (
                  <div className="my-2">
                    <Skeleton variant="gold" className="h-12 sm:h-14 w-52 sm:w-64 rounded-2xl" />
                  </div>
                ) : (
                  <p className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-black my-2 tabular-nums">
                    {data.accumulated_balance < 0 ? '−' : ''}$ {money(Math.abs(data.accumulated_balance)).replace('$', '').trim()}
                  </p>
                )}

                {isLoading ? (
                  <div className="mb-5">
                    <Skeleton variant="gold" className="h-4 w-48 rounded" />
                  </div>
                ) : (
                  <p className="text-xs font-bold text-black/75 mb-5 tabular-nums">
                    {data.month_summary.balance === 0
                      ? 'Sin movimientos registrados en este mes'
                      : `Resultado neto del mes: ${data.month_summary.balance >= 0 ? '+' : '−'}${money(Math.abs(data.month_summary.balance))}`}
                  </p>
                )}

                {/* Floating Black Capsule */}
                <div className="bg-black text-white rounded-2xl p-4 sm:p-5 inline-flex flex-col gap-2.5 min-w-[240px] shadow-md">
                  <div className="flex items-center gap-2.5 text-xs sm:text-sm">
                    <span className="w-2.5 h-2.5 rounded-full bg-income shrink-0" />
                    <span className="text-zinc-400 font-medium">Ingresos del mes</span>
                    {isLoading ? (
                      <Skeleton variant="capsule" className="h-4 w-16 ml-auto rounded" />
                    ) : (
                      <span className="font-bold text-income ml-auto tabular-nums">
                        +{money(data.month_summary.income)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2.5 text-xs sm:text-sm">
                    <span className="w-2.5 h-2.5 rounded-full bg-expense shrink-0" />
                    <span className="text-zinc-400 font-medium">Gastos del mes</span>
                    {isLoading ? (
                      <Skeleton variant="capsule" className="h-4 w-16 ml-auto rounded" />
                    ) : (
                      <span className="font-bold text-expense ml-auto tabular-nums">
                        −{money(data.month_summary.expense)}
                      </span>
                    )}
                  </div>
                  {isLoading ? (
                    <div className="flex items-center gap-2.5 text-[11px] pt-2 border-t border-white/10 text-zinc-400">
                      <span>Viene del mes anterior:</span>
                      <Skeleton variant="capsule" className="h-3.5 w-14 ml-auto rounded" />
                    </div>
                  ) : data?.previous_balance !== undefined ? (
                    <div className="flex items-center gap-2.5 text-[11px] pt-2 border-t border-white/10 text-zinc-400">
                      <span>Viene del mes anterior:</span>
                      <span className="ml-auto font-semibold text-zinc-300 tabular-nums">
                        {money(data.previous_balance)}
                      </span>
                    </div>
                  ) : null}
                </div>
              </section>

              {/* Movimientos del período */}
              <Card
                title={period === currentPeriod() ? 'Últimos movimientos' : `Movimientos de ${monthLabel(period)}`}
                action={
                  !isLoading && data && data.recent_transactions.length > 0 ? (
                    <Link
                      to={`/movimientos?month=${period}`}
                      className="text-xs sm:text-sm font-bold text-gold hover:underline"
                    >
                      Ver todos
                    </Link>
                  ) : null
                }
              >
                {isLoading ? (
                  <ul className="divide-y divide-white/5">
                    {[1, 2, 3].map((n) => (
                      <li key={n} className="flex items-center gap-3.5 py-3.5">
                        <Skeleton className="w-9 h-9 rounded-full shrink-0" />
                        <div className="flex-1 space-y-1.5 min-w-0">
                          <Skeleton className="h-4 w-36 rounded" />
                          <Skeleton className="h-3 w-20 rounded" />
                        </div>
                        <Skeleton className="h-4 w-16 rounded ml-auto" />
                      </li>
                    ))}
                  </ul>
                ) : data.recent_transactions.length === 0 ? (
                  <EmptyState
                    title="Todavía no hay movimientos"
                    hint={period === currentPeriod() ? 'Registrá tu primer gasto para empezar' : `No hay movimientos registrados en ${monthLabel(period)}`}
                  />
                ) : (
                  <ul className="divide-y divide-white/5">
                    {data.recent_transactions.map((transaction) => (
                      <li key={transaction.id}>
                        <TransactionItem
                          transaction={transaction}
                          showDate={true}
                          onEdit={setEditing}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {/* Distribución de gastos */}
              {isLoading ? (
                <Card title="Distribución de gastos">
                  <div className="space-y-3.5">
                    {[1, 2].map((n) => (
                      <div key={n} className="space-y-1.5">
                        <div className="flex justify-between">
                          <Skeleton className="h-4 w-28 rounded" />
                          <Skeleton className="h-4 w-16 rounded" />
                        </div>
                        <Skeleton className="h-2 w-full rounded-full" />
                      </div>
                    ))}
                  </div>
                </Card>
              ) : data && data.expenses_by_category.length > 0 ? (
                <Card title="Distribución de gastos">
                  <ul className="space-y-3.5">
                    {data.expenses_by_category.map((item, index) => {
                      const color = resolveColor(item.color, item.category_id ?? index)
                      return (
                        <li key={item.category_id ?? item.category_name}>
                          <div className="flex items-center justify-between text-sm mb-1.5 gap-3">
                            <span className="flex items-center gap-2 min-w-0">
                              <span
                                aria-hidden="true"
                                className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                                style={{ backgroundColor: color }}
                              />
                              <span className="truncate text-white font-medium">{item.category_name}</span>
                            </span>
                            <span className="font-semibold tabular-nums text-muted shrink-0 text-sm">
                              {money(item.total)}
                            </span>
                          </div>
                          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{
                                width: `${item.percentage}%`,
                                backgroundColor: color,
                              }}
                            />
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </Card>
              ) : null}
            </div>

            {/* Right Column (1 Col) */}
            <div className="space-y-6">
              {/* Próximos compromisos */}
              <Card
                title="Próximos vencimientos"
                action={
                  <Link
                    to="/agenda"
                    className="text-xs sm:text-sm font-bold text-gold hover:underline"
                  >
                    Agenda
                  </Link>
                }
              >
                {isLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((n) => (
                      <div key={n} className="flex items-center justify-between py-2 gap-3">
                        <div className="flex items-center gap-3">
                          <Skeleton className="w-12 h-10 rounded-xl shrink-0" />
                          <div className="space-y-1.5">
                            <Skeleton className="h-4 w-28 rounded" />
                            <Skeleton className="h-3 w-16 rounded" />
                          </div>
                        </div>
                        <Skeleton className="h-4 w-16 rounded" />
                      </div>
                    ))}
                  </div>
                ) : data && data.upcoming.length === 0 ? (
                  <EmptyState
                    title="Nada programado"
                    hint="Cargá un recurrente o cuota y aparecerá acá."
                  />
                ) : (
                  <ul className="divide-y divide-white/5">
                    {data?.upcoming.slice(0, 5).map((item, index) => {
                      const dayNumber = item.date.slice(8, 10)
                      const monthName = new Date(`${item.date}T12:00:00`).toLocaleDateString('es-AR', { month: 'short' })
                      const isIncome = item.type === 'INCOME'

                      return (
                        <li
                          key={`${item.date}-${index}`}
                          className="flex items-center justify-between py-3 gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="bg-[#1c1c1e] text-center px-2 py-1.5 rounded-xl border border-white/5 font-semibold text-xs min-w-[48px] shrink-0">
                              <span className="block text-white font-bold leading-none">{dayNumber}</span>
                              <span className="block text-[10px] text-muted uppercase mt-0.5">{monthName}</span>
                            </div>
                            <div className="min-w-0">
                              <span className="block text-white font-semibold text-sm truncate">
                                {item.description}
                              </span>
                              <span className="block text-xs text-muted truncate mt-0.5">
                                {formatDate(item.date)}
                              </span>
                            </div>
                          </div>

                          <span className={`font-bold tabular-nums text-sm shrink-0 whitespace-nowrap ${
                            isIncome ? 'text-income' : 'text-expense'
                          }`}>
                            {isIncome ? '+' : '−'}{money(Math.abs(item.amount))}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Card>

              {/* Presupuesto Widget */}
              <Card
                title="Presupuesto"
                action={
                  isBudgetsLoading ? (
                    <Skeleton className="h-3.5 w-20 rounded" />
                  ) : (
                    <span className="text-xs text-muted font-medium">
                      {totalBudgeted > 0 ? `Quedan ${money(budgetRemaining)}` : 'Sin configurar'}
                    </span>
                  )
                }
              >
                {isBudgetsLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-2 w-full rounded-full" />
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-3.5 w-24 rounded" />
                      <Skeleton className="h-3.5 w-16 rounded" />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-white rounded-full transition-all duration-300"
                        style={{ width: `${budgetPercentage}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted font-medium tabular-nums">
                      <span>{money(totalSpentInBudget)} de {money(totalBudgeted)}</span>
                      <Link to="/presupuestos" className="text-gold hover:underline">
                        Administrar
                      </Link>
                    </div>
                  </div>
                )}
              </Card>

              {/* Meta Widget */}
              {isGoalsLoading ? (
                <Card title="Metas de ahorro">
                  <div className="space-y-3">
                    <Skeleton className="h-2.5 w-full rounded-full" />
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-3.5 w-24 rounded" />
                      <Skeleton className="h-3.5 w-16 rounded" />
                    </div>
                  </div>
                </Card>
              ) : featuredGoal ? (
                <Card
                  title={`Meta: ${featuredGoal.name}`}
                  action={
                    <span className="text-xs sm:text-sm font-bold text-gold tabular-nums">
                      {featuredGoal.progress}%
                    </span>
                  }
                >
                  <div className="space-y-3">
                    <div className="h-2.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gold rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, featuredGoal.progress)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted font-medium tabular-nums">
                      <span>Faltan {money(featuredGoal.remaining)}</span>
                      <Link to="/metas" className="text-gold hover:underline">
                        Ver metas
                      </Link>
                    </div>
                  </div>
                </Card>
              ) : (
                <Card
                  title="Metas de ahorro"
                  action={
                    <Link to="/metas" className="text-xs text-gold hover:underline">
                      Crear
                    </Link>
                  }
                >
                  <p className="text-xs text-muted">
                    Definí objetivos de ahorro para hacer seguimiento a tus proyectos.
                  </p>
                </Card>
              )}
            </div>
          </div>
        )}

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
    </div>
  )
}
