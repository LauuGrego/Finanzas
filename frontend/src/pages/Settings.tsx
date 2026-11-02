import { useState } from 'react'
import { Button } from '../components/Button'
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
  const incomeCategories = active.filter((c) => c.type === 'INCOME')
  const expenseCategories = active.filter((c) => c.type === 'EXPENSE')

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
    <div className="space-y-6 max-w-6xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">Configuración</h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Preferencias generales y administración de categorías
          </p>
        </div>
      </header>

      {/* Main Categories Card */}
      <div className="bg-[#141414] border border-white/5 rounded-3xl p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4 pb-6 border-b border-white/5">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Categorías</h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Organizá cómo clasificás tus ingresos y gastos
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="bg-gold hover:bg-gold-light text-black font-bold rounded-full px-5 py-2.5 text-xs sm:text-sm flex items-center gap-1.5 transition shadow-sm cursor-pointer shrink-0"
          >
            <Icon name="plus" size={16} />
            Nueva categoría
          </button>
        </div>

        <StateWrapper
          loading={categories.loading}
          error={categories.error}
          onRetry={() => void categories.reload()}
        >
          {active.length === 0 ? (
            <div className="py-12">
              <EmptyState title="Sin categorías" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
              {/* Income Column */}
              <div>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-income flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-income" aria-hidden="true" />
                    Ingresos ({incomeCategories.length})
                  </h3>
                </div>
                {incomeCategories.length === 0 ? (
                  <p className="text-xs text-neutral-500 italic p-4 bg-[#18181b] rounded-2xl border border-white/5">
                    No hay categorías de ingreso activas
                  </p>
                ) : (
                  <ul className="space-y-2.5">
                    {incomeCategories.map((category, index) => (
                      <li
                        key={category.id}
                        className="bg-[#18181b] border border-white/5 hover:border-white/10 rounded-2xl p-3.5 sm:p-4 flex items-center justify-between gap-3 transition"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <CategoryDot category={category} index={index} />
                          <span className="text-sm font-medium text-white truncate">
                            {category.name}
                          </span>
                        </div>
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
              </div>

              {/* Expense Column */}
              <div>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-expense flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-expense" aria-hidden="true" />
                    Gastos ({expenseCategories.length})
                  </h3>
                </div>
                {expenseCategories.length === 0 ? (
                  <p className="text-xs text-neutral-500 italic p-4 bg-[#18181b] rounded-2xl border border-white/5">
                    No hay categorías de gasto activas
                  </p>
                ) : (
                  <ul className="space-y-2.5">
                    {expenseCategories.map((category, index) => (
                      <li
                        key={category.id}
                        className="bg-[#18181b] border border-white/5 hover:border-white/10 rounded-2xl p-3.5 sm:p-4 flex items-center justify-between gap-3 transition"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <CategoryDot category={category} index={index} />
                          <span className="text-sm font-medium text-white truncate">
                            {category.name}
                          </span>
                        </div>
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
              </div>
            </div>
          )}

          {inactive.length > 0 && (
            <details className="mt-8 pt-6 border-t border-white/5">
              <summary className="text-xs font-semibold uppercase tracking-wider text-neutral-400 cursor-pointer hover:text-white transition">
                {inactive.length} categoría{inactive.length === 1 ? '' : 's'} dada{inactive.length === 1 ? '' : 's'} de baja
              </summary>
              <ul className="mt-3 space-y-2">
                {inactive.map((category, index) => (
                  <li
                    key={category.id}
                    className="flex items-center gap-3 py-2.5 px-3 rounded-xl bg-white/5"
                  >
                    <CategoryDot category={category} index={index} />
                    <span className="text-neutral-500 line-through flex-1 text-sm truncate">
                      {category.name} ({category.type === 'INCOME' ? 'Ingreso' : 'Gasto'})
                    </span>
                    <button
                      type="button"
                      onClick={() => void toggleActive(category)}
                      className="text-xs text-gold hover:text-gold-light font-medium underline cursor-pointer"
                    >
                      Reactivar
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </StateWrapper>
      </div>

      <div className="bg-[#141414] border border-white/5 rounded-3xl p-6 sm:p-8">
        <h2 className="text-xl font-bold text-white tracking-tight mb-2">Base de datos e infraestructura</h2>
        <p className="text-sm text-neutral-400">
          {session.data?.storage === 'postgresql'
            ? 'Todo vive en una base de datos PostgreSQL administrada y segura.'
            : 'No se pudo leer dónde están los datos.'}
        </p>
        {canSignOut && (
          <Button
            size="sm"
            variant="secondary"
            className="mt-4 rounded-full px-5 py-2 text-xs"
            onClick={() => void signOut()}
          >
            Cerrar sesión
          </Button>
        )}
      </div>

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
