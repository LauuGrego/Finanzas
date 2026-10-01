import { useState } from 'react'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { FormModal } from '../components/FormModal'
import { Icon } from '../components/Icon'
import { MonthStepper } from '../components/MonthStepper'
import { EmptyState, StateWrapper } from '../components/States'
import { useAsync } from '../hooks/useAsync'
import { api } from '../services/api'
import type { Budget, Category } from '../types'
import { resolveColor } from '../utils/colors'
import { currentPeriod, money, monthLabel, parseMoney, percent, shiftPeriod } from '../utils/format'

/**
 * Presupuestos: un tope por categoría y por mes.
 *
 * La pantalla es de sólo lectura salvo el botón de nuevo y el de cada tarjeta.
 * Nada de lo que hay acá frena un gasto: un presupuesto que se pasó informa, no
 * bloquea, porque un límite que no se puede pasar de largo miente sobre lo que
 * ya pasó. El único aviso en el camino está en el modal de movimiento, y
 * tampoco impide guardar.
 *
 * El mes se elige arriba con el mismo Stepper que usan el inicio y la agenda,
 * para que "presupuesto de septiembre" sea el mismo septiembre que estás
 * mirando en los movimientos y no un mes aparte que hay que volver a elegir.
 */
export function Presupuestos() {
  const [period, setPeriod] = useState(currentPeriod())
  const budgets = useAsync(() => api.budgets.list(period), [period])
  const categories = useAsync(() => api.categories.list('EXPENSE'), [])
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Budget | null>(null)
  const [deleting, setDeleting] = useState<Budget | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Sólo para la línea de "van a ser N presupuestos".
  const [repeat, setRepeat] = useState(true)

  const items = budgets.data?.items ?? []
  const summary = budgets.data?.summary
  const usableCategories = (categories.data ?? []).filter((category: Category) => category.active)

  function openCreate() {
    setError(null)
    setNotice(null)
    setRepeat(true)
    setCreating(true)
  }

  function openEdit(budget: Budget) {
    setError(null)
    setNotice(null)
    setEditing(budget)
  }

  function close() {
    setCreating(false)
    setEditing(null)
    setError(null)
  }

  async function handleSave(form: FormData) {
    setError(null)
    const amount = parseMoney(String(form.get('amount') ?? ''))
    if (!amount || amount <= 0) {
      setError('Poné un monto mayor a cero')
      return
    }

    try {
      if (editing) {
        await api.budgets.update(editing.id, {
          amount,
          apply_forward: form.get('apply_forward') === 'on',
        })
        void budgets.reload()
      } else {
        const result = await api.budgets.create({
          category_id: Number(form.get('category_id')),
          amount,
          period,
          repeat_months: repeat ? 12 : 1,
        })
        // Los meses que ya tenían presupuesto no se pisan: avisarlo es la
        // diferencia entre "no pasó nada" y "creo que lo creé y no está".
        setNotice(
          result.skipped > 0
            ? `Creados ${result.created} de ${result.created + result.skipped}. Los otros ${result.skipped} ya tenían presupuesto y quedaron como estaban.`
            : null,
        )
        void budgets.reload()
      }
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-sm font-medium uppercase tracking-wide text-muted">Presupuestos</h1>
        <MonthStepper period={period} onChange={setPeriod} />
      </header>

      <p className="text-sm text-muted">Un tope por categoría: te avisa, no te frena.</p>

      {notice && (
        <p className="text-sm text-muted bg-raised rounded-xl px-3 py-2">{notice}</p>
      )}

      {summary && summary.count > 0 && (
        <Card>
          {/* Con wrap porque a 320 px "Gastado del mes" y los dos montos no
              entran en una línea: es mejor que bajen que que se pisen. */}
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-muted text-sm">Gastado del mes</p>
            <p className="font-semibold tabular-nums">
              {money(summary.spent)} <span className="text-muted font-normal">de {money(summary.amount)}</span>
            </p>
          </div>

          <BudgetBar percentage={summary.percentage} color={summary.over_count > 0 ? '#e06a62' : undefined} />

          <div className="flex items-center justify-between gap-3 mt-3 text-sm">
            <span className="text-muted">
              {summary.count} {summary.count === 1 ? 'presupuesto' : 'presupuestos'}
              {summary.over_count > 0 && ` · ${summary.over_count} pasado${summary.over_count === 1 ? '' : 's'}`}
            </span>
            <span className={`tabular-nums ${summary.remaining < 0 ? 'text-expense' : 'text-muted'}`}>
              {summary.remaining < 0
                ? `te pasaste por ${money(Math.abs(summary.remaining))}`
                : `quedan ${money(summary.remaining)}`}
            </span>
          </div>
        </Card>
      )}

      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Icon name="plus" size={16} />
          Nuevo
        </Button>
      </div>

      <StateWrapper
        loading={budgets.loading}
        error={budgets.error}
        onRetry={() => void budgets.reload()}
      >
        {items.length === 0 ? (
          <EmptyState
            title={`Todavía no tenés presupuestos en ${monthLabel(period)}`}
            hint="Creá uno y vas a ver cuánto queda."
          />
        ) : (
          <ul className="space-y-3">
            {items.map((budget) => (
              <BudgetCard
                key={budget.id}
                budget={budget}
                onEdit={() => openEdit(budget)}
                onDelete={() => setDeleting(budget)}
              />
            ))}
          </ul>
        )}
      </StateWrapper>

      <FormModal
        open={creating || editing !== null}
        title={editing ? 'Editar presupuesto' : 'Nuevo presupuesto'}
        onClose={close}
        onSubmit={handleSave}
        error={error}
      >
        {editing ? (
          <div>
            <label className="label" htmlFor="budget-edit-amount">
              Tope para {editing.category?.name ?? 'la categoría'}
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">$</span>
              <input
                id="budget-edit-amount"
                name="amount"
                type="text"
                inputMode="decimal"
                required
                defaultValue={editing.amount}
                className="input no-spinner pl-8"
              />
            </div>
            <p className="text-xs text-muted mt-1.5">
              Vas gastado {money(editing.spent)} de {money(editing.amount)} ({percent(editing.percentage)}).
            </p>
            <label className="flex items-start gap-2.5 mt-4 cursor-pointer">
              <input
                type="checkbox"
                name="apply_forward"
                defaultChecked
                className="mt-0.5 accent-gold w-4 h-4"
              />
              <span className="text-sm">
                Aplicar a los meses siguientes
                <span className="block text-xs text-muted">Los que ya pasaron no cambian.</span>
              </span>
            </label>
          </div>
        ) : (
          <>
            <div>
              <label className="label" htmlFor="budget-category">
                Categoría
              </label>
              <select id="budget-category" name="category_id" required className="input">
                {usableCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted mt-1.5">
                Para {monthLabel(period)}.
              </p>
            </div>

            <div>
              <label className="label" htmlFor="budget-amount">
                Tope del mes
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">$</span>
                <input
                  id="budget-amount"
                  name="amount"
                  type="text"
                  inputMode="decimal"
                  required
                  autoFocus
                  placeholder="200.000"
                  className="input no-spinner pl-8 text-lg font-semibold"
                />
              </div>
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={repeat}
                onChange={(event) => setRepeat(event.target.checked)}
                className="mt-0.5 accent-gold w-4 h-4"
              />
              <span className="text-sm">
                Repetir todos los meses por un año
                <span className="block text-xs text-muted">
                  {repeat
                    ? `Se crean 12 presupuestos, de ${monthLabel(period)} a ${monthLabel(
                        shiftPeriod(period, 11),
                      )}.`
                    : `Se crea 1 presupuesto en ${monthLabel(period)}.`}
                </span>
              </span>
            </label>
          </>
        )}
      </FormModal>

      <ConfirmDialog
        open={deleting !== null}
        title="Borrar el presupuesto"
        confirmLabel="Borrar"
        message={
          deleting
            ? `Se deja de avisarte el tope de ${money(deleting.amount)} en ${
                deleting.category?.name ?? 'esa categoría'
              }.`
            : ''
        }
        onConfirm={async () => {
          if (deleting) {
            await api.budgets.remove(deleting.id)
            void budgets.reload()
          }
        }}
        onClose={() => setDeleting(null)}
      />
    </div>
  )
}

/**
 * La barra de avance. Titanio como en las cuotas, porque es un dato y no algo
 * que se toca; en el color de la categoría mientras vas bien y en rojo sólo
 * cuando el gasto se pasó del tope, que es el único momento en que el color
 * está diciendo algo.
 */
function BudgetBar({ percentage, color }: { percentage: number; color?: string }) {
  const over = percentage > 100
  return (
    <div className="h-1.5 rounded-full bg-line overflow-hidden mt-3">
      <div
        className="h-full rounded-full"
        style={{
          width: `${Math.min(percentage, 100)}%`,
          backgroundColor: over ? '#e06a62' : (color ?? '#9d9488'),
        }}
      />
    </div>
  )
}

function BudgetCard({
  budget,
  onEdit,
  onDelete,
}: {
  budget: Budget
  onEdit: () => void
  onDelete: () => void
}) {
  const label = budget.category?.name ?? 'Sin categoría'
  const barColor = resolveColor(budget.category?.color, budget.category_id)
  const over = budget.over

  return (
    <li>
      <Card className="p-5 hover:border-gold-dim transition">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <span
              aria-hidden="true"
              className="w-2.5 h-2.5 rounded-full shrink-0 mt-1.5"
              style={{ backgroundColor: barColor }}
            />
            <div className="min-w-0">
              <p className="font-semibold truncate">{label}</p>
              <p className="text-xs text-muted mt-0.5">
                {money(budget.spent)} de {money(budget.amount)} · {percent(budget.percentage)}
              </p>
            </div>
          </div>

          <div className="flex gap-0.5 shrink-0">
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

        <BudgetBar percentage={budget.percentage} color={barColor} />

        <p className={`text-xs mt-2.5 ${over ? 'text-expense' : 'text-muted'}`}>
          {over
            ? `Te pasaste por ${money(Math.abs(budget.remaining))}`
            : `Quedan ${money(budget.remaining)}`}
        </p>
      </Card>
    </li>
  )
}