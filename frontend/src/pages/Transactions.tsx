import { useState } from 'react'
import { Card } from '../components/Card'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { MonthStepper } from '../components/MonthStepper'
import { EmptyState, StateWrapper } from '../components/States'
import { TransactionItem } from '../components/TransactionItem'
import { TransactionModal } from '../components/TransactionModal'
import { useAsync } from '../hooks/useAsync'
import { api } from '../services/api'
import type { Transaction } from '../types'
import { currentPeriod, formatDate, money } from '../utils/format'

export function Transactions() {
  const [period, setPeriod] = useState(currentPeriod())
  const [categoryId, setCategoryId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [deleting, setDeleting] = useState<Transaction | null>(null)

  const categories = useAsync(() => api.categories.list(), [])
  const accounts = useAsync(() => api.accounts.list(), [])
  const page = useAsync(
    () =>
      api.transactions.list({
        month: period,
        category_id: categoryId ? Number(categoryId) : undefined,
        account_id: accountId ? Number(accountId) : undefined,
        search: search || undefined,
        limit: 200,
      }),
    [period, categoryId, accountId, search],
  )

  const items = page.data?.items ?? []

  // Group by day so the list reads like a statement.
  const byDay = new Map<string, Transaction[]>()
  for (const transaction of items) {
    const key = transaction.date
    byDay.set(key, [...(byDay.get(key) ?? []), transaction])
  }

  async function handleDelete() {
    if (!deleting) return
    await api.transactions.remove(deleting.id)
    void page.reload()
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-sm font-medium uppercase tracking-wide text-muted">
          Movimientos
        </h1>
        <MonthStepper period={period} onChange={setPeriod} />
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <input
          type="search"
          placeholder="Buscar por descripción"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Buscar movimientos"
          className="input"
        />
        <select
          value={accountId}
          onChange={(event) => setAccountId(event.target.value)}
          aria-label="Filtrar por cuenta"
          className="input"
        >
          <option value="">Todas las cuentas</option>
          {(accounts.data?.accounts ?? []).map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
        <select
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          aria-label="Filtrar por categoría"
          className="input"
        >
          <option value="">Todas las categorías</option>
          {(categories.data ?? []).map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      <StateWrapper loading={page.loading} error={page.error} onRetry={() => void page.reload()}>
        {items.length === 0 ? (
          <EmptyState title="Sin movimientos" hint="Probá cambiando el mes o los filtros" />
        ) : (
          <div className="space-y-4">
            {Array.from(byDay.entries()).map(([day, transactions]) => {
              const dayIncome = transactions
                .filter((t) => t.type === 'INCOME')
                .reduce((sum, t) => sum + t.amount, 0)
              const dayExpense = transactions
                .filter((t) => t.type === 'EXPENSE')
                .reduce((sum, t) => sum + t.amount, 0)

              return (
                <Card key={day}>
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <h2 className="text-sm font-semibold text-muted">{formatDate(day)}</h2>
                    <p className="text-xs tabular-nums text-muted shrink-0">
                      {dayIncome > 0 && <span className="text-income">+{money(dayIncome)}</span>}
                      {dayIncome > 0 && dayExpense > 0 && ' · '}
                      {dayExpense > 0 && (
                        <span className="text-expense">−{money(dayExpense)}</span>
                      )}
                    </p>
                  </div>
                  <ul className="divide-y divide-line">
                    {transactions.map((transaction) => (
                      <li key={transaction.id}>
                        <TransactionItem
                          transaction={transaction}
                          showAccount
                          onEdit={setEditing}
                          onDelete={setDeleting}
                        />
                      </li>
                    ))}
                  </ul>
                </Card>
              )
            })}
          </div>
        )}
      </StateWrapper>

      <TransactionModal
        open={editing !== null}
        accounts={accounts.data?.accounts ?? []}
        categories={categories.data ?? []}
        transaction={editing}
        onClose={() => setEditing(null)}
        onSaved={() => void page.reload()}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Eliminar movimiento"
        message={
          deleting
            ? deleting.transfer_id
              ? // Una transferencia son dos filas en el listado, aunque la persona
                // solo haya tocado una. Decirlo aca evita el "yo borre una sola".
                `¿Deshacer la transferencia de ${money(deleting.amount)}? Se borran los dos movimientos y el dinero vuelve a las dos cuentas.`
              : `¿Eliminar "${deleting.description ?? deleting.category?.name ?? 'movimiento'}" por ${money(deleting.amount)}? Esta acción no se puede deshacer.`
            : ''
        }
        onConfirm={handleDelete}
        onClose={() => setDeleting(null)}
      />
    </div>
  )
}
