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
      className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm"
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
  const session = useAsync(() => api.session.check(), [])
  const canSignOut = session.data?.password_required ?? false

  async function signOut() {
    await api.session.logout()
    window.location.assign('/')
  }

  const items = categories.data ?? []
  const active = items.filter((c) => c.active)
  const inactive = items.filter((c) => !c.active)

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
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">Configuración</h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Preferencias generales y administración de categorías
          </p>
        </div>
      </header>

      <Card
        title="Categorías"
        className="bg-[#141414] border border-white/5 rounded-3xl p-5 sm:p-6"
        action={
          <Button
            size="sm"
            onClick={() => setCreating(true)}
            className="bg-gold hover:bg-gold-light text-black font-bold rounded-full px-4 py-2 text-xs"
          >
            <Icon name="plus" size={16} />
            Nueva categoría
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
            <ul className="divide-y divide-white/5">
              {active.map((category, index) => (
                <li key={category.id} className="flex items-center gap-3 py-3 px-2 rounded-2xl hover:bg-white/5 transition">
                  <CategoryDot category={category} index={index} />
                  <span className="flex-1 min-w-0">
                    <span className="block truncate font-semibold text-white text-sm">
                      {category.name}
                    </span>
                    <span className="text-xs text-neutral-400">
                      {category.type === 'EXPENSE' ? 'Gasto' : 'Ingreso'}
                    </span>
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditing(category)}
                      aria-label={`Editar ${category.name}`}
                      className="text-neutral-400 hover:text-white p-2 rounded-xl hover:bg-white/5 transition"
                    >
                      <Icon name="pencil" size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(category)}
                      aria-label={`Dar de baja ${category.name}`}
                      className="text-neutral-400 hover:text-expense p-2 rounded-xl hover:bg-white/5 transition"
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {inactive.length > 0 && (
            <details className="mt-5 pt-4 border-t border-white/5">
              <summary className="text-xs font-semibold uppercase tracking-wider text-neutral-400 cursor-pointer hover:text-white transition">
                {inactive.length} categoría{inactive.length === 1 ? '' : 's'} dada{inactive.length === 1 ? '' : 's'} de baja
              </summary>
              <ul className="mt-3 space-y-1">
                {inactive.map((category, index) => (
                  <li key={category.id} className="flex items-center gap-3 py-2 px-2 rounded-xl hover:bg-white/5">
                    <CategoryDot category={category} index={index} />
                    <span className="text-neutral-500 line-through flex-1 text-sm truncate">
                      {category.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => void toggleActive(category)}
                      className="text-xs text-gold hover:text-gold-hover font-medium underline"
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

      <Card title="Base de datos e infraestructura" className="bg-[#141414] border border-white/5 rounded-3xl p-5 sm:p-6">
        <p className="text-sm text-neutral-400">
          {session.data?.storage === 'postgresql'
            ? 'Todo vive en una base de datos PostgreSQL administrada y segura.'
            : 'No se pudo leer dónde están los datos.'}
        </p>
        {canSignOut && (
          <Button
            size="sm"
            variant="secondary"
            className="mt-4 rounded-full"
            onClick={() => void signOut()}
          >
            Cerrar sesión
          </Button>
        )}
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
            Nombre de la categoría
          </label>
          <input
            id="cat-name"
            name="name"
            required
            autoFocus
            maxLength={80}
            placeholder="Supermercado, Alquiler, etc."
            defaultValue={editing?.name ?? ''}
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="cat-type">
            Tipo de movimiento
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
          <legend className="label">Color distintivo</legend>
          <div className="flex flex-wrap gap-2.5 pt-1">
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
                  className="block w-8 h-8 rounded-full border-2 border-transparent peer-checked:border-white peer-checked:scale-110 shadow-sm transition"
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
            ? `"${deleting.name}" deja de aparecer al registrar nuevos movimientos. Los registros existentes conservan su histórico.`
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
