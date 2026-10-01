import type { IconName } from './Icon'

export interface NavItem {
  to: string
  label: string
  icon: IconName
}

/** Todas las secciones, en el orden en que aparecen en la barra de arriba. */
export const LINKS: NavItem[] = [
  { to: '/', label: 'Inicio', icon: 'home' },
  { to: '/agenda', label: 'Agenda', icon: 'calendar' },
  { to: '/movimientos', label: 'Movimientos', icon: 'receipt' },
  { to: '/cuentas', label: 'Cuentas', icon: 'wallet' },
  { to: '/recurrentes', label: 'Recurrentes', icon: 'repeat' },
  { to: '/presupuestos', label: 'Presupuestos', icon: 'gauge' },
  { to: '/metas', label: 'Metas', icon: 'target' },
  { to: '/estadisticas', label: 'Estadísticas', icon: 'chart' },
  { to: '/config', label: 'Configuración', icon: 'settings' },
]

/**
 * Las cuatro secciones que viven fijas en la barra del teléfono.
 *
 * Las otras cinco no están en una lista propia: salen de la hoja que abre el
 * botón dorado, que muestra `LINKS` entera. Así hay una sola lista de secciones
 * en el proyecto —la de arriba—, y agregar una pantalla nueva la hace aparecer
 * sola en la barra de la compu y en la hoja del teléfono, sin tocar dos lados.
 */
export const MOBILE_LINKS: NavItem[] = [
  { to: '/', label: 'Inicio', icon: 'home' },
  { to: '/agenda', label: 'Agenda', icon: 'calendar' },
  { to: '/recurrentes', label: 'Recurrentes', icon: 'repeat' },
  { to: '/config', label: 'Config', icon: 'settings' },
]
