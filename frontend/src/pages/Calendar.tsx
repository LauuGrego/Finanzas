import { useState } from 'react'
import { Card } from '../components/Card'
import { MonthStepper } from '../components/MonthStepper'
import { EmptyState, StateWrapper } from '../components/States'
import { TransactionItem } from '../components/TransactionItem'
import { useAsync } from '../hooks/useAsync'
import { api } from '../services/api'
import {
  currentPeriod,
  daysInMonth,
  mondayFirstWeekday,
  monthLabel,
  money,
  todayIso,
} from '../utils/format'

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

export function Calendar() {
  const [period, setPeriod] = useState(currentPeriod())
  const [selected, setSelected] = useState<string>(todayIso())

  const month = useAsync(() => api.calendar.month(period), [period])
  const recurring = useAsync(() => api.recurring.list(false), [])

  const days = month.data ?? {}
  const total = daysInMonth(period)
  const offset = mondayFirstWeekday(`${period}-01`)
  const today = todayIso()

  const recurringItems = recurring.data?.items ?? []
  const selectedDay = days[selected]
  const selectedInMonth = selected.startsWith(period)

  function goToMonth(next: string) {
    setPeriod(next)
    setSelected(`${next}-01`)
  }

  const selectedDateObj = new Date(`${selected}T12:00:00`)
  const dayNameFormatted = selectedDateObj.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const capitalizedDayName =
    dayNameFormatted.charAt(0).toUpperCase() + dayNameFormatted.slice(1)

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Agenda
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm sm:text-base font-bold text-white tracking-tight">
            {monthLabel(period)}
          </span>
          <MonthStepper period={period} onChange={goToMonth} />
        </div>
      </header>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-5 text-xs text-muted">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-gold" />
          <span>Hoy</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-income" />
          <span>Registrado</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-3 rounded border border-dashed border-zinc-500 inline-block" />
          <span>Programado por tus recurrentes</span>
        </div>
      </div>

      <StateWrapper
        loading={month.loading}
        error={month.error}
        onRetry={() => void month.reload()}
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar Table (Left 2 Cols) */}
          <div className="lg:col-span-2">
            <Card className="p-3 sm:p-5 overflow-hidden">
              {/* Day Headers */}
              <div className="grid grid-cols-7 mb-2 border-b border-white/5 pb-2">
                {WEEKDAYS.map((day) => (
                  <div
                    key={day}
                    className="text-center text-xs font-bold text-zinc-400 py-1"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Day Grid */}
              <div className="grid grid-cols-7 border-l border-t border-white/5">
                {Array.from({ length: offset }, (_, index) => (
                  <div
                    key={`blank-${index}`}
                    className="min-h-[72px] sm:min-h-[92px] border-r border-b border-white/5 bg-zinc-950/40"
                  />
                ))}

                {Array.from({ length: total }, (_, index) => {
                  const day = index + 1
                  const iso = `${period}-${String(day).padStart(2, '0')}`
                  const detail = days[iso]
                  const hasIncome = (detail?.summary.income ?? 0) > 0
                  const hasExpense = (detail?.summary.expense ?? 0) > 0
                  const netAmount = (detail?.summary.income ?? 0) - (detail?.summary.expense ?? 0)
                  const isSelected = selected === iso
                  const isToday = iso === today

                  const scheduledForDay = recurringItems.filter(
                    (r) => r.next_date === iso
                  )

                  return (
                    <button
                      type="button"
                      key={iso}
                      onClick={() => setSelected(iso)}
                      className={`min-h-[72px] sm:min-h-[92px] p-1.5 border-r border-b border-white/5 flex flex-col justify-between text-left transition-colors cursor-pointer relative group
                        ${
                          isSelected
                            ? 'bg-zinc-800/80 ring-2 ring-gold/80 z-10'
                            : 'hover:bg-white/5 bg-surface/50'
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        {isToday ? (
                          <span className="w-6 h-6 rounded-full bg-gold text-black font-bold flex items-center justify-center text-xs shadow-sm">
                            {day}
                          </span>
                        ) : (
                          <span className={`text-xs font-semibold ${isSelected ? 'text-white' : 'text-zinc-400'}`}>
                            {day}
                          </span>
                        )}

                        {(hasIncome || hasExpense) && !isToday && (
                          <span className="w-1.5 h-1.5 rounded-full bg-income shrink-0" />
                        )}
                      </div>

                      {/* Content inside cell */}
                      <div className="mt-1 space-y-1 w-full">
                        {/* Daily Total if movements exist */}
                        {detail && (hasIncome || hasExpense) && (
                          <div className="text-[10px] sm:text-xs font-bold tabular-nums text-income truncate">
                            {netAmount >= 0 ? '+' : '−'}{money(Math.abs(netAmount))}
                          </div>
                        )}

                        {/* Scheduled / Recurring badge */}
                        {scheduledForDay.slice(0, 2).map((item) => (
                          <div
                            key={item.id}
                            className="border border-dashed border-zinc-600 rounded-lg p-1 text-[10px] sm:text-xs bg-zinc-900/80 leading-tight truncate text-left w-full shadow-sm"
                          >
                            <span className="block truncate text-white font-medium">
                              {item.description || item.category?.name}
                            </span>
                            <span
                              className={`block font-bold tabular-nums ${
                                item.type === 'INCOME' ? 'text-income' : 'text-expense'
                              }`}
                            >
                              {item.type === 'INCOME' ? '+' : '−'}{money(item.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </button>
                  )
                })}
              </div>
            </Card>
          </div>

          {/* Right Column: Day Detail */}
          <div className="space-y-6">
            <Card title={capitalizedDayName}>
              {selectedDay && selectedDay.transactions.length > 0 ? (
                <>
                  <div className="mb-5 pb-4 border-b border-white/5">
                    <span className="text-xs text-muted font-medium block">Neto del día</span>
                    <span
                      className={`text-2xl sm:text-3xl font-black tabular-nums block mt-1 tracking-tight ${
                        selectedDay.summary.balance >= 0 ? 'text-income' : 'text-expense'
                      }`}
                    >
                      {selectedDay.summary.balance >= 0 ? '+' : '−'}
                      {money(Math.abs(selectedDay.summary.balance))}
                    </span>
                  </div>

                  <ul className="divide-y divide-white/5">
                    {selectedDay.transactions.map((transaction) => (
                      <li key={transaction.id}>
                        <TransactionItem transaction={transaction} showAccount />
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <EmptyState
                  title={selectedInMonth ? 'Sin movimientos' : 'Fuera del mes visible'}
                  hint={selectedInMonth ? 'Este día no registra movimientos' : undefined}
                />
              )}
            </Card>
          </div>
        </div>
      </StateWrapper>
    </div>
  )
}
