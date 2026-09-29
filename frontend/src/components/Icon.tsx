/**
 * Inline SVG icons. Kept local so the app ships no icon-font dependency and
 * every glyph inherits `currentColor`.
 *
 * All of them share the same 24x24 grid and stroke treatment, so they sit
 * together without looking assembled from different sets.
 */

export type IconName =
  | 'home'
  | 'calendar'
  | 'receipt'
  | 'wallet'
  | 'chart'
  | 'settings'
  | 'plus'
  | 'pencil'
  | 'trash'
  | 'transfer'
  | 'income'
  | 'expense'
  | 'back'

const PATHS: Record<IconName, React.ReactNode> = {
  home: <path d="M3 10.2 12 3l9 7.2M5 9.4V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.4" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  receipt: (
    <>
      <path d="M5 3v18l2.5-1.6L10 21l2.5-1.6L15 21l2.5-1.6L20 21V3l-2.5 1.6L15 3l-2.5 1.6L10 3 7.5 4.6z" />
      <path d="M9 9h6M9 13h6" />
    </>
  ),
  wallet: (
    <>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a1 1 0 0 1 1 1v2" />
      <path d="M3 7.5V17a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H5a2 2 0 0 1-2-2Z" />
      <path d="M16.5 13.5h.01" />
    </>
  ),
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  pencil: <path d="M17 3.5a2.1 2.1 0 0 1 3 3L8 18.5l-4 1 1-4Z" />,
  trash: <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6" />,
  transfer: <path d="M4 8h13m0 0-3.5-3.5M17 8l-3.5 3.5M20 16H7m0 0 3.5-3.5M7 16l3.5 3.5" />,
  income: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  expense: <path d="M3 7l6 6 4-4 8 8M15 17h6v-6" />,
  back: <path d="M15 5l-7 7 7 7" />,
}

interface Props {
  name: IconName
  size?: number
  className?: string
}

export function Icon({ name, size = 20, className = '' }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      {PATHS[name]}
    </svg>
  )
}
