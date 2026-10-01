import { Link, useLocation } from 'react-router-dom'
import { Icon } from './Icon'
import { Modal } from './Modal'
import { SHEET_LINKS } from './navigation'

/**
 * La hoja que abre el botón de la barra del teléfono.
 *
 * Reemplaza a la fila de enlaces que estaba arriba del home: en vez de repetir
 * en cada pantalla lo que no entra en la barra, hay un solo lugar con las
 * secciones que faltan. Usa el mismo `Modal` que el resto de la app, que en el
 * teléfono ya es una hoja que sube desde abajo.
 *
 * Muestra `SHEET_LINKS`, no `LINKS`: lo que ya está en la barra no se repite
 * acá. Es el complemento de `MOBILE_LINKS` y sale por diferencia, así que no
 * hay dos listas que se puedan desincronizar.
 */
export function SectionMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { pathname } = useLocation()

  return (
    <Modal open={open} title="Otras secciones" onClose={onClose}>
      {/* Sin aria-label: el diálogo ya se anuncia como "Otras secciones" y un
          segundo nombre igual es ruido para quien lee con lector de pantalla. */}
      <nav>
        <ul className="space-y-1">
          {SHEET_LINKS.map((link) => {
            const active = pathname.startsWith(link.to)
            return (
              <li key={link.to}>
                <Link
                  to={link.to}
                  onClick={onClose}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5
                              font-medium transition ${
                                active
                                  ? 'bg-gold/10 text-gold shadow-[inset_2px_0_0_0_var(--color-gold)]'
                                  : 'text-muted hover:bg-raised hover:text-ink'
                              }`}
                >
                  <Icon name={link.icon} size={19} />
                  {link.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </Modal>
  )
}
