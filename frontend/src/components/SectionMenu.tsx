import { Link, useLocation } from 'react-router-dom'
import { Icon } from './Icon'
import { Modal } from './Modal'
import { LINKS } from './navigation'

/**
 * La hoja que abre el botón dorado de la barra del teléfono.
 *
 * Reemplaza a la fila de enlaces que estaba arriba del home: en vez de repetir
 * en cada pantalla lo que no entra en la barra, hay un solo lugar con todas las
 * secciones. Usa el mismo `Modal` que el resto de la app, que en el teléfono ya
 * es una hoja que sube desde abajo.
 *
 * Arriba va la acción, no una sección más: "Nuevo movimiento" es lo único que
 * se hace todos los días y por eso lleva el dorado. `/nuevo` no está en `LINKS`
 * a propósito, porque no es una sección sino una acción.
 */
export function SectionMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { pathname } = useLocation()

  return (
    <Modal open={open} title="Todas las secciones" onClose={onClose}>
      {/* Sin aria-label: el diálogo ya se anuncia como "Todas las secciones" y
          un segundo nombre igual es ruido para quien lee con lector de pantalla. */}
      <nav>
        <Link
          to="/nuevo"
          onClick={onClose}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 mb-4
                     font-semibold text-gold bg-gold/10 transition
                     hover:bg-gold/15"
        >
          <Icon name="plus" size={19} />
          Nuevo movimiento
        </Link>

        <ul className="space-y-1">
          {LINKS.map((link) => {
            const active = link.to === '/' ? pathname === '/' : pathname.startsWith(link.to)
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
