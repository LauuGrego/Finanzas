import { currentPeriod, shiftPeriod } from '../utils/format'

/** Month navigation, shared by the dashboard and the calendar. */
export function MonthStepper({
  period,
  onChange,
}: {
  period: string
  onChange: (period: string) => void
}) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        onClick={() => onChange(shiftPeriod(period, -1))}
        aria-label="Mes anterior"
        className="w-8 h-8 rounded-lg grid place-items-center text-muted
                   hover:text-ink hover:bg-raised transition"
      >
        ‹
      </button>
      <button
        onClick={() => onChange(currentPeriod())}
        className="text-xs text-muted hover:text-ink px-2 py-1 rounded-lg hover:bg-raised transition"
      >
        Hoy
      </button>
      <button
        onClick={() => onChange(shiftPeriod(period, 1))}
        aria-label="Mes siguiente"
        className="w-8 h-8 rounded-lg grid place-items-center text-muted
                   hover:text-ink hover:bg-raised transition"
      >
        ›
      </button>
    </div>
  )
}
