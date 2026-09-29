import { useState } from 'react'
import { Card } from '../components/Card'
import { EmptyState, StateWrapper } from '../components/States'
import { TransactionItem } from '../components/TransactionItem'
import { useAsync } from '../hooks/useAsync'
import { api } from '../services/api'
import { currentPeriod, daysInMonth, formatDate, mondayFirstWeekday, monthLabel, money, shiftPeriod, todayIso } from '../utils/format'

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

export function Calendar() {
  const [period, setPeriod] = useState(currentPeriod())
  const [selected, setSelected] = useState<string>(todayIso())

  const month = useAsync(() => api.calendar.month(period), [period])
  const days = month.data ?? {}
  const total = daysInMonth(period)
  const offset = mondayFirstWeekday(`${period}-01`)
  const today = todayIso()

  const selectedDay = days[selected]
  const selectedInMonth = selected.startsWith(period)

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-sm font-medium uppercase tracking-wide text-muted">
          {monthLabel(period)}
        </h1>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPeriod(shiftPeriod(period, -1))}
            aria-label="Mes anterior"
            className="w-8 h-8 rounded-lg hover:bg-canvas transition"
          >
            ‹
          </button>
          <button
            onClick={() => {
              setPeriod(currentPeriod())
              setSelected(todayIso())
            }}
            className="text-xs text-muted hover:text-ink px-2 py-1 rounded-lg hover:bg-canvas transition"
          >
            Hoy
          </button>
          <button
            onClick={() => setPeriod(shiftPeriod(period, 1))}
            aria-label="Mes siguiente"
            className="w-8 h-8 rounded-lg hover:bg-canvas transition"
          >
            ›
          </button>
        </div>
      </header>

      <Card>
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((day) => (
            <div key={day} className="text-center text-xs font-medium text-muted py-1">
              {day}
            </div>
          ))}
        </div>

        <StateWrapper
          loading={month.loading}
          error={month.error}
          onRetry={() => void month.reload()}
        >
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: offset }, (_, index) => (
              <div key={`blank-${index}`} />
            ))}

            {Array.from({ length: total }, (_, index) => {
              const day = index + 1
              const iso = `${period}-${String(day).padStart(2, '0')}`
              const detail = days[iso]
              const income = detail?.summary.income ?? 0
              const expense = detail?.summary.expense ?? 0
              const isSelected = selected === iso
              const isToday = iso === today

              return (
                <button
                  key={iso}
                  onClick={() => setSelected(iso)}
                  aria-label={`${formatDate(iso)}${expense ? `, ${money(expense)} en gastos` : ''}`}
                  aria-current={isSelected ? 'date' : undefined}
                  className={`aspect-square rounded-xl flex flex-col items-center justify-center
                              text-sm transition relative
                              ${isSelected
                                ? 'bg-brand text-white font-semibold'
                                : isToday
                                  ? 'bg-brand/10 text-brand font-semibold'
                                  : 'hover:bg-canvas'}`}
                >
                  <span>{day}</span>
                  {(income > 0 || expense > 0) && (
                    <span
                      aria-hidden="true"
                      className={`absolute bottom-1 w-1 h-1 rounded-full ${
                        isSelected ? 'bg-white' : income > 0 ? 'bg-income' : 'bg-expense'
                      }`}
                    />
                  )}
                </button>
              )
            })}
          </div>
        </StateWrapper>
      </Card>

      <Card title={formatDate(selected).toUpperCase()}>
        {selectedDay && selectedDay.transactions.length > 0 ? (
          <>
            <ul className="divide-y divide-line">
              {selectedDay.transactions.map((transaction) => (
                <li key={transaction.id}>
                  <TransactionItem transaction={transaction} showAccount />
                </li>
              ))}
            </ul>
            <div className="mt-4 pt-4 border-t border-line flex items-center justify-between">
              <span className="text-sm text-muted">Balance del día</span>
              <span
                className={`font-semibold tabular-nums ${
                  selectedDay.summary.balance >= 0 ? 'text-income' : 'text-expense'
                }`}
              >
                {selectedDay.summary.balance >= 0 ? '+' : '−'}
                {money(Math.abs(selectedDay.summary.balance))}
              </span>
            </div>
          </>
        ) : (
          <EmptyState
            title={selectedInMonth ? 'Sin movimientos' : 'Fuera del mes visible'}
            hint={selectedInMonth ? 'Este día no tiene movimientos cargados' : undefined}
          />
        )}
      </Card>
    </div>
  )
}
