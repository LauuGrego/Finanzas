import { useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Icon } from './Icon'
import { LINKS, MOBILE_LINKS } from './navigation'
import { SectionMenu } from './SectionMenu'

function BrandMark() {
  return (
    <div className="w-9 h-9 rounded-2xl bg-gold grid place-items-center text-black shrink-0 shadow-sm">
      <svg
        viewBox="0 0 32 32"
        width="20"
        height="20"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="2.5" opacity="0.4" />
        <circle cx="16" cy="16" r="7" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.8" />
        <circle cx="16" cy="16" r="3.5" fill="currentColor" />
      </svg>
    </div>
  )
}

function linkClass({ isActive }: { isActive: boolean }): string {
  return `group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition-all duration-150 ${
    isActive
      ? 'bg-gold text-black font-bold shadow-sm'
      : 'text-zinc-400 hover:bg-white/5 hover:text-white font-medium'
  }`
}

export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()

  const [menu, setMenu] = useState({ path: pathname, open: false })
  const menuOpen = menu.path === pathname && menu.open
  const setMenuOpen = (open: boolean) => setMenu({ path: pathname, open })

  return (
    <div className="min-h-dvh md:flex bg-canvas">
      <aside className="hidden md:flex md:w-64 md:flex-col md:shrink-0 border-r border-line bg-sidebar">
        <div className="px-6 py-6 flex items-center gap-3">
          <BrandMark />
          <div className="min-w-0">
            <span className="block text-lg font-black tracking-tight text-white leading-tight">
              Finanzas
            </span>
            <span className="block text-xs text-muted">Tu agenda personal</span>
          </div>
        </div>
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          {LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.to === '/'} className={linkClass}>
              {({ isActive }) => (
                <>
                  <span className={isActive ? 'text-black' : 'text-zinc-400 group-hover:text-white transition-colors'}>
                    <Icon name={link.icon} size={19} />
                  </span>
                  <span>{link.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="flex-1 min-w-0 pb-28 md:pb-12 bg-canvas">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">{children}</div>
      </main>

      <nav
        aria-label="Navegación principal"
        className="fixed bottom-0 inset-x-0 md:hidden bg-sidebar/95 backdrop-blur
                   border-t border-line grid grid-cols-4 z-30
                   pb-[env(safe-area-inset-bottom)]"
      >
        {MOBILE_LINKS.map((link) => {
          const active =
            link.to === '/' ? pathname === '/' : pathname.startsWith(link.to)
          const gold = link.to === '/nuevo' ? true : active
          return (
            <NavLink
              key={link.to}
              to={link.to}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-1 py-2.5
                          text-[11px] font-medium transition-colors ${
                            gold ? 'text-gold font-bold' : 'text-muted hover:text-white'
                          }`}
            >
              <Icon name={link.icon} size={20} />
              {link.label}
            </NavLink>
          )
        })}

        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-expanded={menuOpen}
          aria-label="Más secciones"
          className={`flex flex-col items-center justify-center gap-1 py-2.5
                      text-[11px] font-medium transition-colors cursor-pointer ${
                        menuOpen ? 'text-gold font-bold' : 'text-muted hover:text-white'
                      }`}
        >
          <Icon name="grid" size={20} />
          Más
        </button>
      </nav>

      <SectionMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  )
}
