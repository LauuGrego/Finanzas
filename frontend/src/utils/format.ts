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

/**
 * $1.234.567 — or $1.234.567,89 when the amount actually has cents.
 *
 * Los centavos se muestran solo cuando existen. Redondearlos era un error, no una
 * decisión de estilo: un gasto de $0,99 se imprimía como "$ 1" y uno de $450,75
 * como "$ 451". Un saldo que no coincide con la suma de los movimientos se
 * vuelve imposible de verificar a ojo. Y tampoco al revés: un monto entero no
 * necesita un ",00" que no dice nada.
 */
export function money(value: number): string {
  return Number.isInteger(value) ? formatter.format(value) : preciseFormatter.format(value)
}

/** $1.234.567,89 — always with the two decimals, for balances and limits. */
export function moneyPrecise(value: number): string {
  return preciseFormatter.format(value)
}

/** +$1.234.567 / -$1.234.567,89 */
export function signedMoney(value: number): string {
  return `${value >= 0 ? '+' : '-'}${money(Math.abs(value))}`
}

/** `450` -> `450`, `4500` -> `4.500`, `''` -> `''` */
function groupThousands(digits: string): string {
  if (!digits) return ''
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

const plainFormatter = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const plainPreciseFormatter = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * `1.000,01` — a number already in pesos, ready to sit in an amount field.
 *
 * This is NOT `formatMoneyTyped`, and the difference matters. A value coming from
 * the API is `1000.01`, where the dot is a decimal point. Fed to the typing
 * formatter it would read as a thousands separator and a peso of 1000.01 would
 * come back as 100001. So: one function for what a person types, which follows
 * the es-AR convention, and this one for what the app already knows.
 */
export function moneyEditable(value: number | string): string {
  const parsed = typeof value === 'number' ? value : parseMoney(value)
  if (!Number.isFinite(parsed)) return ''
  return Number.isInteger(parsed)
    ? plainFormatter.format(parsed)
    : plainPreciseFormatter.format(parsed)
}

/**
 * What the amount fields show while you type: `1.234.567,89`.
 *
 * The convention is the one es-AR writes and the one the placeholders teach: the
 * dot groups thousands and **the comma starts the cents**. Deciding it any other
 * way is not possible — `25.000` is twenty-five thousand and `25,00` is
 * twenty-five, and a field cannot know which one someone meant until they type
 * the comma. So it does not guess.
 *
 * Stops at two decimals, which is what the column holds. A third one would be
 * rounded away by the API with a 422 that says nothing useful, and there is no
 * reason to let someone type something that cannot be saved.
 */
export function formatMoneyTyped(raw: string): string {
  const cleaned = raw.replace(/[^\d.,]/g, '')
  const comma = cleaned.indexOf(',')

  if (comma === -1) {
    return groupThousands(cleaned.replace(/\./g, ''))
  }

  const whole = cleaned.slice(0, comma).replace(/\./g, '')
  const cents = cleaned.slice(comma + 1).replace(/\D/g, '').slice(0, 2)
  const head = groupThousands(whole)

  // The comma stays while there are no cents yet, otherwise typing "450," and
  // then the 7 would land on the other side of a separator that vanished.
  return cents ? `${head},${cents}` : `${head},`
}

/** Digits and the decimal comma before the caret: what the user has really typed. */
export function caretAnchor(text: string, caret: number): number {
  return (text.slice(0, caret).match(/[\d,]/g) ?? []).length
}

/** Where the caret belongs so it sits after the same thing it sat after before. */
export function caretFromAnchor(formatted: string, anchor: number): number {
  let seen = 0
  for (let index = 0; index < formatted.length; index += 1) {
    if (/[\d,]/.test(formatted[index])) {
      seen += 1
      if (seen === anchor) return index + 1
    }
  }
  return formatted.length
}

/**
 * Lee un monto escrito a mano: `"1.200.000"`, `"1200000"`, `"450,75"` o
 * `"450.75"`.
 *
 * Hace falta porque `Number` no entiende los separadores de miles y el placeholder
 * de los campos dice `500.000`: la pantalla enseñaba una forma de escribir que
 * después devolvía `NaN` y el error era "poné un monto mayor a cero", sin decir
 * que el problema era el punto.
 *
 * Se quitan los puntos de miles y recién entonces se cambia la coma por punto,
 * al revés: `"1.200,50"` tiene que ser 1200.5 y no 1.20050. Es la misma
 * convención que `formatMoneyTyped`, así que lo que se ve en el campo es
 * exactamente lo que se guarda.
 */
export function parseMoney(value: string): number {
  const text = value.trim()
  if (!text) return 0
  const cleaned = text.replace(/\./g, '').replace(',', '.')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
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

/**
 * `72,5%` — un decimal y coma, que es como se lee acá.
 *
 * El backend ya redondea a un decimal, así que esto sólo pone el separador y el
 * signo. `maximumFractionDigits` en 1 y no `minimumFractionDigits`: un 0 entero
 * se lee "0%", no "0,0%", y un presupuesto recién creado no debería fingir
 * precisión que no tiene.
 */
export function percent(value: number): string {
  return `${value.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`
}

/** Septiembre de 2026 */
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
