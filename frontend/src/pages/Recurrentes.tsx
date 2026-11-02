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
import { resolveColor } from '../utils/colors'
import {
  money,
  parseMoney,
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
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Recurrentes
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Pagos e ingresos periódicos que se programan solos.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="bg-gold text-black font-bold rounded-full px-5 py-2.5 text-xs sm:text-sm flex items-center gap-1.5 hover:bg-gold-light shadow-sm transition cursor-pointer self-start sm:self-auto shrink-0"
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
          <div className="bg-[#141414] border border-white/5 rounded-3xl p-3 sm:p-5">
            <ul className="divide-y divide-white/5">
              {active.map((rule) => (
                <RecurringRow
                  key={rule.id}
                  rule={rule}
                  onEdit={() => setEditing(rule)}
                  onToggle={() => void handleToggle(rule)}
                  onDelete={() => setDeleting(rule)}
                />
              ))}
            </ul>
          </div>
        )}

        {inactive.length > 0 && (
          <details className="mt-4">
            <summary className="text-xs text-neutral-400 cursor-pointer hover:text-white transition">
              {inactive.length} pausado{inactive.length === 1 ? '' : 's'}
            </summary>
            <ul className="mt-3 space-y-2">
              {inactive.map((rule) => (
                <li
                  key={rule.id}
                  className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-[#141414] border border-white/5"
                >
                  <span className="text-neutral-500 line-through text-sm truncate flex-1">
                    {rule.description || rule.category?.name}
                  </span>
                  <span className="text-neutral-500 tabular-nums text-sm font-semibold">
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

function parseDateCapsule(isoDate: string): { day: string; month: string } {
  try {
    const [year, m, d] = isoDate.split('-')
    const date = new Date(Number(year), Number(m) - 1, Number(d))
    const day = String(Number(d)).padStart(2, '0')
    const month = date.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '').slice(0, 3)
    return { day, month }
  } catch {
    return { day: '--', month: '---' }
  }
}

function RecurringRow({
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
  const { day, month } = parseDateCapsule(rule.next_date)
  const dotColor = resolveColor(rule.category?.color, rule.category_id ?? 0)

  return (
    <li className="py-4 px-3 sm:px-5 flex items-center justify-between gap-4 hover:bg-white/[0.02] transition rounded-2xl">
      {/* Left: Date Capsule & Description */}
      <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
        <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-[#1c1c1f] border border-white/5 flex flex-col items-center justify-center shrink-0">
          <span className="text-base sm:text-lg font-black text-white tabular-nums leading-none">
            {day}
          </span>
          <span className="text-[10px] sm:text-[11px] font-bold text-neutral-400 uppercase tracking-wider mt-1">
            {month}
          </span>
        </div>

        <div className="min-w-0">
          <p className="font-bold text-white text-sm sm:text-base truncate">{label}</p>
          <div className="flex items-center gap-2 text-xs text-neutral-400 mt-0.5 truncate">
            <span
              aria-hidden="true"
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: dotColor }}
            />
            <span className="truncate">
              {rule.category?.name ?? 'Sin categoría'}
              {rule.account_name ? ` · ${rule.account_name}` : ''}
              {rule.times_charged > 0 ? ` · van ${rule.times_charged}` : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Right: Amount & Actions */}
      <div className="text-right shrink-0">
        <p
          className={`font-black tabular-nums text-base sm:text-lg tracking-tight ${
            isIncome ? 'text-income' : 'text-expense'
          }`}
        >
          {isIncome ? '+' : '−'}
          {money(rule.amount)}
        </p>

        <div className="flex items-center justify-end gap-1 sm:gap-1.5 mt-1">
          <button
            type="button"
            onClick={onToggle}
            className="text-xs font-semibold text-neutral-400 hover:text-white px-2 py-1 rounded-lg hover:bg-white/5 transition flex items-center gap-1 cursor-pointer"
          >
            <span className="text-[10px] font-mono leading-none tracking-tighter font-bold">||</span>
            <span>Pausar</span>
          </button>
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Editar ${label}`}
            className="text-neutral-400 hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition cursor-pointer"
          >
            <Icon name="pencil" size={15} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Borrar ${label}`}
            className="text-neutral-400 hover:text-expense p-1.5 rounded-lg hover:bg-white/5 transition cursor-pointer"
          >
            <Icon name="trash" size={15} />
          </button>
        </div>
      </div>
    </li>
  )
}
