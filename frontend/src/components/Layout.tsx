import { NavLink, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'

const LINKS = [
  { to: '/', label: 'Inicio', icon: '🏠' },
  { to: '/agenda', label: 'Agenda', icon: '📅' },
  { to: '/movimientos', label: 'Movimientos', icon: '💸' },
  { to: '/cuentas', label: 'Cuentas', icon: '🏦' },
  { to: '/estadisticas', label: 'Estadísticas', icon: '📊' },
  { to: '/config', label: 'Configuración', icon: '⚙️' },
]

/** The same links render as a sidebar on desktop and a bottom bar on mobile. */
const MOBILE_LINKS = [
  { to: '/', label: 'Inicio', icon: '🏠' },
  { to: '/agenda', label: 'Agenda', icon: '📅' },
  { to: '/nuevo', label: 'Nuevo', icon: '➕' },
  { to: '/estadisticas', label: 'Stats', icon: '📊' },
  { to: '/config', label: 'Config', icon: '⚙️' },
]

function linkClass({ isActive }: { isActive: boolean }): string {
  return `flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium transition ${
    isActive ? 'bg-brand/10 text-brand' : 'text-muted hover:bg-canvas hover:text-ink'
  }`
}

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation()

  return (
    <div className="min-h-dvh md:flex">
      <aside className="hidden md:flex md:w-60 md:flex-col md:shrink-0 border-r border-line bg-surface">
        <div className="px-5 py-6">
          <p className="text-lg font-bold">💰 Finanzas</p>
          <p className="text-xs text-muted mt-0.5">Tu agenda personal</p>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.to === '/'} className={linkClass}>
              <span aria-hidden="true">{link.icon}</span>
              {link.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="flex-1 min-w-0 pb-24 md:pb-8">
        <div className="max-w-3xl mx-auto px-4 py-6 md:py-8">{children}</div>
      </main>

      <nav
        aria-label="Navegación principal"
        className="fixed bottom-0 inset-x-0 md:hidden bg-surface border-t border-line
                   grid grid-cols-5 pb-[env(safe-area-inset-bottom)]"
      >
        {MOBILE_LINKS.map((link) => {
          const active =
            link.to === '/' ? location.pathname === '/' : location.pathname.startsWith(link.to)
          const isNew = link.to === '/nuevo'
          return (
            <NavLink
              key={link.to}
              to={link.to}
              className={`flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-medium transition ${
                active ? 'text-brand' : 'text-muted'
              }`}
            >
              <span
                aria-hidden="true"
                className={`text-lg leading-none ${isNew ? 'text-brand' : ''}`}
              >
                {link.icon}
              </span>
              {link.label}
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
