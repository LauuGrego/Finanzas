/**
 * Category colours come from the API, but a colour can be missing (a category
 * created before the field existed, or one the user never picked). These
 * fallbacks keep every chart and dot readable instead of rendering nothing.
 */

/**
 * Named swatches. Ten hues that stay separable inside a pie chart, pulled
 * toward the armour palette (copper, gold, arc cyan, steel) without going so
 * monochrome that two categories end up looking like the same slice.
 */
export const CATEGORY_PALETTE = [
  { name: 'Cobre', value: '#d98c2b' },
  { name: 'Acero', value: '#8b98a5' },
  { name: 'Cian', value: '#5fb8cf' },
  { name: 'Violeta', value: '#a98cc4' },
  { name: 'Rojo', value: '#d4655d' },
  { name: 'Verde', value: '#6fae7a' },
  { name: 'Bronce', value: '#c47d4a' },
  { name: 'Oro', value: '#c9a227' },
  { name: 'Lima', value: '#a8b04e' },
  { name: 'Rosa', value: '#c9707f' },
] as const

/** Distinct hues that stay separable against the dark canvas. */
export const CATEGORY_COLORS = CATEGORY_PALETTE.map((item) => item.value)

export const FALLBACK_COLOR = '#9d9488'

/** Deterministic pick so a category keeps the same colour across reloads. */
export function colorFor(seed: number | string): string {
  if (typeof seed === 'number') {
    return CATEGORY_COLORS[Math.abs(Math.trunc(seed)) % CATEGORY_COLORS.length]
  }
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return CATEGORY_COLORS[hash % CATEGORY_COLORS.length]
}

export function resolveColor(
  color: string | null | undefined,
  fallbackSeed?: number | string,
): string {
  if (color && /^#[0-9a-fA-F]{6}$/.test(color)) return color
  if (fallbackSeed !== undefined) return colorFor(fallbackSeed)
  return FALLBACK_COLOR
}
