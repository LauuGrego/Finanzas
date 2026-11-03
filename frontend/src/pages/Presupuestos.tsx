import { useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { FormModal } from '../components/FormModal'
import { Icon } from '../components/Icon'
import { MoneyInput } from '../components/MoneyInput'
import { MonthStepper } from '../components/MonthStepper'
import { EmptyState, Skeleton, StateWrapper } from '../components/States'
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
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Presupuestos
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Definí topes por categoría para controlar tus gastos mensuales.
          </p>
        </div>
        <MonthStepper period={period} onChange={setPeriod} />
      </header>

      {notice && (
        <p className="text-xs text-neutral-300 bg-[#141414] border border-white/10 rounded-2xl p-4">
          {notice}
        </p>
      )}

      {/* Solid Yellow Hero Card */}
      {budgets.loading ? (
        <div className="bg-gold text-black rounded-3xl p-6 sm:p-8 shadow-md">
          <Skeleton variant="gold" className="h-4 w-40 rounded mb-2" />
          <div className="flex flex-wrap items-baseline gap-2 my-2">
            <Skeleton variant="gold" className="h-10 sm:h-12 w-48 rounded-2xl" />
            <Skeleton variant="gold" className="h-6 w-32 rounded-xl" />
          </div>
          <div className="h-3 rounded-full bg-black/15 my-5 overflow-hidden">
            <Skeleton variant="gold" className="h-full w-2/3 rounded-full" />
          </div>
          <div className="flex items-center justify-between">
            <Skeleton variant="gold" className="h-4 w-36 rounded" />
            <Skeleton variant="gold" className="h-4 w-24 rounded" />
          </div>
        </div>
      ) : summary && summary.count > 0 ? (
        <div className="bg-gold text-black rounded-3xl p-6 sm:p-8 shadow-md">
          <span className="text-xs font-bold uppercase tracking-wider text-black/75 block">
            Gastado en {monthLabel(period)}
          </span>
          <div className="flex flex-wrap items-baseline gap-2 mt-2">
            <span className="text-4xl sm:text-5xl font-black text-black tracking-tight tabular-nums">
              {money(summary.spent)}
            </span>
            <span className="text-xl sm:text-2xl font-bold text-black/70 tabular-nums">
              de {money(summary.amount)}
            </span>
          </div>

          <div className="h-3 rounded-full bg-black/15 overflow-hidden my-5">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                summary.percentage > 100 ? 'bg-expense' : 'bg-black'
              }`}
              style={{ width: `${Math.min(summary.percentage, 100)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs sm:text-sm font-bold text-black/80">
            <span>
              {summary.count} {summary.count === 1 ? 'presupuesto' : 'presupuestos'}
              {summary.over_count > 0 && ` · ${summary.over_count} excedido${summary.over_count === 1 ? '' : 's'}`}
            </span>
            <span className="tabular-nums font-black text-black">
              {summary.remaining < 0
                ? `Excedido por ${money(Math.abs(summary.remaining))}`
                : `Quedan ${money(summary.remaining)}`}
            </span>
          </div>
        </div>
      ) : null}

      {/* Category List Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Por categoría
          </h2>
          <button
            type="button"
            onClick={openCreate}
            className="bg-gold text-black font-bold rounded-full px-5 py-2 text-xs sm:text-sm flex items-center gap-1.5 hover:bg-gold-light shadow-sm transition-colors cursor-pointer shrink-0"
          >
            <Icon name="plus" size={16} />
            Nuevo presupuesto
          </button>
        </div>

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
      </div>

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
    <div className="bg-[#141414] border border-white/5 hover:border-white/10 rounded-3xl p-6 transition flex flex-col justify-between">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span
              aria-hidden="true"
              className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm"
              style={{ backgroundColor: barColor }}
            />
            <div className="min-w-0">
              <p className="font-bold text-white text-base truncate">{label}</p>
              <p className="text-xs text-neutral-400 mt-0.5 tabular-nums">
                {money(budget.spent)} de {money(budget.amount)} · {percent(budget.percentage)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Editar ${label}`}
              className="text-neutral-400 hover:text-white p-2 rounded-xl hover:bg-white/5 transition cursor-pointer"
            >
              <Icon name="pencil" size={15} />
            </button>
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Borrar ${label}`}
              className="text-neutral-400 hover:text-expense p-2 rounded-xl hover:bg-white/5 transition cursor-pointer"
            >
              <Icon name="trash" size={15} />
            </button>
          </div>
        </div>

        <div className="h-2.5 rounded-full bg-[#222222] overflow-hidden my-4">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${Math.min(budget.percentage, 100)}%`,
              backgroundColor: over ? '#ef4444' : barColor,
            }}
          />
        </div>
      </div>

      <p className={`text-xs font-semibold tabular-nums ${over ? 'text-expense' : 'text-neutral-400'}`}>
        {over
          ? `Excedido por ${money(Math.abs(budget.remaining))}`
          : `Quedan ${money(budget.remaining)}`}
      </p>
    </div>
  )
}
