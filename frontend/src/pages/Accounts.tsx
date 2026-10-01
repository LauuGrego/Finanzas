import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Icon } from '../components/Icon'
import { EmptyState, StateWrapper } from '../components/States'
import { FormModal } from '../components/FormModal'
import { useAsync } from '../hooks/useAsync'
import { api } from '../services/api'
import type { Account } from '../types'
import { money } from '../utils/format'

const TYPE_LABELS: Record<string, string> = {
  BANK: 'Banco',
  WALLET: 'Billetera virtual',
  CASH: 'Efectivo',
  CREDIT: 'Crédito',
  OTHER: 'Otro',
}

export function Accounts() {
  // Se piden también las dadas de baja: sin esto no hay dónde volver si te
  // equivocás y la das de baja, porque desaparecen de la lista y no queda
  // nada detrás para reactivarlas.
  const list = useAsync(() => api.accounts.list(true), [])
  const [editing, setEditing] = useState<Account | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<Account | null>(null)
  const [error, setError] = useState<string | null>(null)

  const all = list.data?.accounts ?? []
  const accounts = all.filter((a) => a.active)
  const inactive = all.filter((a) => !a.active)
  const total = list.data?.total_balance ?? 0

  async function handleSave(form: FormData) {
    setError(null)
    const name = (form.get('name') as string)?.trim()
    if (!name) {
      setError('Poné un nombre para la cuenta')
      return
    }

    const payload = {
      name,
      type: ((form.get('type') as string) || 'BANK') as Account['type'],
      initial_balance: Number(String(form.get('initial_balance') ?? '0').replace(',', '.')) || 0,
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
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <h1 className="text-sm font-medium uppercase tracking-wide text-muted">Mis cuentas</h1>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Icon name="plus" size={16} />
          Nueva
        </Button>
      </header>

      <StateWrapper loading={list.loading} error={list.error} onRetry={() => void list.reload()}>
        {accounts.length === 0 ? (
          <EmptyState title="Todavía no tenés cuentas" hint="Creá una para empezar." />
        ) : (
          <>
            <ul className="space-y-3">
              {accounts.map((account) => (
                <li key={account.id}>
                  <Card className="p-5 hover:border-gold-dim transition">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          to={`/cuentas/${account.id}`}
                          className="font-semibold hover:text-gold transition"
                        >
                          {account.name}
                        </Link>
                        <p className="text-xs text-muted mt-0.5">
                          {TYPE_LABELS[account.type] ?? account.type}
                        </p>
                      </div>
                      <div className="text-right">
                        <p
                          className={`font-semibold tabular-nums ${
                            account.balance < 0 ? 'text-expense' : ''
                          }`}
                        >
                          {money(account.balance)}
                        </p>
                        <div className="flex gap-0.5 mt-1">
                          <button
                            onClick={() => setEditing(account)}
                            aria-label={`Editar ${account.name}`}
                            className="text-muted hover:text-ink p-1.5 rounded-lg hover:bg-raised transition"
                          >
                            <Icon name="pencil" size={15} />
                          </button>
                          <button
                            onClick={() => setDeleting(account)}
                            aria-label={`Dar de baja ${account.name}`}
                            className="text-muted hover:text-expense p-1.5 rounded-lg hover:bg-raised transition"
                          >
                            <Icon name="trash" size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>

            <div
              className="card-hero card p-5 border flex items-center justify-between"
            >
              <span className="text-muted text-sm">Total</span>
              <span className="font-bold tabular-nums text-lg text-gold">{money(total)}</span>
            </div>
          </>
        )}

        {inactive.length > 0 && (
          <details className="mt-5">
            <summary className="text-sm text-muted cursor-pointer">
              {inactive.length} dada{inactive.length === 1 ? '' : 's'} de baja
            </summary>
            <ul className="mt-2 space-y-1">
              {inactive.map((account) => (
                <li key={account.id} className="flex items-center gap-3 py-1.5">
                  <span className="text-muted line-through flex-1 text-sm truncate">
                    {account.name}
                  </span>
                  <span className="text-muted tabular-nums text-sm">{money(account.balance)}</span>
                  <button
                    onClick={() => void handleReactivate(account)}
                    className="text-xs text-gold hover:underline"
                  >
                    Reactivar
                  </button>
                </li>
              ))}
            </ul>
          </details>
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
            className="input"
          >
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="initial_balance">
            Saldo inicial
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">$</span>
            <input
              id="initial_balance"
              name="initial_balance"
              type="text"
              inputMode="decimal"
              placeholder="0"
              defaultValue={editing?.initial_balance ?? ''}
              className="input no-spinner pl-8"
            />
          </div>
          <p className="text-xs text-muted mt-1.5">
            La plata que tenías antes de usar la app.
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
