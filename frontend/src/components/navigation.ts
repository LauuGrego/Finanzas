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

/** Las mismas rutas, recortadas, para la barra de abajo del teléfono. */
export const MOBILE_LINKS: NavItem[] = [
  { to: '/', label: 'Inicio', icon: 'home' },
  { to: '/agenda', label: 'Agenda', icon: 'calendar' },
  { to: '/recurrentes', label: 'Recurrentes', icon: 'repeat' },
  { to: '/nuevo', label: 'Nuevo', icon: 'plus' },
  { to: '/config', label: 'Config', icon: 'settings' },
]

/**
 * Lo que la barra de abajo no tiene, para que quede accesible desde Inicio.
 *
 * Se calcula por diferencia en vez de escribirse a mano: las dos listas van a
 * seguir creciendo por separado y una escrita a mano se queda vieja sin que nada
 * avise. Cuando se agregue una pantalla, o entra en `LINKS` y aparece sola acá, o
 * queda imposible de abrir desde el teléfono.
 */
export const SECONDARY_LINKS: NavItem[] = LINKS.filter(
  (link) => !MOBILE_LINKS.some((mobile) => mobile.to === link.to),
)
