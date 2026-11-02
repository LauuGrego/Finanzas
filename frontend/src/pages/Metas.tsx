import { useState } from 'react'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { FormModal } from '../components/FormModal'
import { Icon } from '../components/Icon'
import { MoneyInput } from '../components/MoneyInput'
import { EmptyState, StateWrapper } from '../components/States'
import { useAsync } from '../hooks/useAsync'
import { api } from '../services/api'
import type { Goal } from '../types'
import { formatDate, money, parseMoney, percent } from '../utils/format'

/**
 * Metas: para qué estás juntando plata.
 *
 * Lo juntado se carga a mano y no sale de los movimientos. Es lo que pidió el
 * plan, pero además es lo correcto acá: una meta no sabe de qué cuenta sale la
 * plata ni a qué categoría pertenece, y fingir lo contrario sería mentir sobre
 * dónde está el dinero.
 *
 * La fecha es opcional y no frena nada. Si la fecha pasa, la meta queda
 * vencida a la vista y editable; no se esconde ni se archiva sola.
 */
export function Metas() {
  const [showPaused, setShowPaused] = useState(false)
  const goals = useAsync(() => api.goals.list(showPaused), [showPaused])
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Goal | null>(null)
  const [deleting, setDeleting] = useState<Goal | null>(null)
  const [error, setError] = useState<string | null>(null)

  const items = goals.data?.items ?? []

  function openCreate() {
    setError(null)
    setCreating(true)
  }

  function openEdit(goal: Goal) {
    setError(null)
    setEditing(goal)
  }

  function close() {
    setCreating(false)
    setEditing(null)
    setError(null)
  }

  async function handleSave(form: FormData) {
    setError(null)
    const name = String(form.get('name') ?? '').trim()
    if (!name) {
      setError('Poné un nombre')
      return
    }

    const target = parseMoney(String(form.get('target_amount') ?? ''))
    if (!target || target <= 0) {
      setError('Poné un monto mayor a cero')
      return
    }
    const current = parseMoney(String(form.get('current_amount') ?? ''))
    if (Number.isNaN(current) || current < 0) {
      setError('Lo juntado no puede ser negativo')
      return
    }

    const dateInput = String(form.get('deadline') ?? '')
    const deadline = dateInput || null

    try {
      if (editing) {
        await api.goals.update(editing.id, {
          name,
          target_amount: target,
          current_amount: current,
          deadline,
        })
      } else {
        await api.goals.create({
          name,
          target_amount: target,
          current_amount: current,
          deadline,
        })
      }
      close()
      void goals.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  async function toggleActive(goal: Goal) {
    await api.goals.update(goal.id, { active: !goal.active })
    void goals.reload()
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">Metas</h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Lo juntado lo cargás vos, cuando quieras.
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="bg-gold hover:bg-gold-light text-black font-bold rounded-full px-5 py-2.5 shadow-sm text-xs sm:text-sm shrink-0 self-start sm:self-auto"
        >
          <Icon name="plus" size={16} />
          Nueva meta
        </Button>
      </header>

      <StateWrapper loading={goals.loading} error={goals.error} onRetry={() => void goals.reload()}>
        {items.length === 0 ? (
          <EmptyState
            title={showPaused ? 'No tenés metas' : 'No tenés metas activas'}
            hint="Creá una para un viaje, un equipo o un fondo de ahorro."
          />
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {items.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onEdit={() => openEdit(goal)}
                onToggle={() => void toggleActive(goal)}
                onDelete={() => setDeleting(goal)}
              />
            ))}
          </ul>
        )}
      </StateWrapper>

      {!showPaused && (
        <label className="inline-flex items-center gap-2.5 cursor-pointer py-1 text-sm text-neutral-400 hover:text-white transition">
          <input
            type="checkbox"
            checked={showPaused}
            onChange={(event) => setShowPaused(event.target.checked)}
            className="accent-gold w-4 h-4 rounded"
          />
          <span>Ver las metas pausadas</span>
        </label>
      )}

      <FormModal
        open={creating || editing !== null}
        title={editing ? 'Editar meta' : 'Nueva meta'}
        onClose={close}
        onSubmit={handleSave}
        error={error}
      >
        <div>
          <label className="label" htmlFor="goal-name">
            Nombre de la meta
          </label>
          <input
            id="goal-name"
            name="name"
            type="text"
            required
            maxLength={120}
            autoFocus
            defaultValue={editing?.name ?? ''}
            placeholder="Fondo de emergencia, viaje, equipo..."
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="goal-target">
            Monto objetivo
          </label>
          <MoneyInput
            id="goal-target"
            name="target_amount"
            required
            defaultValue={editing?.target_amount ?? ''}
            placeholder="500.000"
            className="input no-spinner pl-8 text-lg font-bold text-gold"
          />
        </div>

        <div>
          <label className="label" htmlFor="goal-current">
            Monto acumulado actual
          </label>
          <MoneyInput
            id="goal-current"
            name="current_amount"
            defaultValue={editing?.current_amount ?? ''}
            placeholder="0"
            className="input no-spinner pl-8 font-semibold"
          />
        </div>

        <div>
          <label className="label" htmlFor="goal-deadline">
            Fecha límite
          </label>
          <input
            id="goal-deadline"
            name="deadline"
            type="date"
            defaultValue={editing?.deadline ?? ''}
            className="input"
          />
          <p className="text-xs text-neutral-400 mt-1.5">Opcional: te ayuda a calcular cuánto falta.</p>
        </div>
      </FormModal>

      <ConfirmDialog
        open={deleting !== null}
        title="Borrar la meta"
        confirmLabel="Borrar"
        message={
          deleting ? `Se borra "${deleting.name}" y el progreso que le cargaste.` : ''
        }
        onConfirm={async () => {
          if (deleting) {
            await api.goals.remove(deleting.id)
            void goals.reload()
          }
        }}
        onClose={() => setDeleting(null)}
      />
    </div>
  )
}

function statusStyle(goal: Goal): { bar: string; label: string; note: string; badgeBg: string } {
  if (goal.status === 'cumplida') {
    return {
      bar: '#ffcd00',
      label: 'text-gold',
      note: 'Cumplida',
      badgeBg: 'bg-gold/10 text-gold border-gold/30',
    }
  }
  if (goal.status === 'vencida') {
    return {
      bar: '#ef4444',
      label: 'text-expense',
      note: 'Vencida',
      badgeBg: 'bg-expense/10 text-expense border-expense/30',
    }
  }
  return {
    bar: '#ffcd00',
    label: 'text-neutral-300',
    note: 'En curso',
    badgeBg: 'bg-white/5 text-neutral-300 border-white/10',
  }
}

function deadlineNote(goal: Goal): string | null {
  if (!goal.deadline) return null
  const days = goal.days_left ?? 0
  if (days === 0) return 'Vence hoy'
  if (days > 0) return `${days} días restantes`
  return `Venció hace ${Math.abs(days)} días`
}

function GoalCard({
  goal,
  onEdit,
  onToggle,
  onDelete,
}: {
  goal: Goal
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const style = statusStyle(goal)

  return (
    <li className="list-none">
      <div className="bg-[#141414] border border-white/5 rounded-3xl p-5 sm:p-6 transition hover:border-white/10 flex flex-col justify-between h-full">
        <div>
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center text-gold shrink-0 border border-white/5">
                <Icon name="target" size={18} />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-white text-base truncate">{goal.name}</h3>
                <span
                  className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border mt-1 ${style.badgeBg}`}
                >
                  {style.note}
                  {deadlineNote(goal) && (
                    <span className="opacity-75 font-normal ml-1">· {deadlineNote(goal)}</span>
                  )}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={onToggle}
                aria-label={goal.active ? `Pausar ${goal.name}` : `Reactivar ${goal.name}`}
                className="text-neutral-400 hover:text-white p-2 rounded-xl hover:bg-white/5 transition"
              >
                <Icon name={goal.active ? 'pause' : 'check'} size={15} />
              </button>
              <button
                type="button"
                onClick={onEdit}
                aria-label={`Editar ${goal.name}`}
                className="text-neutral-400 hover:text-white p-2 rounded-xl hover:bg-white/5 transition"
              >
                <Icon name="pencil" size={15} />
              </button>
              <button
                type="button"
                onClick={onDelete}
                aria-label={`Borrar ${goal.name}`}
                className="text-neutral-400 hover:text-expense p-2 rounded-xl hover:bg-white/5 transition"
              >
                <Icon name="trash" size={15} />
              </button>
            </div>
          </div>

          <div className="my-3">
            <div className="flex justify-between items-baseline mb-1.5">
              <span className="text-xl sm:text-2xl font-black text-white tabular-nums tracking-tight">
                {money(goal.current_amount)}
              </span>
              <span className="text-xs text-neutral-400 font-semibold tabular-nums">
                de {money(goal.target_amount)}
              </span>
            </div>

            {/* Progress bar with electric yellow fill */}
            <div className="h-2 rounded-full bg-neutral-800/80 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(goal.progress, 100)}%`,
                  backgroundColor: style.bar,
                }}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-white/5 text-xs text-neutral-400">
          <span className="font-semibold text-white tabular-nums">
            {percent(goal.progress)} completado
          </span>
          <span className="tabular-nums">
            {goal.status === 'cumplida' ? (
              <span className="text-gold font-bold">¡Objetivo alcanzado!</span>
            ) : (
              `Faltan ${money(goal.remaining)}`
            )}
          </span>
        </div>

        {!goal.active && (
          <p className="text-[11px] text-neutral-500 mt-2 italic">
            Meta pausada{goal.deadline && ` · Fecha objetivo: ${formatDate(goal.deadline)}`}
          </p>
        )}
      </div>
    </li>
  )
}
