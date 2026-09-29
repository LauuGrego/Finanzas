import { useState } from 'react'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Icon } from '../components/Icon'
import { FormModal } from '../components/FormModal'
import { EmptyState, StateWrapper } from '../components/States'
import { useAsync } from '../hooks/useAsync'
import { api } from '../services/api'
import type { Category, CategoryType } from '../types'
import { CATEGORY_COLORS, CATEGORY_PALETTE, resolveColor } from '../utils/colors'

/** The dot that stands in for a category everywhere in the app. */
function CategoryDot({ category, index = 0 }: { category: Category; index?: number }) {
  const color = resolveColor(category.color, category.id || index)
  return (
    <span
      aria-hidden="true"
      className="w-3 h-3 rounded-full shrink-0"
      style={{ backgroundColor: color }}
    />
  )
}

export function Settings() {
  const categories = useAsync(() => api.categories.list(undefined, true), [])
  const [editing, setEditing] = useState<Category | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<Category | null>(null)
  const [error, setError] = useState<string | null>(null)

  const items = categories.data ?? []
  const active = items.filter((c) => c.active)
  const inactive = items.filter((c) => !c.active)

  // Picking the next unused colour means a new category rarely looks like an
  // existing one by accident.
  const suggestedColor =
    CATEGORY_COLORS[items.length % CATEGORY_COLORS.length] ?? CATEGORY_COLORS[0]

  async function handleSave(form: FormData) {
    setError(null)
    const name = (form.get('name') as string)?.trim()
    if (!name) {
      setError('Poné un nombre para la categoría')
      return
    }

    const payload = {
      name,
      type: (form.get('type') as CategoryType) || 'EXPENSE',
      color: (form.get('color') as string) || suggestedColor,
    }

    try {
      if (editing) await api.categories.update(editing.id, payload)
      else await api.categories.create(payload)
      void categories.reload()
      setEditing(null)
      setCreating(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  async function toggleActive(category: Category) {
    await api.categories.update(category.id, { active: !category.active })
    void categories.reload()
  }

  return (
    <div className="space-y-5">
      <h1 className="text-sm font-medium uppercase tracking-wide text-muted">Configuración</h1>

      <Card
        title="Categorías"
        action={
          <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={16} />
            Nueva
          </Button>
        }
      >
        <StateWrapper
          loading={categories.loading}
          error={categories.error}
          onRetry={() => void categories.reload()}
        >
          {active.length === 0 ? (
            <EmptyState title="Sin categorías" />
          ) : (
            <ul className="divide-y divide-line">
              {active.map((category, index) => (
                <li key={category.id} className="flex items-center gap-3 py-2.5">
                  <CategoryDot category={category} index={index} />
                  <span className="flex-1 min-w-0">
                    <span className="block truncate">{category.name}</span>
                    <span className="text-xs text-muted">
                      {category.type === 'EXPENSE' ? 'Gasto' : 'Ingreso'}
                    </span>
                  </span>
                  <button
                    onClick={() => setEditing(category)}
                    aria-label={`Editar ${category.name}`}
                    className="text-muted hover:text-ink p-2 rounded-lg hover:bg-raised transition"
                  >
                    <Icon name="pencil" size={15} />
                  </button>
                  <button
                    onClick={() => setDeleting(category)}
                    aria-label={`Dar de baja ${category.name}`}
                    className="text-muted hover:text-expense p-2 rounded-lg hover:bg-raised transition"
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {inactive.length > 0 && (
            <details className="mt-4">
              <summary className="text-sm text-muted cursor-pointer">
                {inactive.length} dada{inactive.length === 1 ? '' : 's'} de baja
              </summary>
              <ul className="mt-2 space-y-1">
                {inactive.map((category, index) => (
                  <li key={category.id} className="flex items-center gap-3 py-1.5">
                    <CategoryDot category={category} index={index} />
                    <span className="text-muted line-through flex-1 text-sm truncate">
                      {category.name}
                    </span>
                    <button
                      onClick={() => void toggleActive(category)}
                      className="text-xs text-brand hover:underline"
                    >
                      Reactivar
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </StateWrapper>
      </Card>

      <Card title="Tus datos">
        <p className="text-sm text-muted">
          Todo vive en un único archivo SQLite en tu computadora. Podés copiarlo como backup
          cuando quieras, sin necesidad de la app.
        </p>
        <p className="text-sm text-muted mt-3">
          El respaldo automático y la exportación a CSV llegan más adelante.
        </p>
      </Card>

      <FormModal
        open={creating || editing !== null}
        title={editing ? 'Editar categoría' : 'Nueva categoría'}
        onClose={() => {
          setCreating(false)
          setEditing(null)
          setError(null)
        }}
        onSubmit={handleSave}
        error={error}
      >
        <div>
          <label className="label" htmlFor="cat-name">
            Nombre
          </label>
          <input
            id="cat-name"
            name="name"
            required
            autoFocus
            maxLength={80}
            placeholder="Comida"
            defaultValue={editing?.name ?? ''}
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="cat-type">
            Tipo
          </label>
          <select
            id="cat-type"
            name="type"
            defaultValue={editing?.type ?? 'EXPENSE'}
            className="input"
          >
            <option value="EXPENSE">Gasto</option>
            <option value="INCOME">Ingreso</option>
          </select>
        </div>

        <fieldset>
          <legend className="label">Color</legend>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_PALETTE.map((swatch) => (
              <label key={swatch.value} className="cursor-pointer">
                <input
                  type="radio"
                  name="color"
                  value={swatch.value}
                  aria-label={swatch.name}
                  defaultChecked={(editing?.color ?? suggestedColor) === swatch.value}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className="block w-8 h-8 rounded-full border-2 border-transparent
                             peer-checked:border-ink transition"
                  style={{ backgroundColor: swatch.value }}
                />
              </label>
            ))}
          </div>
        </fieldset>
      </FormModal>

      <ConfirmDialog
        open={deleting !== null}
        title="Dar de baja la categoría"
        confirmLabel="Dar de baja"
        message={
          deleting
            ? `"${deleting.name}" va a dejar de aparecer al registrar movimientos. Los ya registrados la conservan.`
            : ''
        }
        onConfirm={async () => {
          if (deleting) {
            await api.categories.remove(deleting.id)
            void categories.reload()
          }
        }}
        onClose={() => setDeleting(null)}
      />
    </div>
  )
}
