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

/** Recharts takes plain CSS colours, so the theme values live here too. */
const INK = '#ece6dc'
const MUTED = '#9d9488'
const GRID = '#332d26'
const SURFACE = '#221e1a'
const INCOME = '#67c8e0'
const EXPENSE = '#e06a62'
const GOLD = '#e0a32e'

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
  borderRadius: 12,
  border: `1px solid ${GRID}`,
  backgroundColor: SURFACE,
  color: INK,
  fontSize: 13,
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
    <div className="space-y-5">
      <header>
        <h1 className="text-sm font-medium uppercase tracking-wide text-muted">Estadísticas</h1>
        <p className="text-xs text-muted mt-1">Últimos 6 meses · {monthLabel(period)}</p>
      </header>

      <Card title="Gastos por categoría">
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
                    paddingAngle={2}
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
          <ul className="mt-4 space-y-1.5">
            {categoryRows.map((item, index) => (
              <li
                key={item.category_name}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    aria-hidden="true"
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: categoryData[index].fill }}
                  />
                  <span className="truncate">{item.category_name}</span>
                </span>
                <span className="tabular-nums text-muted shrink-0">
                  {money(item.total)} · {item.percentage}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Ingresos vs gastos">
        <StateWrapper
          loading={monthly.loading}
          error={monthly.error}
          onRetry={() => void monthly.reload()}
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthData}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="month" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={compact}
                  width={40}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={tooltipMoney}
                  itemStyle={{ color: INK }}
                />
                <Legend wrapperStyle={{ fontSize: 13, color: MUTED }} />
                <Bar dataKey="Ingresos" fill={INCOME} radius={[6, 6, 0, 0]} />
                <Bar dataKey="Gastos" fill={EXPENSE} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </StateWrapper>
      </Card>

      <Card title="Balance neto mensual">
        <StateWrapper
          loading={monthly.loading}
          error={monthly.error}
          onRetry={() => void monthly.reload()}
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={balanceData}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="month" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={compact}
                  width={40}
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
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: GOLD }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </StateWrapper>
      </Card>

      <Card title="Comparación mensual">
        {(monthly.data ?? []).length === 0 ? (
          <EmptyState title="Sin datos para comparar" />
        ) : (
          <ul className="divide-y divide-line">
            {(monthly.data ?? []).map((row) => (
              <li key={row.month} className="py-3.5 first:pt-1 last:pb-1">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="font-semibold capitalize text-ink">
                    {monthLabel(row.month)}
                  </span>
                  <span
                    className={`font-semibold tabular-nums text-sm sm:text-base ${
                      row.balance >= 0 ? 'text-income' : 'text-expense'
                    }`}
                  >
                    {row.balance >= 0 ? '+' : '−'}
                    {money(Math.abs(row.balance))}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs sm:text-sm bg-raised/60 rounded-xl p-3 border border-line/40">
                  <div className="min-w-0">
                    <span className="text-muted block text-[11px] mb-0.5">Ingresos</span>
                    <span className="font-semibold tabular-nums text-income break-words">
                      +{money(row.income)}
                    </span>
                  </div>
                  <div className="min-w-0 text-right">
                    <span className="text-muted block text-[11px] mb-0.5">Gastos</span>
                    <span className="font-semibold tabular-nums text-expense break-words">
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
