import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from './Button'
import { Modal } from './Modal'

interface Props {
  open: boolean
  title: string
  submitLabel?: string
  /** Set false to block the submit, e.g. while the form is over the limit. */
  canSubmit?: boolean
  onClose: () => void
  onSubmit: (form: FormData) => Promise<void>
  children: ReactNode
  /** Shown above the fields; used for API validation errors. */
  error?: string | null
}

export function FormModal({
  open,
  title,
  submitLabel = 'Guardar',
  canSubmit = true,
  onClose,
  onSubmit,
  children,
  error,
}: Props) {
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) setSaving(false)
  }, [open])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      await onSubmit(new FormData(event.currentTarget))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} className="flex-1" type="button">
            Cancelar
          </Button>
          <Button
            className="flex-1"
            type="submit"
            form="modal-form"
            disabled={saving || !canSubmit}
          >
            {saving ? 'Guardando…' : submitLabel}
          </Button>
        </>
      }
    >
      <form id="modal-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p
            role="alert"
            className="text-sm text-expense bg-expense/10 rounded-xl px-3 py-2"
          >
            {error}
          </p>
        )}
        {children}
      </form>
    </Modal>
  )
}
