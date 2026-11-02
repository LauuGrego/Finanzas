import { Card } from '../components/Card'
import { EmptyState, StateWrapper } from '../components/States'
import { useAsync } from '../hooks/useAsync'
import { api } from '../services/api'
import { resolveColor } from '../utils/colors'
import { currentPeriod, money, monthLabel } from '../utils/format'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

/** Recharts styling values matching the Neo-Fintech electric yellow theme */
const INK = '#ffffff'
const MUTED = '#9ca3af'
const GRID = '#222222'
const SURFACE = '#18181b'
const INCOME = '#38bdf8'
const EXPENSE = '#ef4444'
const GOLD = '#ffcd00'

function shortMonth(period: string): string {
  const [year, month] = period.split('-')
  const date = new Date(Number(year), Number(month) - 1, 1)
  return date.toLocaleDateString('es-AR', { month: 'short' })
}

/** Charts show thousands without decimals, otherwise the axis is unreadable. */
function compact(value: number): string {
  if (Math.abs(value) >= 1000) return `${Math.round(value / 1000)}k`
  return String(Math.round(value))
}

const TOOLTIP_STYLE = {
  borderRadius: 16,
  border: '1px solid #27272a',
  backgroundColor: SURFACE,
  color: INK,
  fontSize: 13,
  padding: '10px 14px',
  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
} as const

const AXIS_TICK = { fontSize: 12, fill: MUTED } as const

/** Recharts passes ValueType | undefined, so narrow before formatting. */
function tooltipMoney(value: unknown): string {
  return money(typeof value === 'number' ? value : Number(value ?? 0))
}

export function Stats() {
  const period = currentPeriod()
  const categories = useAsync(() => api.reports.categories(period), [period])
  const monthly = useAsync(() => api.reports.monthly(6, period), [period])

  const categoryRows = categories.data ?? []
  const categoryData = categoryRows.map((item, index) => ({
    name: item.category_name,
    value: item.total,
    fill: resolveColor(item.color, item.category_id ?? index),
  }))

  const monthData = (monthly.data ?? []).map((row) => ({
    month: shortMonth(row.month),
    Ingresos: row.income,
    Gastos: row.expense,
  }))

  const balanceData = (monthly.data ?? []).map((row) => ({
    month: shortMonth(row.month),
    Balance: row.balance,
  }))

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">Estadísticas</h1>
        <p className="text-xs sm:text-sm text-neutral-400 mt-1">
          Últimos 6 meses · {monthLabel(period)}
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Gastos por categoría" className="bg-[#141414] border border-white/5 rounded-3xl p-5 sm:p-6">
          <StateWrapper
            loading={categories.loading}
            error={categories.error}
            onRetry={() => void categories.reload()}
          >
            {categoryData.length === 0 ? (
              <EmptyState title="Sin gastos en el mes" />
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="55%"
                      outerRadius="85%"
                      paddingAngle={3}
                      stroke="none"
                    >
                      {categoryData.map((item, index) => (
                        <Cell key={index} fill={item.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={tooltipMoney}
                      itemStyle={{ color: INK }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </StateWrapper>

          {categoryData.length > 0 && (
            <ul className="mt-5 space-y-2 max-h-56 overflow-y-auto pr-1">
              {categoryRows.map((item, index) => (
                <li
                  key={item.category_name}
                  className="flex items-center justify-between gap-3 text-xs sm:text-sm p-2 rounded-xl hover:bg-white/5 transition"
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span
                      aria-hidden="true"
                      className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                      style={{ backgroundColor: categoryData[index].fill }}
                    />
                    <span className="truncate text-white font-medium">{item.category_name}</span>
                  </span>
                  <span className="tabular-nums text-neutral-400 font-semibold shrink-0">
                    {money(item.total)} <span className="text-neutral-500 font-normal">({item.percentage}%)</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Ingresos vs gastos" className="bg-[#141414] border border-white/5 rounded-3xl p-5 sm:p-6">
          <StateWrapper
            loading={monthly.loading}
            error={monthly.error}
            onRetry={() => void monthly.reload()}
          >
            <div className="h-64 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="month" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={compact}
                    width={45}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={tooltipMoney}
                    itemStyle={{ color: INK }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: MUTED, paddingTop: 12 }} />
                  <Bar dataKey="Ingresos" fill={INCOME} radius={[8, 8, 0, 0]} />
                  <Bar dataKey="Gastos" fill={EXPENSE} radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </StateWrapper>
        </Card>
      </div>

      <Card title="Balance neto mensual" className="bg-[#141414] border border-white/5 rounded-3xl p-5 sm:p-6">
        <StateWrapper
          loading={monthly.loading}
          error={monthly.error}
          onRetry={() => void monthly.reload()}
        >
          <div className="h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={balanceData}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="month" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={compact}
                  width={45}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={tooltipMoney}
                  itemStyle={{ color: INK }}
                />
                <Line
                  type="monotone"
                  dataKey="Balance"
                  stroke={GOLD}
                  strokeWidth={3}
                  dot={{ r: 4, fill: GOLD, strokeWidth: 2, stroke: '#000000' }}
                  activeDot={{ r: 6, fill: GOLD }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </StateWrapper>
      </Card>

      <Card title="Comparación mensual" className="bg-[#141414] border border-white/5 rounded-3xl p-5 sm:p-6">
        {(monthly.data ?? []).length === 0 ? (
          <EmptyState title="Sin datos para comparar" />
        ) : (
          <ul className="space-y-3">
            {(monthly.data ?? []).map((row) => (
              <li key={row.month} className="bg-neutral-900/50 hover:bg-neutral-900/80 transition rounded-2xl p-4 border border-white/5">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <span className="font-bold capitalize text-white text-base">
                    {monthLabel(row.month)}
                  </span>
                  <span
                    className={`font-black tabular-nums text-base sm:text-lg ${
                      row.balance >= 0 ? 'text-income' : 'text-expense'
                    }`}
                  >
                    {row.balance >= 0 ? '+' : '−'}
                    {money(Math.abs(row.balance))}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs sm:text-sm bg-black/40 rounded-xl p-3 border border-white/5">
                  <div className="min-w-0">
                    <span className="text-neutral-400 block text-[11px] mb-0.5">Ingresos</span>
                    <span className="font-bold tabular-nums text-income break-words">
                      +{money(row.income)}
                    </span>
                  </div>
                  <div className="min-w-0 text-right">
                    <span className="text-neutral-400 block text-[11px] mb-0.5">Gastos</span>
                    <span className="font-bold tabular-nums text-expense break-words">
                      −{money(row.expense)}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
