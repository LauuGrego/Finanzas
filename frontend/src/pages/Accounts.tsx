import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { FormModal } from '../components/FormModal'
import { Icon, type IconName } from '../components/Icon'
import { MoneyInput } from '../components/MoneyInput'
import { EmptyState, StateWrapper } from '../components/States'
import { useAsync } from '../hooks/useAsync'
import { api } from '../services/api'
import type { Account } from '../types'
import { useFavoriteAccount } from '../utils/favoriteAccount'
import { money, parseMoney } from '../utils/format'

const TYPE_LABELS: Record<string, string> = {
  BANK: 'Banco',
  WALLET: 'Billetera virtual',
  CASH: 'Efectivo',
  CREDIT: 'Crédito',
  OTHER: 'Otro',
}

const TYPE_ICONS: Record<string, IconName> = {
  BANK: 'home',
  WALLET: 'wallet',
  CASH: 'receipt',
  CREDIT: 'wallet',
  OTHER: 'wallet',
}

export function Accounts() {
  const list = useAsync(() => api.accounts.list(true), [])
  const [favoriteId, setFavoriteId] = useFavoriteAccount()
  const [editing, setEditing] = useState<Account | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<Account | null>(null)
  const [error, setError] = useState<string | null>(null)

  const all = list.data?.accounts ?? []
  const accounts = all.filter((a) => a.active)
  const inactive = all.filter((a) => !a.active)

  async function handleSave(form: FormData) {
    setError(null)
    const name = (form.get('name') as string)?.trim()
    if (!name) {
      setError('Poné un nombre para la cuenta')
      return
    }

    const type = ((form.get('type') as string) || 'BANK') as Account['type']
    const initialBalanceRaw = form.get('initial_balance')
    const initial_balance =
      initialBalanceRaw !== null && String(initialBalanceRaw).trim() !== ''
        ? parseMoney(String(initialBalanceRaw))
        : editing
          ? editing.initial_balance
          : 0

    const payload = {
      name,
      type,
      initial_balance,
    }

    try {
      if (editing) await api.accounts.update(editing.id, payload)
      else await api.accounts.create(payload)
      void list.reload()
      setEditing(null)
      setCreating(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  async function handleReactivate(account: Account) {
    await api.accounts.update(account.id, { active: true })
    void list.reload()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
          Mis cuentas
        </h1>

        <button
          type="button"
          onClick={() => setCreating(true)}
          className="bg-gold text-black font-bold rounded-full px-5 py-2 text-xs sm:text-sm flex items-center gap-1.5 hover:bg-gold-hover shadow-sm transition-colors cursor-pointer"
        >
          <Icon name="plus" size={16} />
          Nueva cuenta
        </button>
      </header>

      <StateWrapper loading={list.loading} error={list.error} onRetry={() => void list.reload()}>
        {accounts.length === 0 ? (
          <EmptyState title="Todavía no tenés cuentas" hint="Creá una para empezar." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {accounts.map((account) => {
              const isFavorite =
                favoriteId === account.id || (!favoriteId && accounts[0]?.id === account.id)

              if (isFavorite) {
                // Primary / Favorite Card (Solid Yellow!)
                return (
                  <div
                    key={account.id}
                    className="bg-gold text-black rounded-3xl p-6 shadow-lg relative flex flex-col justify-between min-h-[175px] group"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="bg-black text-white px-3 py-1 rounded-full text-xs font-bold inline-block shadow-sm">
                          Principal
                        </span>
                      </div>

                      <Link
                        to={`/cuentas/${account.id}`}
                        className="block text-2xl font-black text-black tracking-tight mt-3 hover:underline"
                      >
                        {account.name}
                      </Link>

                      <div className="flex items-center gap-1.5 text-xs text-black/80 font-medium mt-1">
                        <Icon name={TYPE_ICONS[account.type] ?? 'wallet'} size={14} />
                        <span>{TYPE_LABELS[account.type] ?? account.type}</span>
                      </div>
                    </div>

                    <div className="flex items-end justify-between pt-4 mt-2 border-t border-black/10">
                      <div>
                        <span className="block text-[11px] font-semibold text-black/70">
                          Saldo actual
                        </span>
                        <span className="block text-sm sm:text-base font-black text-black tabular-nums">
                          {account.balance === 0
                            ? '$0'
                            : `${account.balance > 0 ? '+' : '−'}${money(Math.abs(account.balance))}`}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditing(account)}
                          aria-label={`Editar ${account.name}`}
                          className="p-1.5 rounded-lg text-black hover:bg-black/10 transition-colors cursor-pointer"
                        >
                          <Icon name="pencil" size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(account)}
                          aria-label={`Dar de baja ${account.name}`}
                          className="p-1.5 rounded-lg text-black hover:bg-black/10 transition-colors cursor-pointer"
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              }

              // Secondary Account Cards (Dark Cards)
              return (
                <div
                  key={account.id}
                  className="bg-[#141414] border border-white/5 rounded-3xl p-6 text-white shadow-sm flex flex-col justify-between min-h-[175px] hover:border-white/10 transition-all group"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        to={`/cuentas/${account.id}`}
                        className="text-2xl font-bold text-white tracking-tight hover:text-gold transition-colors truncate"
                      >
                        {account.name}
                      </Link>

                      <button
                        type="button"
                        onClick={() => setFavoriteId(account.id)}
                        aria-label={`Marcar ${account.name} como principal`}
                        title="Marcar como principal"
                        className="p-1 rounded-lg text-zinc-500 hover:text-gold transition-colors cursor-pointer"
                      >
                        <Icon name="star" size={17} />
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-zinc-400 mt-1">
                      <Icon name={TYPE_ICONS[account.type] ?? 'wallet'} size={14} />
                      <span>{TYPE_LABELS[account.type] ?? account.type}</span>
                    </div>
                  </div>

                  <div className="flex items-end justify-between pt-4 mt-2 border-t border-white/5">
                    <div>
                      <span className="block text-[11px] font-medium text-zinc-500">
                        Saldo actual
                      </span>
                      <span
                        className={`block text-sm sm:text-base font-bold tabular-nums ${
                          account.balance > 0
                            ? 'text-income'
                            : account.balance < 0
                              ? 'text-expense'
                              : 'text-zinc-400'
                        }`}
                      >
                        {account.balance === 0
                          ? 'Sin movimientos'
                          : `${account.balance > 0 ? '+' : '−'}${money(Math.abs(account.balance))}`}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing(account)}
                        aria-label={`Editar ${account.name}`}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-white transition-colors cursor-pointer"
                      >
                        <Icon name="pencil" size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(account)}
                        aria-label={`Dar de baja ${account.name}`}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {inactive.length > 0 && (
          <div className="pt-2">
            <details className="mt-4">
              <summary className="text-xs text-zinc-400 cursor-pointer hover:text-white transition-colors">
                {inactive.length} {inactive.length === 1 ? 'cuenta dada de baja' : 'cuentas dadas de baja'}
              </summary>
              <ul className="mt-3 space-y-2">
                {inactive.map((account) => (
                  <li
                    key={account.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-[#141414] border border-white/5"
                  >
                    <span className="text-zinc-500 line-through text-sm truncate">
                      {account.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleReactivate(account)}
                      className="text-xs font-semibold text-gold hover:underline cursor-pointer"
                    >
                      Reactivar
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        )}
      </StateWrapper>

      <FormModal
        open={creating || editing !== null}
        title={editing ? 'Editar cuenta' : 'Nueva cuenta'}
        onClose={() => {
          setCreating(false)
          setEditing(null)
          setError(null)
        }}
        onSubmit={handleSave}
        error={error}
      >
        <div>
          <label className="label" htmlFor="name">
            Nombre
          </label>
          <input
            id="name"
            name="name"
            required
            autoFocus
            maxLength={80}
            placeholder="Mercado Pago"
            defaultValue={editing?.name ?? ''}
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="type">
            Tipo
          </label>
          <select
            id="type"
            name="type"
            defaultValue={editing?.type ?? 'BANK'}
            className="input cursor-pointer"
          >
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value} className="bg-zinc-900 text-white">
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="initial_balance">
            Saldo inicial
          </label>
          <MoneyInput
            id="initial_balance"
            name="initial_balance"
            defaultValue={editing?.initial_balance ?? 0}
            placeholder="0"
            className="input no-spinner pl-8 text-base font-semibold"
          />
          <p className="text-xs text-neutral-400 mt-1">
            Con cuánta plata arrancó la cuenta antes de registrar movimientos.
          </p>
        </div>
      </FormModal>

      <ConfirmDialog
        open={deleting !== null}
        title="Dar de baja la cuenta"
        confirmLabel="Dar de baja"
        message={
          deleting
            ? `La cuenta "${deleting.name}" va a dejar de aparecer, pero sus movimientos se conservan.`
            : ''
        }
        onConfirm={async () => {
          if (deleting) {
            await api.accounts.remove(deleting.id)
            void list.reload()
          }
        }}
        onClose={() => setDeleting(null)}
      />
    </div>
  )
}
