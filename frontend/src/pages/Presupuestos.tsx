import { useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { FormModal } from '../components/FormModal'
import { Icon } from '../components/Icon'
import { MoneyInput } from '../components/MoneyInput'
import { MonthStepper } from '../components/MonthStepper'
import { EmptyState, StateWrapper } from '../components/States'
import { useAsync } from '../hooks/useAsync'
import { api } from '../services/api'
import type { Budget, Category } from '../types'
import { resolveColor } from '../utils/colors'
import { currentPeriod, money, monthLabel, parseMoney, percent, shiftPeriod } from '../utils/format'

export function Presupuestos() {
  const [period, setPeriod] = useState(currentPeriod())
  const budgets = useAsync(() => api.budgets.list(period), [period])
  const categories = useAsync(() => api.categories.list('EXPENSE'), [])
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Budget | null>(null)
  const [deleting, setDeleting] = useState<Budget | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
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
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
          Presupuestos
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <MonthStepper period={period} onChange={setPeriod} />
          <button
            type="button"
            onClick={openCreate}
            className="bg-gold text-black font-bold rounded-full px-5 py-2 text-xs sm:text-sm flex items-center gap-1.5 hover:bg-gold-hover shadow-sm transition-colors cursor-pointer"
          >
            <Icon name="plus" size={16} />
            Nuevo presupuesto
          </button>
        </div>
      </header>

      {notice && (
        <p className="text-xs text-zinc-300 bg-[#141414] border border-white/10 rounded-2xl p-4">
          {notice}
        </p>
      )}

      {summary && summary.count > 0 && (
        <div className="bg-[#141414] border border-white/5 rounded-3xl p-6 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Gastado del mes
            </span>
            <span className="font-black text-lg text-white tabular-nums">
              {money(summary.spent)}{' '}
              <span className="text-zinc-500 font-medium text-sm">
                de {money(summary.amount)}
              </span>
            </span>
          </div>

          <BudgetBar
            percentage={summary.percentage}
            color={summary.over_count > 0 ? '#ef4444' : '#ffcd00'}
          />

          <div className="flex items-center justify-between gap-3 mt-3 text-xs sm:text-sm font-medium">
            <span className="text-zinc-400">
              {summary.count} {summary.count === 1 ? 'presupuesto' : 'presupuestos'}
              {summary.over_count > 0 && ` · ${summary.over_count} excedido${summary.over_count === 1 ? '' : 's'}`}
            </span>
            <span className={`tabular-nums font-bold ${summary.remaining < 0 ? 'text-expense' : 'text-zinc-300'}`}>
              {summary.remaining < 0
                ? `Excedido por ${money(Math.abs(summary.remaining))}`
                : `Quedan ${money(summary.remaining)}`}
            </span>
          </div>
        </div>
      )}

      <StateWrapper
        loading={budgets.loading}
        error={budgets.error}
        onRetry={() => void budgets.reload()}
      >
        {items.length === 0 ? (
          <EmptyState
            title={`Todavía no tenés presupuestos en ${monthLabel(period)}`}
            hint="Definí topes por categoría para controlar tus gastos mensuales."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {items.map((budget) => (
              <BudgetCard
                key={budget.id}
                budget={budget}
                onEdit={() => openEdit(budget)}
                onDelete={() => setDeleting(budget)}
              />
            ))}
          </div>
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
          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="budget-edit-amount">
                Tope para {editing.category?.name ?? 'la categoría'}
              </label>
              <MoneyInput
                id="budget-edit-amount"
                name="amount"
                required
                defaultValue={editing.amount}
                className="input no-spinner pl-8 text-lg font-bold"
              />
              <p className="text-xs text-muted mt-1.5">
                Vas gastado {money(editing.spent)} de {money(editing.amount)} ({percent(editing.percentage)}).
              </p>
            </div>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                name="apply_forward"
                defaultChecked
                className="mt-0.5 accent-gold w-4 h-4"
              />
              <span className="text-xs text-zinc-300">
                Aplicar a los meses siguientes
                <span className="block text-[11px] text-muted">Los meses anteriores no cambian.</span>
              </span>
            </label>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="budget-category">
                Categoría
              </label>
              <select id="budget-category" name="category_id" required className="input cursor-pointer">
                {usableCategories.map((category) => (
                  <option key={category.id} value={category.id} className="bg-zinc-900 text-white">
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label" htmlFor="budget-amount">
                Tope mensual
              </label>
              <MoneyInput
                id="budget-amount"
                name="amount"
                required
                autoFocus
                placeholder="200.000"
                className="input no-spinner pl-8 text-lg font-bold"
              />
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={repeat}
                onChange={(event) => setRepeat(event.target.checked)}
                className="mt-0.5 accent-gold w-4 h-4"
              />
              <span className="text-xs text-zinc-300">
                Repetir todos los meses por un año
                <span className="block text-[11px] text-muted">
                  {repeat
                    ? `Se crean 12 presupuestos hasta ${monthLabel(shiftPeriod(period, 11))}.`
                    : `Se crea 1 presupuesto para ${monthLabel(period)}.`}
                </span>
              </span>
            </label>
          </div>
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

function BudgetBar({ percentage, color }: { percentage: number; color?: string }) {
  const over = percentage > 100
  return (
    <div className="h-2 rounded-full bg-zinc-800 overflow-hidden mt-3">
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{
          width: `${Math.min(percentage, 100)}%`,
          backgroundColor: over ? '#ef4444' : (color ?? '#ffcd00'),
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
    <div className="bg-[#141414] border border-white/5 rounded-3xl p-5 sm:p-6 shadow-sm hover:border-white/10 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <span
            aria-hidden="true"
            className="w-2.5 h-2.5 rounded-full shrink-0 mt-1.5"
            style={{ backgroundColor: barColor }}
          />
          <div className="min-w-0">
            <p className="font-bold text-white text-base truncate">{label}</p>
            <p className="text-xs text-zinc-400 mt-0.5">
              {money(budget.spent)} de {money(budget.amount)} · {percent(budget.percentage)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
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

      <BudgetBar percentage={budget.percentage} color={barColor} />

      <p className={`text-xs font-semibold mt-3 ${over ? 'text-expense' : 'text-zinc-400'}`}>
        {over
          ? `Excedido por ${money(Math.abs(budget.remaining))}`
          : `Quedan ${money(budget.remaining)}`}
      </p>
    </div>
  )
}
