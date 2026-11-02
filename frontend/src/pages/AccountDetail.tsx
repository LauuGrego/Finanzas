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
import { useFavoriteAccount } from '../utils/favoriteAccount'

export function AccountDetail() {
  const { id } = useParams<{ id: string }>()
  const accountId = Number(id)
  const [favoriteId, setFavoriteId] = useFavoriteAccount()
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [creating, setCreating] = useState(false)

  const account = useAsync(() => api.accounts.list(true), [])
  const page = useAsync(
    () => api.transactions.list({ account_id: accountId, limit: 50 }),
    [accountId],
  )
  const categories = useAsync(() => api.categories.list(), [])

  const current = (account.data?.accounts ?? []).find((a) => a.id === accountId)
  const isFavorite = favoriteId === current?.id

  if (!Number.isFinite(accountId)) {
    return <EmptyState title="Cuenta inválida" />
  }

  return (
    <div className="space-y-6">
      <Link
        to="/cuentas"
        className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-zinc-400 hover:text-white transition-colors"
      >
        <Icon name="back" size={16} />
        Volver a cuentas
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
          <div
            className={`rounded-3xl p-6 sm:p-7 shadow-lg relative flex flex-col justify-between ${
              isFavorite
                ? 'bg-gold text-black'
                : 'bg-[#141414] border border-white/5 text-white'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold uppercase tracking-wider ${
                    isFavorite ? 'text-black/75' : 'text-zinc-400'
                  }`}>
                    Cuenta
                  </span>
                  {isFavorite && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-black px-2.5 py-0.5 rounded-full shadow-sm">
                      <Icon name="starFilled" size={10} />
                      Principal
                    </span>
                  )}
                </div>
                <h1 className={`text-3xl sm:text-4xl font-black mt-2 tracking-tight ${
                  isFavorite ? 'text-black' : 'text-white'
                }`}>
                  {current.name}
                </h1>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setFavoriteId(current.id)}
                  title={isFavorite ? 'Cuenta principal' : 'Marcar como principal'}
                  aria-label={isFavorite ? 'Cuenta principal' : 'Marcar como principal'}
                  className={`p-2 rounded-xl transition-colors cursor-pointer ${
                    isFavorite
                      ? 'text-black hover:bg-black/10'
                      : 'text-zinc-400 hover:text-gold hover:bg-white/5'
                  }`}
                >
                  <Icon name={isFavorite ? 'starFilled' : 'star'} size={20} />
                </button>
                <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
                  isFavorite
                    ? 'border-black/20 text-black'
                    : 'border-white/10 text-zinc-400 bg-white/5'
                }`}>
                  {page.data?.items.length ?? 0}{' '}
                  {(page.data?.items.length ?? 0) === 1 ? 'movimiento' : 'movimientos'}
                </span>
              </div>
            </div>
          </div>
        )}

        <Card
          title="Últimos movimientos"
          action={
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="bg-gold text-black font-bold rounded-full px-4 py-1.5 text-xs flex items-center gap-1.5 hover:bg-gold-hover shadow-sm transition-colors cursor-pointer"
            >
              <Icon name="plus" size={14} />
              Nuevo
            </button>
          }
        >
          {(page.data?.items.length ?? 0) === 0 ? (
            <EmptyState title="Sin movimientos en esta cuenta" />
          ) : (
            <ul className="divide-y divide-white/5">
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
