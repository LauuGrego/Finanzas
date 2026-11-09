import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card } from '../components/Card'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Icon } from '../components/Icon'
import { MonthStepper } from '../components/MonthStepper'
import { EmptyState, ErrorState, Skeleton } from '../components/States'
import { TransactionModal } from '../components/TransactionModal'
import { useAsync } from '../hooks/useAsync'
import { api } from '../services/api'
import type { Transaction } from '../types'
import { resolveColor } from '../utils/colors'
import { useFavoriteAccount } from '../utils/favoriteAccount'
import { currentPeriod, money } from '../utils/format'

export function Transactions() {
  const [favoriteId] = useFavoriteAccount()
  const [searchParams, setSearchParams] = useSearchParams()
  const monthParam = searchParams.get('month')
  const [period, setPeriod] = useState(monthParam || currentPeriod())
  const [categoryId, setCategoryId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(50)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [deleting, setDeleting] = useState<Transaction | null>(null)

  useEffect(() => {
    if (monthParam && monthParam !== period) {
      setPeriod(monthParam)
    }
  }, [monthParam, period])

  function handlePeriodChange(next: string) {
    setPeriod(next)
    setSearchParams((prev) => {
      const updated = new URLSearchParams(prev)
      updated.set('month', next)
      return updated
    })
  }

  const categories = useAsync(() => api.categories.list(), [])
  const accounts = useAsync(() => api.accounts.list(), [])
  const dashboard = useAsync(() => api.dashboard.get(period), [period])
  const page = useAsync(
    () =>
      api.transactions.list({
        month: period,
        category_id: categoryId ? Number(categoryId) : undefined,
        account_id: accountId ? Number(accountId) : undefined,
        search: search || undefined,
        limit,
      }),
    [period, categoryId, accountId, search, limit],
  )

  const isMetricsLoading = dashboard.loading || !dashboard.data || page.loading || !page.data

  const items = page.data?.items ?? []
  const totalCount = page.data?.total ?? items.length

  const hasCustomFilter = Boolean(categoryId || accountId || search)

  const totalIncome = !hasCustomFilter && dashboard.data?.month_summary
    ? dashboard.data.month_summary.income
    : items
        .filter((t) => t.type === 'INCOME')
        .reduce((sum, t) => sum + t.amount, 0)

  const totalExpense = !hasCustomFilter && dashboard.data?.month_summary
    ? dashboard.data.month_summary.expense
    : items
        .filter((t) => t.type === 'EXPENSE')
        .reduce((sum, t) => sum + t.amount, 0)

  const netBalance = totalIncome - totalExpense

  const byDay = new Map<string, Transaction[]>()
  for (const transaction of items) {
    const key = transaction.date
    byDay.set(key, [...(byDay.get(key) ?? []), transaction])
  }

  async function handleDelete() {
    if (!deleting) return
    await api.transactions.remove(deleting.id)
    void page.reload()
    void dashboard.reload()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
          Movimientos
        </h1>
        <MonthStepper period={period} onChange={handlePeriodChange} />
      </header>

      {/* 3 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
        {/* Ingresos */}
        <div className="bg-[#141414] border border-white/5 rounded-3xl p-5 sm:p-6 shadow-sm">
          <span className="text-xs sm:text-sm font-semibold text-zinc-400 block mb-1">
            Ingresos
          </span>
          {isMetricsLoading ? (
            <Skeleton className="h-8 w-28 rounded-xl my-1" />
          ) : (
            <span className="text-2xl sm:text-3xl font-black text-income tabular-nums tracking-tight block">
              +{money(totalIncome)}
            </span>
          )}
        </div>

        {/* Gastos */}
        <div className="bg-[#141414] border border-white/5 rounded-3xl p-5 sm:p-6 shadow-sm">
          <span className="text-xs sm:text-sm font-semibold text-zinc-400 block mb-1">
            Gastos
          </span>
          {isMetricsLoading ? (
            <Skeleton className="h-8 w-28 rounded-xl my-1" />
          ) : (
            <span className="text-2xl sm:text-3xl font-black text-expense tabular-nums tracking-tight block">
              −{money(totalExpense)}
            </span>
          )}
        </div>

        {/* Balance (Hero Yellow Card) */}
        <div className="bg-gold text-black rounded-3xl p-5 sm:p-6 shadow-md flex flex-col justify-between">
          <div>
            <span className="text-xs sm:text-sm font-bold text-black/80 block mb-1">
              {categoryId || accountId || search ? 'Balance filtrado' : 'Balance'}
            </span>
            {isMetricsLoading ? (
              <Skeleton variant="gold" className="h-8 w-36 rounded-xl my-1" />
            ) : (
              <span className="text-2xl sm:text-3xl font-black text-black tabular-nums tracking-tight block">
                {netBalance < 0 ? '−' : ''}$ {money(Math.abs(netBalance)).replace('$', '').trim()}
              </span>
            )}
          </div>
          {!categoryId && !accountId && !search && dashboard.data && dashboard.data.previous_balance !== 0 && (
            <span className="text-[11px] font-bold text-black/75 mt-2 tabular-nums">
              Viene del mes anterior: {dashboard.data.previous_balance >= 0 ? '+' : '−'}{money(Math.abs(dashboard.data.previous_balance))}
            </span>
          )}
        </div>
      </div>

      {/* Filter Row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="relative">
          <input
            type="search"
            placeholder="Buscar por descripción"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Buscar movimientos"
            className="w-full bg-[#141414] border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-colors"
          />
        </div>
        <select
          value={accountId}
          onChange={(event) => setAccountId(event.target.value)}
          aria-label="Filtrar por cuenta"
          className="w-full bg-[#141414] border border-white/10 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-colors cursor-pointer"
        >
          <option value="">Todas las cuentas</option>
          {(accounts.data?.accounts ?? []).map((account) => (
            <option key={account.id} value={account.id} className="bg-zinc-900 text-white">
              {account.name}
              {account.id === favoriteId ? ' (Principal)' : ''}
            </option>
          ))}
        </select>
        <select
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          aria-label="Filtrar por categoría"
          className="w-full bg-[#141414] border border-white/10 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-colors cursor-pointer sm:col-span-2 lg:col-span-1"
        >
          <option value="">Todas las categorías</option>
          {(categories.data ?? []).map((category) => (
            <option key={category.id} value={category.id} className="bg-zinc-900 text-white">
              {category.name}
            </option>
          ))}
        </select>
      </div>

      {/* Table / List View */}
      {page.loading || !page.data ? (
        <Card className="p-4 sm:p-6 overflow-hidden">
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((n) => (
              <div key={n} className="flex items-center justify-between py-3 border-b border-white/5">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-36 rounded" />
                  <Skeleton className="h-3 w-24 rounded" />
                </div>
                <Skeleton className="h-4 w-20 rounded" />
              </div>
            ))}
          </div>
        </Card>
      ) : page.error ? (
        <ErrorState message={page.error} onRetry={() => void page.reload()} />
      ) : items.length === 0 ? (
        <EmptyState
          title="Sin movimientos"
          hint="Probá cambiando el mes o los filtros de búsqueda"
        />
      ) : (
        <Card className="p-4 sm:p-6 overflow-hidden">
            {/* Table Header Columns (Desktop) */}
            <div className="hidden sm:grid sm:grid-cols-12 gap-4 pb-3 border-b border-white/5 text-xs font-semibold text-zinc-400">
              <span className="col-span-4">Concepto</span>
              <span className="col-span-3">Categoría</span>
              <span className="col-span-2">Cuenta</span>
              <span className="col-span-3 text-right">Importe</span>
            </div>

            <div className="space-y-6 mt-2">
              {Array.from(byDay.entries()).map(([day, transactions]) => {
                const dayIncome = transactions
                  .filter((t) => t.type === 'INCOME')
                  .reduce((sum, t) => sum + t.amount, 0)
                const dayExpense = transactions
                  .filter((t) => t.type === 'EXPENSE')
                  .reduce((sum, t) => sum + t.amount, 0)
                const dayBalance = dayIncome - dayExpense

                const dateObj = new Date(`${day}T12:00:00`)
                const dayFormatted = dateObj.toLocaleDateString('es-AR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })
                const capitalizedDay =
                  dayFormatted.charAt(0).toUpperCase() + dayFormatted.slice(1)

                return (
                  <div key={day} className="space-y-1">
                    {/* Date Section Header */}
                    <div className="flex items-center justify-between py-2 border-b border-white/5">
                      <span className="text-sm font-bold text-white tracking-tight">
                        {capitalizedDay}
                      </span>
                      <span
                        className={`text-xs sm:text-sm font-bold tabular-nums ${
                          dayBalance >= 0 ? 'text-income' : 'text-expense'
                        }`}
                      >
                        {dayBalance >= 0 ? '+' : '−'}{money(Math.abs(dayBalance))}
                      </span>
                    </div>

                    {/* Movement Items */}
                    <ul className="divide-y divide-white/5">
                      {transactions.map((t, idx) => {
                        const isIncome = t.type === 'INCOME'
                        const isTransfer = t.transfer_id !== null
                        const catColor = resolveColor(
                          t.category?.color,
                          t.category_id ?? idx
                        )

                        return (
                          <li
                            key={t.id}
                            className="py-3 sm:py-3.5 flex flex-col sm:grid sm:grid-cols-12 sm:items-center gap-2 sm:gap-4 group hover:bg-white/[0.02] -mx-2 px-2 rounded-xl transition-colors"
                          >
                            {/* Concepto */}
                            <div className="sm:col-span-4 flex items-center justify-between sm:justify-start gap-2 min-w-0">
                              <span className="font-semibold text-white text-sm sm:text-base truncate">
                                {t.description ||
                                  t.category?.name ||
                                  (isTransfer ? 'Transferencia' : 'Movimiento')}
                              </span>
                              {/* Mobile Amount shown inline */}
                              <span
                                className={`sm:hidden font-bold tabular-nums text-sm whitespace-nowrap ${
                                  isIncome ? 'text-income' : 'text-expense'
                                }`}
                              >
                                {isIncome ? '+' : '−'}{money(Math.abs(t.amount))}
                              </span>
                            </div>

                            {/* Categoría */}
                            <div className="sm:col-span-3 flex items-center gap-2 text-xs sm:text-sm text-zinc-300">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: catColor }}
                              />
                              <span className="truncate">
                                {t.category?.name ?? 'Sin categoría'}
                              </span>
                            </div>

                            {/* Cuenta */}
                            <div className="sm:col-span-2 text-xs sm:text-sm text-zinc-400 truncate">
                              {t.account_name ?? 'Cuenta'}
                            </div>

                            {/* Importe & Actions (Desktop) */}
                            <div className="sm:col-span-3 flex items-center justify-end gap-3">
                              <span
                                className={`hidden sm:inline-block font-bold tabular-nums text-sm sm:text-base whitespace-nowrap ${
                                  isIncome ? 'text-income' : 'text-expense'
                                }`}
                              >
                                {isIncome ? '+' : '−'}{money(Math.abs(t.amount))}
                              </span>

                              <div className="flex items-center gap-1">
                                {!isTransfer && (
                                  <button
                                    type="button"
                                    onClick={() => setEditing(t)}
                                    aria-label={`Editar ${t.description ?? 'movimiento'}`}
                                    className="text-zinc-500 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                                  >
                                    <Icon name="pencil" size={15} />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setDeleting(t)}
                                  aria-label={`Eliminar ${t.description ?? 'movimiento'}`}
                                  className="text-zinc-500 hover:text-red-400 p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                                >
                                  <Icon name="trash" size={15} />
                                </button>
                              </div>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })}
            </div>

            {totalCount > items.length && (
              <div className="pt-4 mt-2 text-center border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setLimit((prev) => prev + 50)}
                  className="bg-[#18181b] hover:bg-[#222226] border border-white/10 text-white font-semibold rounded-full px-5 py-2.5 text-xs sm:text-sm transition cursor-pointer"
                >
                  Cargar más movimientos ({items.length} de {totalCount})
                </button>
              </div>
            )}
          </Card>
        )}

      <TransactionModal
        open={editing !== null}
        accounts={accounts.data?.accounts ?? []}
        categories={categories.data ?? []}
        transaction={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          void page.reload()
          void dashboard.reload()
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Eliminar movimiento"
        message={
          deleting
            ? deleting.transfer_id
              ? `¿Deshacer la transferencia de ${money(deleting.amount)}? Se borran los dos movimientos.`
              : `¿Eliminar "${deleting.description ?? deleting.category?.name ?? 'movimiento'}" por ${money(deleting.amount)}? Esta acción no se puede deshacer.`
            : ''
        }
        onConfirm={handleDelete}
        onClose={() => setDeleting(null)}
      />
    </div>
  )
}
