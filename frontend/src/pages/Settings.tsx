import { useState } from 'react'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyState, StateWrapper } from '../components/States'
import { FormModal } from '../components/FormModal'
import { useAsync } from '../hooks/useAsync'
import { api } from '../services/api'
import type { Category, CategoryType } from '../types'

export function Settings() {
  const categories = useAsync(() => api.categories.list(undefined, true), [])
  const [editing, setEditing] = useState<Category | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<Category | null>(null)
  const [error, setError] = useState<string | null>(null)

  const items = categories.data ?? []
  const active = items.filter((c) => c.active)
  const inactive = items.filter((c) => !c.active)

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
      icon: (form.get('icon') as string)?.trim() || null,
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
            + Nueva
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
              {active.map((category) => (
                <li key={category.id} className="flex items-center gap-3 py-2.5">
                  <span aria-hidden="true" className="text-lg w-7 text-center">
                    {category.icon ?? '•'}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate">{category.name}</span>
                    <span className="text-xs text-muted">
                      {category.type === 'EXPENSE' ? 'Gasto' : 'Ingreso'}
                    </span>
                  </span>
                  <button
                    onClick={() => setEditing(category)}
                    aria-label={`Editar ${category.name}`}
                    className="text-muted hover:text-ink px-2 py-1 rounded-lg hover:bg-canvas transition"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => setDeleting(category)}
                    aria-label={`Dar de baja ${category.name}`}
                    className="text-muted hover:text-expense px-2 py-1 rounded-lg hover:bg-canvas transition"
                  >
                    🗑️
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
                {inactive.map((category) => (
                  <li key={category.id} className="flex items-center gap-3 py-1.5">
                    <span className="text-muted line-through flex-1 text-sm">
                      {category.icon} {category.name}
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

        <div>
          <label className="label" htmlFor="cat-icon">
            Ícono
          </label>
          <input
            id="cat-icon"
            name="icon"
            type="text"
            maxLength={4}
            placeholder="🍔"
            defaultValue={editing?.icon ?? ''}
            className="input"
          />
          <p className="text-xs text-muted mt-1.5">Un emoji, opcional.</p>
        </div>
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
