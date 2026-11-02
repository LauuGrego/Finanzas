import { useState } from 'react'
import { Button } from './Button'
import { Modal } from './Modal'

interface Props {
  open: boolean
  title: string
  message: string
  onConfirm: () => void | Promise<void>
  onClose: () => void
  confirmLabel?: string
}

export function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onClose,
  confirmLabel = 'Eliminar',
}: Props) {
  const [busy, setBusy] = useState(false)

  async function handleConfirm() {
    setBusy(true)
    try {
      await onConfirm()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" className="flex-1 rounded-full" onClick={onClose} type="button">
            Cancelar
          </Button>
          <Button
            type="button"
            variant="danger"
            className="flex-1 rounded-full"
            onClick={handleConfirm}
            disabled={busy}
          >
            {busy ? 'Eliminando…' : confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-neutral-400 text-sm leading-relaxed">{message}</p>
    </Modal>
  )
}
