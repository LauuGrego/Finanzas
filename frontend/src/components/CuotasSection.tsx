import { useState } from 'react'
import { ConfirmDialog } from './ConfirmDialog'
import { FormModal } from './FormModal'
import { Icon } from './Icon'
import { MoneyInput } from './MoneyInput'
import { EmptyState, StateWrapper } from './States'
import { useAsync } from '../hooks/useAsync'
import { api } from '../services/api'
import type { Category, Installment } from '../types'
import { resolveDefaultAccountId, useFavoriteAccount } from '../utils/favoriteAccount'
import { money, parseMoney, relativeDay, shortDate, todayIso } from '../utils/format'

/**
 * Sección de gestión y visualización de planes de compras en cuotas.
 *
 * Se integra dentro de la vista de compromisos programados junto a los gastos recurrentes
 * para unificar la planificación financiera de débitos automáticos periódicos, consolidar
 * las obligaciones próximas en el panel de control y optimizar el espacio de navegación.
 */
export function CuotasSection() {
  const [favoriteId] = useFavoriteAccount()
  const list = useAsync(() => api.installments.list(true), [])
  const accounts = useAsync(() => api.accounts.list(), [])
  const categories = useAsync(() => api.categories.list(undefined, true), [])
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Installment | null>(null)
  const [deleting, setDeleting] = useState<Installment | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState({ amount: 0, count: 12 })

  const all = list.data?.items ?? []
  const running = all.filter((plan) => plan.active && !plan.finished)
  const finished = all.filter((plan) => plan.active && plan.finished)
  const paused = all.filter((plan) => !plan.active)
  const pending = running.reduce((sum, plan) => sum + plan.total_pending, 0)

  const usableAccounts = accounts.data?.accounts.filter((a) => a.active) ?? []
  const usableCategories = (categories.data ?? []).filter((c) => c.active)

  function openCreate() {
    setError(null)
    setPreview({ amount: 0, count: 12 })
    setCreating(true)
  }

  function openEdit(plan: Installment) {
    setError(null)
    setPreview({ amount: plan.amount, count: plan.total_count })
    setEditing(plan)
  }

  function close() {
    setCreating(false)
    setEditing(null)
    setError(null)
  }

  async function handleSave(form: FormData) {
    setError(null)
    const payload = {
      account_id: Number(form.get('account_id')),
      category_id: Number(form.get('category_id')),
      amount: parseMoney(String(form.get('amount') ?? '')),
      description: ((form.get('description') as string) ?? '').trim() || null,
      total_count: Number(form.get('total_count')),
      next_date: (form.get('next_date') as string) ?? todayIso(),
    }

    if (!payload.amount || payload.amount <= 0) {
      setError('Poné un monto mayor a cero')
      return
    }
    if (!payload.total_count || payload.total_count < 1) {
      setError('Poné al menos una cuota')
      return
    }

    try {
      if (editing) await api.installments.update(editing.id, payload)
      else await api.installments.create(payload)
      void list.reload()
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  async function handleToggle(plan: Installment) {
    await api.installments.update(plan.id, { active: !plan.active })
    void list.reload()
  }

  return (
    <section className="space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">Cuotas</h2>
        <button
          type="button"
          onClick={openCreate}
          className="bg-gold text-black font-bold rounded-full px-5 py-2 text-xs sm:text-sm flex items-center gap-1.5 hover:bg-gold-hover shadow-sm transition-colors cursor-pointer"
        >
          <Icon name="plus" size={16} />
          Nueva cuota
        </button>
      </header>

      {running.length > 0 && (
        <p className="text-sm text-muted">
          Falta pagar{' '}
          <span className="text-ink font-medium tabular-nums">{money(pending)}</span> en{' '}
          {running.length} {running.length === 1 ? 'compra' : 'compras'}.
        </p>
      )}

      <StateWrapper loading={list.loading} error={list.error} onRetry={() => void list.reload()}>
        {all.length === 0 ? (
          <EmptyState
            title="Todavía no tenés cuotas"
            hint="Cargala una vez y se cobra sola mes a mes."
          />
        ) : running.length > 0 ? (
          <ul className="space-y-3">
            {running.map((plan) => (
              <InstallmentCard
                key={plan.id}
                plan={plan}
                onEdit={() => openEdit(plan)}
                onToggle={() => void handleToggle(plan)}
                onDelete={() => setDeleting(plan)}
              />
            ))}
          </ul>
        ) : null}

        {finished.length > 0 && (
          <details className="mt-2">
            <summary className="text-sm text-muted cursor-pointer">
              {finished.length} terminada{finished.length === 1 ? '' : 's'}
            </summary>
            <ul className="mt-2 space-y-1">
              {finished.map((plan) => (
                <li key={plan.id} className="flex items-center gap-3 py-1.5">
                  <span className="text-muted flex-1 text-sm truncate">
                    {plan.description || plan.category?.name}
                  </span>
                  <span className="text-muted tabular-nums text-sm">
                    {plan.total_count} × {money(plan.amount)}
                  </span>
                  <button
                    onClick={() => setDeleting(plan)}
                    className="text-xs text-muted hover:text-expense transition"
                  >
                    Borrar
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}

        {paused.length > 0 && (
          <details className="mt-2">
            <summary className="text-sm text-muted cursor-pointer">
              {paused.length} pausada{paused.length === 1 ? '' : 's'}
            </summary>
            <ul className="mt-2 space-y-1">
              {paused.map((plan) => (
                <li key={plan.id} className="flex items-center gap-3 py-1.5">
                  <span className="text-muted line-through flex-1 text-sm truncate">
                    {plan.description || plan.category?.name}
                  </span>
                  <span className="text-muted tabular-nums text-sm">{money(plan.amount)}</span>
                  <button
                    onClick={() => void handleToggle(plan)}
                    className="text-xs text-gold hover:underline"
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
        title={editing ? 'Editar cuota' : 'Nueva cuota'}
        onClose={close}
        onSubmit={handleSave}
        error={error}
      >
        <div>
          <label className="label" htmlFor="installment-description">
            Descripción
          </label>
          <input
            id="installment-description"
            name="description"
            maxLength={200}
            placeholder="La tele"
            defaultValue={editing?.description ?? ''}
            className="input"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="installment-amount">
              Cada cuota
            </label>
            <MoneyInput
              id="installment-amount"
              name="amount"
              required
              placeholder="50000"
              defaultValue={editing?.amount ?? ''}
              onChange={(text) =>
                setPreview((prev) => ({ ...prev, amount: parseMoney(text) || 0 }))
              }
              className="input no-spinner pl-8"
            />
          </div>
          <div>
            <label className="label" htmlFor="installment-count">
              Cantidad
            </label>
            <input
              id="installment-count"
              name="total_count"
              type="text"
              inputMode="numeric"
              required
              placeholder="12"
              defaultValue={editing?.total_count ?? 12}
              onInput={(event) => {
                const count = Number(event.currentTarget.value) || 0
                setPreview((prev) => ({ ...prev, count }))
              }}
              className="input no-spinner"
            />
          </div>
        </div>

        {preview.amount > 0 && preview.count > 0 && (
          <p className="text-xs text-muted -mt-1">
            {preview.count} {preview.count === 1 ? 'cuota' : 'cuotas'} de{' '}
            {money(preview.amount)} ={' '}
            <span className="text-ink">{money(preview.amount * preview.count)}</span> en total
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="installment-date">
              {editing ? 'Próxima' : 'Primera cuota'}
            </label>
            <input
              id="installment-date"
              name="next_date"
              type="date"
              required
              defaultValue={editing?.next_date ?? todayIso()}
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="installment-account">
              Cuenta
            </label>
            <select
              id="installment-account"
              name="account_id"
              required
              defaultValue={editing?.account_id ?? resolveDefaultAccountId(usableAccounts)}
              className="input"
            >
              {usableAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                  {account.id === favoriteId ? ' (Principal)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="installment-category">
            Categoría
          </label>
          <select
            id="installment-category"
            name="category_id"
            required
            defaultValue={editing?.category_id ?? ''}
            className="input"
          >
            <option value="" disabled>
              Elegí una categoría
            </option>
            {usableCategories.map((category: Category) => (
              <option key={category.id} value={category.id}>
                {category.name} · {category.type === 'INCOME' ? 'entra' : 'sale'}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted mt-1.5">
            La categoría dice si esto entra o sale.
          </p>
        </div>
      </FormModal>

      <ConfirmDialog
        open={deleting !== null}
        title="Borrar la cuota"
        confirmLabel="Borrar"
        message={
          deleting
            ? deleting.finished
              ? deleting.total_count === 1
                ? 'Ya se cobró entera: desaparece de la lista y queda el movimiento.'
                : `Ya se cobró entera: desaparece de la lista y quedan los ${deleting.total_count} movimientos.`
              : `Deja de cobrar ${money(deleting.amount)} por mes; lo ya cobrado queda.`
            : ''
        }
        onConfirm={async () => {
          if (deleting) {
            await api.installments.remove(deleting.id)
            void list.reload()
          }
        }}
        onClose={() => setDeleting(null)}
      />
    </section>
  )
}

function InstallmentCard({
  plan,
  onEdit,
  onToggle,
  onDelete,
}: {
  plan: Installment
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const label = plan.description || plan.category?.name || 'Cuota'
  const current = Math.min(plan.paid_count + 1, plan.total_count)
  const progress = Math.round((plan.paid_count / plan.total_count) * 100)
  const isIncome = plan.type === 'INCOME'

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
              <Icon name="layers" size={16} />
            </span>
            <div className="min-w-0">
              <p className="font-bold text-white text-base truncate">{label}</p>
              <p className="text-xs text-zinc-400 mt-0.5">
                Cuota {current} de {plan.total_count} · {shortDate(plan.next_date)}
                {plan.next_date < todayIso() && (
                  <span className="text-gold font-medium"> · {relativeDay(plan.next_date)}</span>
                )}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {plan.category?.name ?? 'Sin categoría'}
                {plan.account_name ? ` · ${plan.account_name}` : ''}
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
              {money(plan.amount)}
            </p>
            <p className="text-xs text-zinc-500">por mes</p>
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

        <div className="mt-4 space-y-2">
          <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-gold transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-zinc-400 tabular-nums font-medium">
            <span>quedan {plan.remaining} {plan.remaining === 1 ? 'cuota' : 'cuotas'}</span>
            <span className="font-bold text-white">{money(plan.total_pending)}</span>
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
