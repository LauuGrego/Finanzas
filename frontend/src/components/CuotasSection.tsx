import { useState } from 'react'
import { Button } from './Button'
import { Card } from './Card'
import { ConfirmDialog } from './ConfirmDialog'
import { FormModal } from './FormModal'
import { Icon } from './Icon'
import { EmptyState, StateWrapper } from './States'
import { useAsync } from '../hooks/useAsync'
import { api } from '../services/api'
import type { Category, Installment } from '../types'
import { money, parseMoney, relativeDay, shortDate, todayIso } from '../utils/format'

/**
 * Las cuotas en curso, dentro de la pantalla de programados.
 *
 * No tienen pantalla propia a propósito. Una cuota y un recurrente son hermanos:
 * los dos son reglas que escriben movimientos solos y los dos aparecen juntos en
 * el mismo bloque de próximos compromisos del inicio. Mostrarlos juntos en el
 * dashboard y después separarlos en dos pantallas dejaría el aviso apuntando a
 * un lado donde no está la mitad de las cosas, y sumaría un octavo lugar a la
 * barra del teléfono, que ya está llena.
 */
export function CuotasSection() {
  // Las terminadas y las pausadas se piden también, por el mismo motivo que en
  // recurrentes: hay que poder verlas, reanudarlas y borrarlas.
  const list = useAsync(() => api.installments.list(true), [])
  const accounts = useAsync(() => api.accounts.list(), [])
  const categories = useAsync(() => api.categories.list(undefined, true), [])
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Installment | null>(null)
  const [deleting, setDeleting] = useState<Installment | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Solo para el renglón que multiplica mientras se escribe el monto.
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
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Cuotas</h2>
        <Button size="sm" onClick={openCreate}>
          <Icon name="plus" size={16} />
          Nueva
        </Button>
      </header>

      {running.length > 0 && (
        <p className="text-sm text-muted">
          Falta pagar{' '}
          <span className="text-ink font-medium tabular-nums">{money(pending)}</span> en{' '}
          {running.length} {running.length === 1 ? 'compra' : 'compras'}.
        </p>
      )}

      <StateWrapper loading={list.loading} error={list.error} onRetry={() => void list.reload()}>
        {/* El cartel de "todavía no hay" es para la primera vez. Si lo único que
            queda son pausadas o terminadas, las listas de abajo ya explican
            todo y el cartel mentiría. */}
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
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">$</span>
              <input
                id="installment-amount"
                name="amount"
                type="text"
                inputMode="decimal"
                required
                placeholder="50000"
                defaultValue={editing?.amount ?? ''}
                // El valor se lee acá y no adentro del updater: React lo evalúa
                // en el render siguiente, y para entonces `currentTarget` ya es
                // null.
                onInput={(event) => {
                  const amount = parseMoney(event.currentTarget.value) || 0
                  setPreview((prev) => ({ ...prev, amount }))
                }}
                className="input no-spinner pl-8"
              />
            </div>
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

        {/* El total no se guarda, se calcula: por eso se puede mostrar mientras
            se escribe sin que nadie lo tenga que mantener en sincronía. */}
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

  return (
    <li>
      <Card className="p-5 hover:border-gold-dim transition">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className={plan.type === 'INCOME' ? 'text-income mt-0.5' : 'text-muted mt-0.5'}>
              <Icon name="layers" size={18} />
            </span>
            <div className="min-w-0">
              <p className="font-semibold truncate">{label}</p>
              <p className="text-xs text-muted mt-0.5">
                Cuota {current} de {plan.total_count} · {shortDate(plan.next_date)}
                {plan.next_date < todayIso() && (
                  <span className="text-gold"> · {relativeDay(plan.next_date)}</span>
                )}
              </p>
              <p className="text-xs text-muted mt-0.5">
                {plan.category?.name ?? 'Sin categoría'}
                {plan.account_name ? ` · ${plan.account_name}` : ''}
              </p>
            </div>
          </div>

          <div className="text-right shrink-0">
            <p
              className={`font-semibold tabular-nums ${
                plan.type === 'INCOME' ? 'text-income' : ''
              }`}
            >
              {plan.type === 'INCOME' ? '+' : '−'}
              {money(plan.amount)}
            </p>
            <p className="text-xs text-muted">por mes</p>
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

        {/* Titanio, no oro: es un dato, no algo que se toca. */}
        <div className="mt-3.5 flex items-center gap-3">
          <div className="h-1.5 flex-1 rounded-full bg-line overflow-hidden">
            <div className="h-full rounded-full bg-muted" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs text-muted tabular-nums shrink-0">
            quedan {plan.remaining} {plan.remaining === 1 ? 'cuota' : 'cuotas'} ·{' '}
            {money(plan.total_pending)}
          </span>
        </div>

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
