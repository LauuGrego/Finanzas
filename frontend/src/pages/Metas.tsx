import { useState } from 'react'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
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
    // Vacio es cero y no un error: casi toda meta arranca en cero.
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
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-sm font-medium uppercase tracking-wide text-muted">Metas</h1>
        <Button size="sm" onClick={openCreate}>
          <Icon name="plus" size={16} />
          Nueva
        </Button>
      </header>

      <p className="text-sm text-muted -mt-2">Lo juntado lo cargás vos, cuando quieras.</p>

      <StateWrapper loading={goals.loading} error={goals.error} onRetry={() => void goals.reload()}>
        {items.length === 0 ? (
          <EmptyState
            title={showPaused ? 'No tenés metas' : 'No tenés metas activas'}
            hint="Creá una para un viaje, un equipo o un fondo."
          />
        ) : (
          <ul className="space-y-3">
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

      {/* Sólo tiene sentido offercerlo cuando hay algo pausado: con la lista
          llena de metas activas es un control que no hace nada. */}
      {!showPaused && (
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={showPaused}
            onChange={(event) => setShowPaused(event.target.checked)}
            className="accent-gold w-4 h-4"
          />
          <span className="text-sm text-muted">Ver las pausadas</span>
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
            Nombre
          </label>
          <input
            id="goal-name"
            name="name"
            type="text"
            required
            maxLength={120}
            autoFocus
            defaultValue={editing?.name ?? ''}
            placeholder="Viaje a Bs. As."
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="goal-target">
            Cuánto necesitás
          </label>
          <MoneyInput
            id="goal-target"
            name="target_amount"
            required
            defaultValue={editing?.target_amount ?? ''}
            placeholder="500.000"
            className="input no-spinner pl-8 text-lg font-semibold"
          />
        </div>

        <div>
          <label className="label" htmlFor="goal-current">
            Cuánto llevás
          </label>
          <MoneyInput
            id="goal-current"
            name="current_amount"
            defaultValue={editing?.current_amount ?? ''}
            placeholder="0"
            className="input no-spinner pl-8"
          />
        </div>

        <div>
          <label className="label" htmlFor="goal-deadline">
            Fecha
          </label>
          <input
            id="goal-deadline"
            name="deadline"
            type="date"
            defaultValue={editing?.deadline ?? ''}
            className="input"
          />
          <p className="text-xs text-muted mt-1.5">Opcional: si pasa, la meta queda vencida.</p>
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

/**
 * El color dice en qué estado está, y sólo hay tres: dorado cuando se
 * cumplió, rojo cuando la fecha pasó sin llegar, titanio mientras se va. El
 * dorado va sólo acá porque es el único estado de la app que se ganó algo.
 */
function statusStyle(goal: Goal): { bar: string; label: string; note: string } {
  if (goal.status === 'cumplida') {
    return { bar: '#c9a227', label: 'text-gold', note: 'Cumplida' }
  }
  if (goal.status === 'vencida') {
    return { bar: '#e06a62', label: 'text-expense', note: 'Vencida' }
  }
  return { bar: '#9d9488', label: 'text-muted', note: 'En curso' }
}

/**
 * "vence en 45 días", "vence hoy", "venció hace 3 días". El día exacto ya está
 * en la línea de arriba; acá lo que interesa es cuánto falta.
 */
function deadlineNote(goal: Goal): string | null {
  if (!goal.deadline) return null
  const days = goal.days_left ?? 0
  if (days === 0) return 'vence hoy'
  if (days > 0) return `vence en ${days} días`
  return `venció hace ${Math.abs(days)} días`
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
    <li>
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <Icon name="target" size={18} className="text-muted mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold truncate">{goal.name}</p>
              <p className="text-xs text-muted mt-0.5 tabular-nums">
                {money(goal.current_amount)} de {money(goal.target_amount)} ·{' '}
                {percent(goal.progress)}
              </p>
            </div>
          </div>

          <div className="flex gap-0.5 shrink-0">
            <button
              onClick={onToggle}
              aria-label={goal.active ? `Pausar ${goal.name}` : `Reactivar ${goal.name}`}
              className="text-muted hover:text-ink p-1.5 rounded-lg hover:bg-raised transition"
            >
              <Icon name={goal.active ? 'pause' : 'check'} size={15} />
            </button>
            <button
              onClick={onEdit}
              aria-label={`Editar ${goal.name}`}
              className="text-muted hover:text-ink p-1.5 rounded-lg hover:bg-raised transition"
            >
              <Icon name="pencil" size={15} />
            </button>
            <button
              onClick={onDelete}
              aria-label={`Borrar ${goal.name}`}
              className="text-muted hover:text-expense p-1.5 rounded-lg hover:bg-raised transition"
            >
              <Icon name="trash" size={15} />
            </button>
          </div>
        </div>

        <div className="h-1.5 rounded-full bg-line overflow-hidden mt-3">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(goal.progress, 100)}%`,
              backgroundColor: style.bar,
            }}
          />
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mt-2.5">
          <span className={`text-xs ${style.label}`}>
            {style.note}
            {deadlineNote(goal) && <span className="text-muted"> · {deadlineNote(goal)}</span>}
          </span>
          <span className="text-xs text-muted tabular-nums">
            {goal.status === 'cumplida'
              ? 'Llegaste'
              : `Faltan ${money(goal.remaining)}`}
          </span>
        </div>

        {!goal.active && (
          <p className="text-xs text-muted mt-2">
            Pausada{goal.deadline && ` · ${formatDate(goal.deadline)}`}
          </p>
        )}
      </Card>
    </li>
  )
}
