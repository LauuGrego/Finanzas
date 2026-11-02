import { useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { CuotasSection } from '../components/CuotasSection'
import { FormModal } from '../components/FormModal'
import { Icon } from '../components/Icon'
import { MoneyInput } from '../components/MoneyInput'
import { EmptyState, StateWrapper } from '../components/States'
import { useAsync } from '../hooks/useAsync'
import { api } from '../services/api'
import type { Category, Frequency, Recurring } from '../types'
import { resolveDefaultAccountId, useFavoriteAccount } from '../utils/favoriteAccount'
import {
  FREQUENCY_LABELS,
  money,
  parseMoney,
  relativeDay,
  shortDate,
  todayIso,
} from '../utils/format'

export function Recurrentes() {
  const [favoriteId] = useFavoriteAccount()
  const list = useAsync(() => api.recurring.list(true), [])
  const accounts = useAsync(() => api.accounts.list(), [])
  const categories = useAsync(
    () => api.categories.list(undefined, true),
    []
  )
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Recurring | null>(null)
  const [deleting, setDeleting] = useState<Recurring | null>(null)
  const [error, setError] = useState<string | null>(null)

  const all = list.data?.items ?? []
  const active = all.filter((rule) => rule.active)
  const inactive = all.filter((rule) => !rule.active)

  const usableAccounts = accounts.data?.accounts.filter((a) => a.active) ?? []
  const usableCategories = (categories.data ?? []).filter((c) => c.active)

  async function handleSave(form: FormData) {
    setError(null)
    const payload = {
      account_id: Number(form.get('account_id')),
      category_id: Number(form.get('category_id')),
      amount: parseMoney(String(form.get('amount') ?? '')),
      description: ((form.get('description') as string) ?? '').trim() || null,
      frequency: (form.get('frequency') as Frequency) ?? 'MONTHLY',
      next_date: (form.get('next_date') as string) ?? todayIso(),
    }

    if (!payload.amount || payload.amount <= 0) {
      setError('Poné un monto mayor a cero')
      return
    }

    try {
      if (editing) await api.recurring.update(editing.id, payload)
      else await api.recurring.create(payload)
      void list.reload()
      setEditing(null)
      setCreating(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  async function handleToggle(rule: Recurring) {
    await api.recurring.update(rule.id, { active: !rule.active })
    void list.reload()
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
          Recurrentes
        </h1>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="bg-gold text-black font-bold rounded-full px-5 py-2 text-xs sm:text-sm flex items-center gap-1.5 hover:bg-gold-hover shadow-sm transition-colors cursor-pointer"
        >
          <Icon name="plus" size={16} />
          Nuevo recurrente
        </button>
      </header>

      <StateWrapper loading={list.loading} error={list.error} onRetry={() => void list.reload()}>
        {active.length === 0 ? (
          <EmptyState
            title="Todavía no tenés recurrentes"
            hint="Cargá el alquiler, servicios o el sueldo una vez y se registran solos."
          />
        ) : (
          <ul className="space-y-4">
            {active.map((rule) => (
              <RecurringCard
                key={rule.id}
                rule={rule}
                onEdit={() => setEditing(rule)}
                onToggle={() => void handleToggle(rule)}
                onDelete={() => setDeleting(rule)}
              />
            ))}
          </ul>
        )}

        {inactive.length > 0 && (
          <details className="mt-4">
            <summary className="text-xs text-zinc-400 cursor-pointer hover:text-white transition-colors">
              {inactive.length} pausado{inactive.length === 1 ? '' : 's'}
            </summary>
            <ul className="mt-3 space-y-2">
              {inactive.map((rule) => (
                <li
                  key={rule.id}
                  className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-[#141414] border border-white/5"
                >
                  <span className="text-zinc-500 line-through text-sm truncate flex-1">
                    {rule.description || rule.category?.name}
                  </span>
                  <span className="text-zinc-500 tabular-nums text-sm font-semibold">
                    {money(rule.amount)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleToggle(rule)}
                    className="text-xs font-semibold text-gold hover:underline cursor-pointer ml-2"
                  >
                    Reanudar
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </StateWrapper>

      <FormModal
        open={creating || editing !== null}
        title={editing ? 'Editar recurrente' : 'Nuevo recurrente'}
        onClose={() => {
          setCreating(false)
          setEditing(null)
          setError(null)
        }}
        onSubmit={handleSave}
        error={error}
      >
        <div>
          <label className="label" htmlFor="description">
            Descripción
          </label>
          <input
            id="description"
            name="description"
            maxLength={200}
            placeholder="Netflix"
            defaultValue={editing?.description ?? ''}
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="recurring-amount">
            Monto
          </label>
          <MoneyInput
            id="recurring-amount"
            name="amount"
            required
            placeholder="15000"
            defaultValue={editing?.amount ?? ''}
            className="input no-spinner pl-8"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="frequency">
              Frecuencia
            </label>
            <select
              id="frequency"
              name="frequency"
              defaultValue={editing?.frequency ?? 'MONTHLY'}
              className="input cursor-pointer"
            >
              <option value="MONTHLY" className="bg-zinc-900 text-white">Todos los meses</option>
              <option value="WEEKLY" className="bg-zinc-900 text-white">Todas las semanas</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="next_date">
              {editing ? 'Próximo' : 'Primer cobro'}
            </label>
            <input
              id="next_date"
              name="next_date"
              type="date"
              required
              defaultValue={editing?.next_date ?? todayIso()}
              className="input"
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="category_id">
            Categoría
          </label>
          <select
            id="category_id"
            name="category_id"
            required
            defaultValue={editing?.category_id ?? ''}
            className="input cursor-pointer"
          >
            <option value="" disabled className="bg-zinc-900 text-white">
              Elegí una categoría
            </option>
            {usableCategories.map((category: Category) => (
              <option key={category.id} value={category.id} className="bg-zinc-900 text-white">
                {category.name} · {category.type === 'INCOME' ? 'entra' : 'sale'}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="account_id">
            Cuenta
          </label>
          <select
            id="account_id"
            name="account_id"
            required
            defaultValue={editing?.account_id ?? resolveDefaultAccountId(usableAccounts)}
            className="input cursor-pointer"
          >
            {usableAccounts.map((account) => (
              <option key={account.id} value={account.id} className="bg-zinc-900 text-white">
                {account.name}
                {account.id === favoriteId ? ' (Principal)' : ''}
              </option>
            ))}
          </select>
        </div>
      </FormModal>

      <ConfirmDialog
        open={deleting !== null}
        title="Borrar el recurrente"
        confirmLabel="Borrar"
        message={
          deleting
            ? `Deja de cobrar ${money(deleting.amount)} ${
                deleting.type === 'INCOME' ? 'a favor' : 'de tu bolsillo'
              }; los movimientos que ya registró quedan.`
            : ''
        }
        onConfirm={async () => {
          if (deleting) {
            await api.recurring.remove(deleting.id)
            void list.reload()
          }
        }}
        onClose={() => setDeleting(null)}
      />

      <div className="pt-6 border-t border-white/5">
        <CuotasSection />
      </div>
    </div>
  )
}

function RecurringCard({
  rule,
  onEdit,
  onToggle,
  onDelete,
}: {
  rule: Recurring
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const label = rule.description || rule.category?.name || 'Recurrente'
  const isIncome = rule.type === 'INCOME'

  return (
    <li>
      <div className="bg-[#141414] border border-white/5 rounded-3xl p-5 sm:p-6 shadow-sm hover:border-white/10 transition-colors">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3.5 min-w-0">
            <span
              className={`w-9 h-9 rounded-full grid place-items-center shrink-0 mt-0.5 ${
                isIncome
                  ? 'bg-sky-950/70 text-sky-400 border border-sky-800/40'
                  : 'bg-red-950/70 text-red-400 border border-red-800/40'
              }`}
            >
              <Icon name="repeat" size={16} />
            </span>
            <div className="min-w-0">
              <p className="font-bold text-white text-base truncate">{label}</p>
              <p className="text-xs text-zinc-400 mt-0.5">
                {FREQUENCY_LABELS[rule.frequency] ?? rule.frequency} · {shortDate(rule.next_date)}
                {rule.next_date < todayIso() && (
                  <span className="text-gold font-medium"> · {relativeDay(rule.next_date)}</span>
                )}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {rule.category?.name ?? 'Sin categoría'}
                {rule.account_name ? ` · ${rule.account_name}` : ''}
                {rule.times_charged > 0 && ` · ${rule.times_charged} cobros`}
              </p>
            </div>
          </div>

          <div className="text-right shrink-0">
            <p
              className={`font-black tabular-nums text-base sm:text-lg tracking-tight ${
                isIncome ? 'text-income' : 'text-expense'
              }`}
            >
              {isIncome ? '+' : '−'}
              {money(rule.amount)}
            </p>
            <div className="flex gap-1 mt-1 justify-end">
              <button
                type="button"
                onClick={onEdit}
                aria-label={`Editar ${label}`}
                className="text-zinc-500 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <Icon name="pencil" size={15} />
              </button>
              <button
                type="button"
                onClick={onDelete}
                aria-label={`Borrar ${label}`}
                className="text-zinc-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <Icon name="trash" size={15} />
              </button>
            </div>
          </div>
        </div>

        <div className="pt-3 mt-3 border-t border-white/5 flex justify-end">
          <button
            type="button"
            onClick={onToggle}
            className="text-xs font-semibold text-zinc-400 hover:text-gold transition-colors cursor-pointer"
          >
            Pausar
          </button>
        </div>
      </div>
    </li>
  )
}
