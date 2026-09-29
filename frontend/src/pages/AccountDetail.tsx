import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Card } from '../components/Card'
import { Icon } from '../components/Icon'
import { EmptyState, StateWrapper } from '../components/States'
import { TransactionItem } from '../components/TransactionItem'
import { TransactionModal } from '../components/TransactionModal'
import { useAsync } from '../hooks/useAsync'
import { api } from '../services/api'
import type { Transaction } from '../types'
import { money } from '../utils/format'

export function AccountDetail() {
  const { id } = useParams<{ id: string }>()
  const accountId = Number(id)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [creating, setCreating] = useState(false)

  const account = useAsync(() => api.accounts.list(true), [])
  const page = useAsync(
    () => api.transactions.list({ account_id: accountId, limit: 50 }),
    [accountId],
  )
  const categories = useAsync(() => api.categories.list(), [])

  const current = (account.data?.accounts ?? []).find((a) => a.id === accountId)

  if (!Number.isFinite(accountId)) {
    return <EmptyState title="Cuenta inválida" />
  }

  return (
    <div className="space-y-5">
      <Link
        to="/cuentas"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition"
      >
        <Icon name="back" size={16} />
        Cuentas
      </Link>

      <StateWrapper
        loading={account.loading || page.loading}
        error={account.error ?? page.error}
        onRetry={() => {
          void account.reload()
          void page.reload()
        }}
      >
        {current && (
          <Card className="card-hero p-5 border">
            <p className="text-muted text-sm">{current.name}</p>
            <p className="text-3xl font-bold mt-1 tabular-nums">{money(current.balance)}</p>
          </Card>
        )}

        <Card
          title="Últimos movimientos"
          action={
            <button
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1.5 text-sm text-gold hover:underline"
            >
              <Icon name="plus" size={15} />
              Nuevo
            </button>
          }
        >
          {(page.data?.items.length ?? 0) === 0 ? (
            <EmptyState title="Sin movimientos en esta cuenta" />
          ) : (
            <ul className="divide-y divide-line">
              {page.data?.items.map((transaction) => (
                <li key={transaction.id}>
                  <TransactionItem
                    transaction={transaction}
                    showDate
                    onEdit={setEditing}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </StateWrapper>

      <TransactionModal
        open={creating || editing !== null}
        accounts={account.data?.accounts ?? []}
        categories={categories.data ?? []}
        transaction={editing}
        defaultAccountId={accountId}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
        onSaved={() => {
          void page.reload()
          void account.reload()
        }}
      />
    </div>
  )
}
