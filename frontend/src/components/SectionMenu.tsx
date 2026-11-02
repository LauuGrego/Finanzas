import { Link, useLocation } from 'react-router-dom'
import { Icon } from './Icon'
import { Modal } from './Modal'
import { SHEET_LINKS } from './navigation'

export function SectionMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { pathname } = useLocation()

  return (
    <Modal open={open} title="Otras secciones" onClose={onClose}>
      <nav>
        <ul className="space-y-1.5">
          {SHEET_LINKS.map((link) => {
            const active = pathname.startsWith(link.to)
            return (
              <li key={link.to}>
                <Link
                  to={link.to}
                  onClick={onClose}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-3
                              text-sm transition-all ${
                                active
                                  ? 'bg-gold text-black font-bold shadow-sm'
                                  : 'text-zinc-400 hover:bg-white/5 hover:text-white font-medium'
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
