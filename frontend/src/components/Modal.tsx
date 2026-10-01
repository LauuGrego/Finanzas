import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

export function Modal({ open, title, onClose, children, footer }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Escape closes, and the page behind must not scroll while the dialog is open.
  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  if (!open) return null

  return (
    // En el teléfono esto no es un diálogo centrado sino una hoja pegada abajo,
    // y abajo está el indicador de inicio del iPhone. El padding va en el
    // overlay y no en el panel: así la hoja sube lo justo y sigue pegada al
    // borde, en vez de dejar el último botón debajo del indicador.
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center
                 bg-black/70 p-0 pb-[env(safe-area-inset-bottom)] sm:p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="bg-surface w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl
                   border border-line p-5 shadow-2xl shadow-black/50
                   max-h-[90vh] overflow-y-auto focus:outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="text-muted hover:text-ink text-xl leading-none -mt-1 px-1"
          >
            ×
          </button>
        </div>
        {children}
        {footer && <div className="mt-6 flex gap-3">{footer}</div>}
      </div>
    </div>
  )
}
