import { useState } from 'react'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { CuotasSection } from '../components/CuotasSection'
import { FormModal } from '../components/FormModal'
import { Icon } from '../components/Icon'
import { EmptyState, StateWrapper } from '../components/States'
import { useAsync } from '../hooks/useAsync'
import { api } from '../services/api'
import type { Category, Frequency, Recurring } from '../types'
import { FREQUENCY_LABELS, money, relativeDay, shortDate, todayIso } from '../utils/format'

export function Recurrentes() {
  // Las dadas de baja se piden también: una regla que pausaste vuelve con un
  // clic, y si desapareciera de la lista no quedaría dónde reactivarla.
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
      amount: Number(String(form.get('amount') ?? '').replace(',', '.')),
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
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <h1 className="text-sm font-medium uppercase tracking-wide text-muted">Recurrentes</h1>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Icon name="plus" size={16} />
          Nuevo
        </Button>
      </header>

      <StateWrapper loading={list.loading} error={list.error} onRetry={() => void list.reload()}>
        {active.length === 0 ? (
          <EmptyState
            title="Todavía no tenés recurrentes"
            hint="Cargá el alquiler, Netflix o el sueldo una vez y se registran solos."
          />
        ) : (
          <ul className="space-y-3">
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
          <details className="mt-5">
            <summary className="text-sm text-muted cursor-pointer">
              {inactive.length} pausado{inactive.length === 1 ? '' : 's'}
            </summary>
            <ul className="mt-2 space-y-1">
              {inactive.map((rule) => (
                <li key={rule.id} className="flex items-center gap-3 py-1.5">
                  <span className="text-muted line-through flex-1 text-sm truncate">
                    {rule.description || rule.category?.name}
                  </span>
                  <span className="text-muted tabular-nums text-sm">{money(rule.amount)}</span>
                  <button
                    onClick={() => void handleToggle(rule)}
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
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">$</span>
            <input
              id="recurring-amount"
              name="amount"
              type="text"
              inputMode="decimal"
              required
              placeholder="15000"
              defaultValue={editing?.amount ?? ''}
              className="input no-spinner pl-8"
            />
          </div>
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
              className="input"
            >
              <option value="MONTHLY">Todos los meses</option>
              <option value="WEEKLY">Todas las semanas</option>
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

        <div>
          <label className="label" htmlFor="account_id">
            Cuenta
          </label>
          <select
            id="account_id"
            name="account_id"
            required
            defaultValue={editing?.account_id ?? usableAccounts[0]?.id ?? ''}
            className="input"
          >
            {usableAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} · {money(account.balance)}
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

      {/* Las cuotas van abajo y separadas por una línea, no metidas en la misma
          lista: son hermanas de los recurrentes, no otro tipo de recurrente.
          Cada bloque tiene su botón y se lee solo. */}
      <div className="pt-5 border-t border-line">
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

  return (
    <li>
      <Card className="p-5 hover:border-gold-dim transition">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span
              className={rule.type === 'INCOME' ? 'text-income mt-0.5' : 'text-muted mt-0.5'}
            >
              <Icon name="repeat" size={18} />
            </span>
            <div className="min-w-0">
              <p className="font-semibold truncate">{label}</p>
              <p className="text-xs text-muted mt-0.5">
                {FREQUENCY_LABELS[rule.frequency] ?? rule.frequency} · {shortDate(rule.next_date)}
                {rule.next_date < todayIso() && (
                  <span className="text-gold"> · {relativeDay(rule.next_date)}</span>
                )}
              </p>
              <p className="text-xs text-muted mt-0.5">
                {rule.category?.name ?? 'Sin categoría'}
                {rule.account_name ? ` · ${rule.account_name}` : ''}
                {rule.times_charged > 0 && ` · van ${rule.times_charged}`}
              </p>
            </div>
          </div>

          <div className="text-right shrink-0">
            <p
              className={`font-semibold tabular-nums ${
                rule.type === 'INCOME' ? 'text-income' : ''
              }`}
            >
              {rule.type === 'INCOME' ? '+' : '−'}
              {money(rule.amount)}
            </p>
            <div className="flex gap-0.5 mt-1 justify-end">
              <button
                onClick={onEdit}
                aria-label={`Editar ${label}`}
                className="text-muted hover:text-ink p-1.5 rounded-lg hover:bg-raised transition"
              >
                <Icon name="pencil" size={15} />
              </button>
              <button
                onClick={onDelete}
                aria-label={`Borrar ${label}`}
                className="text-muted hover:text-expense p-1.5 rounded-lg hover:bg-raised transition"
              >
                <Icon name="trash" size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* Pausar es lo normal: un suscripción que se cancela casi nunca se
            borra, se deja de cobrar y queda a mano por si vuelve. */}
        <button
          onClick={onToggle}
          className="mt-3 text-xs text-muted hover:text-gold transition"
        >
          Pausar
        </button>
      </Card>
    </li>
  )
}