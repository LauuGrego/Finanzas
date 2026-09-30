const formatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

const preciseFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
})

/** $1.234.567 — for headline figures where cents are noise. */
export function money(value: number): string {
  return formatter.format(value)
}

/** $1.234.567,89 — where the cents actually matter. */
export function moneyPrecise(value: number): string {
  return preciseFormatter.format(value)
}

/** +$1.234.567 / -$1.234.567 */
export function signedMoney(value: number): string {
  return `${value >= 0 ? '+' : '-'}${formatter.format(Math.abs(value))}`
}

/** 28/09/2026 */
export function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}

/** 28 sep */
export function shortDate(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00`)
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
}

/**-septiembre 2026 */
export function monthLabel(period: string): string {
  const [year, month] = period.split('-')
  const date = new Date(Number(year), Number(month) - 1, 1)
  const label = date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function todayIso(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

export function currentPeriod(): string {
  return todayIso().slice(0, 7)
}

export function shiftPeriod(period: string, delta: number): string {
  const [year, month] = period.split('-').map(Number)
  const index = year * 12 + (month - 1) + delta
  const nextYear = Math.floor(index / 12)
  const nextMonth = (index % 12) + 1
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`
}

/** Monday-first weekday index, matching the calendar grid. */
export function mondayFirstWeekday(iso: string): number {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00`)
  return (date.getDay() + 6) % 7
}

export function daysInMonth(period: string): number {
  const [year, month] = period.split('-').map(Number)
  return new Date(year, month, 0).getDate()
}

/**
 * "hoy", "mañana", "en 3 días", "hace 2 meses".
 *
 * A recurring rule is about when it fires next, so the answer that matters is
 * how far away that is, not the date again. Parsed at midday so a timezone
 * either side of midnight cannot shift the day out from under the comparison.
 */
export function relativeDay(iso: string, from = todayIso()): string {
  const target = Date.parse(`${iso.slice(0, 10)}T12:00:00`)
  const base = Date.parse(`${from.slice(0, 10)}T12:00:00`)
  const days = Math.round((target - base) / 86400000)

  if (days === 0) return 'hoy'
  if (days === 1) return 'mañana'
  if (days === -1) return 'ayer'

  // Days first, up to about a month. Rounding straight to months would call
  // six days ago "hace un mes", which is the kind of small lie a date is not
  // supposed to tell.
  if (days > 0) return days < 31 ? `en ${days} días` : formatDate(iso)
  const elapsed = -days
  if (elapsed < 31) return `hace ${elapsed} días`
  const months = Math.round(elapsed / 30)
  return months < 2 ? 'hace un mes' : `hace ${months} meses`
}

/** "Todos los meses" / "Todas las semanas". */
export const FREQUENCY_LABELS: Record<string, string> = {
  MONTHLY: 'Todos los meses',
  WEEKLY: 'Todas las semanas',
}
