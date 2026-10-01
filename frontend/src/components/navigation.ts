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
 * Los tres lugares fijos de la barra del teléfono, más el botón que abre la
 * hoja. Cuatro celdas: nueve secciones no entran en el ancho de un teléfono.
 *
 * `Nuevo` no está en `LINKS` a propósito: no es una sección, es la acción de
 * siempre.
 */
export const MOBILE_LINKS: NavItem[] = [
  { to: '/', label: 'Inicio', icon: 'home' },
  { to: '/nuevo', label: 'Nuevo', icon: 'plus' },
  { to: '/config', label: 'Config', icon: 'settings' },
]

/**
 * Lo que la hoja muestra: todo menos lo que ya está en la barra.
 *
 * Por diferencia y no escrita a mano. Las dos listas van a seguir creciendo por
 * separado y una escrita a mano se queda vieja sin que nada avise; cuando se
 * agregue una pantalla, o entra en `LINKS` y aparece sola acá, o queda
 * imposible de abrir desde el teléfono.
 */
export const SHEET_LINKS: NavItem[] = LINKS.filter(
  (link) => !MOBILE_LINKS.some((mobile) => mobile.to === link.to),
)