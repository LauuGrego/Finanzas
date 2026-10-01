import { useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Icon } from './Icon'
import { LINKS, MOBILE_LINKS } from './navigation'
import { SectionMenu } from './SectionMenu'

/** The arc reactor: a ring with a lit core, used as the app's mark. */
function Mark() {
  return (
    <svg
      viewBox="0 0 32 32"
      width="28"
      height="28"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.45" />
      <circle cx="16" cy="16" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.7" />
      <circle cx="16" cy="16" r="3.5" fill="currentColor" />
    </svg>
  )
}

function linkClass({ isActive }: { isActive: boolean }): string {
  // The active row gets a gold edge, like a lit strip on the suit.
  return `flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium transition ${
    isActive
      ? 'bg-gold/10 text-gold shadow-[inset_2px_0_0_0_var(--color-gold)]'
      : 'text-muted hover:bg-raised hover:text-ink'
  }`
}

export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()

  // La hoja tiene que cerrarse sola al cambiar de pantalla: si no, el botón
  // atrás del teléfono la deja abierta encima de la página nueva. Se guarda
  // junto con la ruta en la que se abrió y se deriva acá, en vez de corregirlo
  // con un effect: la de antes ya no aplica y no hace falta otro render.
  const [menu, setMenu] = useState({ path: pathname, open: false })
  const menuOpen = menu.path === pathname && menu.open
  const setMenuOpen = (open: boolean) => setMenu({ path: pathname, open })

  return (
    <div className="min-h-dvh md:flex">
      <aside className="hidden md:flex md:w-60 md:flex-col md:shrink-0 border-r border-line bg-surface">
        <div className="px-5 py-6 flex items-center gap-3">
          <span className="text-gold">
            <Mark />
          </span>
          <span>
            <span className="block text-lg font-bold tracking-tight">Finanzas</span>
            <span className="block text-xs text-muted">Tu agenda personal</span>
          </span>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.to === '/'} className={linkClass}>
              <Icon name={link.icon} size={19} />
              {link.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="flex-1 min-w-0 pb-28 md:pb-10">
        <div className="max-w-3xl mx-auto px-4 py-6 md:py-8">{children}</div>
      </main>

      <nav
        aria-label="Navegación principal"
        className="fixed bottom-0 inset-x-0 md:hidden bg-surface/95 backdrop-blur
                   border-t border-line grid grid-cols-4
                   pb-[env(safe-area-inset-bottom)]"
      >
        {MOBILE_LINKS.map((link) => {
          const active =
            link.to === '/' ? pathname === '/' : pathname.startsWith(link.to)
          // `Nuevo` no es una sección: es la acción de siempre, así que lleva el
          // dorado siempre y no solo cuando estás parado en esa pantalla.
          const gold = link.to === '/nuevo' ? true : active
          return (
            <NavLink
              key={link.to}
              to={link.to}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-1 py-2.5
                          text-[11px] font-medium transition ${
                            gold ? 'text-gold' : 'text-muted'
                          }`}
            >
              <Icon name={link.icon} size={21} />
              {link.label}
            </NavLink>
          )
        })}

        {/* Abre la hoja con las secciones que no están en la barra. Va en gris
            como el resto y no en dorado, porque el dorado quedó para `Nuevo`. */}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-expanded={menuOpen}
          aria-label="Más secciones"
          className={`flex flex-col items-center justify-center gap-1 py-2.5
                      text-[11px] font-medium transition ${
                        menuOpen ? 'text-gold' : 'text-muted'
                      }`}
        >
          <Icon name="grid" size={21} />
          Más
        </button>
      </nav>

      <SectionMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  )
}
