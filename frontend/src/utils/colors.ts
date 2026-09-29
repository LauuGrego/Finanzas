/**
 * Category colours come from the API, but a colour can be missing (a category
 * created before the field existed, or one the user never picked). These
 * fallbacks keep every chart and dot readable instead of rendering nothing.
 */

/** Named swatches, so the picker can label itself instead of reading hex. */
export const CATEGORY_PALETTE = [
  { name: 'Ámbar', value: '#fbbf24' },
  { name: 'Azul', value: '#60a5fa' },
  { name: 'Cian', value: '#22d3ee' },
  { name: 'Violeta', value: '#c084fc' },
  { name: 'Rosa', value: '#f472b6' },
  { name: 'Verde', value: '#4ade80' },
  { name: 'Naranja', value: '#fb923c' },
  { name: 'Índigo', value: '#818cf8' },
  { name: 'Lima', value: '#a3e635' },
  { name: 'Rojo', value: '#f87171' },
] as const

/** Distinct hues that stay separable against the dark canvas. */
export const CATEGORY_COLORS = CATEGORY_PALETTE.map((item) => item.value)

export const FALLBACK_COLOR = '#94a3b8'

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
