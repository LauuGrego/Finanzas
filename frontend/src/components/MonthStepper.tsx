import { Icon } from './Icon'
import { currentPeriod, shiftPeriod } from '../utils/format'

/** Month navigation, shared by the dashboard and the calendar. */
export function MonthStepper({
  period,
  onChange,
}: {
  period: string
  onChange: (period: string) => void
}) {
  const isCurrent = period === currentPeriod()

  return (
    <div className="inline-flex items-center bg-[#141414] border border-white/10 rounded-full px-1 py-0.5 gap-0.5 shrink-0 shadow-sm">
      <button
        type="button"
        onClick={() => onChange(shiftPeriod(period, -1))}
        aria-label="Mes anterior"
        className="w-7 h-7 rounded-full grid place-items-center text-muted
                   hover:text-ink hover:bg-white/10 transition-all duration-150 cursor-pointer"
      >
        <Icon name="chevronLeft" size={14} />
      </button>
      <button
        type="button"
        onClick={() => onChange(currentPeriod())}
        className={`text-xs px-2.5 py-1 rounded-full transition-all duration-150 font-semibold cursor-pointer ${
          isCurrent
            ? 'text-white'
            : 'text-muted hover:text-white hover:bg-white/10'
        }`}
      >
        Hoy
      </button>
      <button
        type="button"
        onClick={() => onChange(shiftPeriod(period, 1))}
        aria-label="Mes siguiente"
        className="w-7 h-7 rounded-full grid place-items-center text-muted
                   hover:text-ink hover:bg-white/10 transition-all duration-150 cursor-pointer"
      >
        <Icon name="chevronRight" size={14} />
      </button>
    </div>
  )
}
