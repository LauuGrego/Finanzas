import { Link } from 'react-router-dom'
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
const SURFACE = '#141414'
const INCOME = '#52c7e8'
const EXPENSE = '#ef6868'
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
  const evolution = useAsync(() => api.reports.balanceEvolution(6, period), [period])

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

  const balanceData = (evolution.data ?? []).map((row) => ({
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

      {/* Gastos por categoría Card */}
      <div className="bg-[#141414] border border-white/5 rounded-3xl p-6 sm:p-7">
        <h2 className="text-xl font-bold text-white tracking-tight mb-4">
          Gastos por categoría
        </h2>

        <StateWrapper
          loading={categories.loading}
          error={categories.error}
          onRetry={() => void categories.reload()}
        >
          {categoryData.length === 0 ? (
            <div className="py-10 text-center flex flex-col items-center justify-center">
              <p className="text-sm text-neutral-400">
                Todavía no registraste gastos en {monthLabel(period)}.
              </p>
              <Link
                to="/movimientos"
                className="mt-3 text-xs font-bold text-gold hover:text-gold-light inline-flex items-center gap-1 transition"
              >
                <span>Registrar un gasto</span>
                <span aria-hidden="true">&rarr;</span>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
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

              <ul className="space-y-2.5 max-h-64 overflow-y-auto pr-1 divide-y divide-white/5">
                {categoryRows.map((item, index) => (
                  <li
                    key={item.category_name}
                    className="pt-2.5 first:pt-0 flex items-center justify-between gap-3 text-xs sm:text-sm"
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <span
                        aria-hidden="true"
                        className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                        style={{ backgroundColor: categoryData[index].fill }}
                      />
                      <span className="truncate text-white font-medium">{item.category_name}</span>
                    </span>
                    <span className="tabular-nums text-neutral-300 font-semibold shrink-0">
                      {money(item.total)}{' '}
                      <span className="text-neutral-500 font-normal text-xs">({item.percentage}%)</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </StateWrapper>
      </div>

      {/* Middle Grid: Ingresos y Gastos & Balance neto */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ingresos vs Gastos */}
        <div className="bg-[#141414] border border-white/5 rounded-3xl p-6 sm:p-7">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
              Ingresos y gastos
            </h2>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-neutral-400">
                <span className="w-2 h-2 rounded-full bg-[#52c7e8]" aria-hidden="true" />
                Ingresos
              </span>
              <span className="flex items-center gap-1.5 text-neutral-400">
                <span className="w-2 h-2 rounded-full bg-[#ef6868]" aria-hidden="true" />
                Gastos
              </span>
            </div>
          </div>

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
                  <Bar dataKey="Ingresos" fill={INCOME} radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Gastos" fill={EXPENSE} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </StateWrapper>
        </div>

        {/* Balance neto por mes */}
        <div className="bg-[#141414] border border-white/5 rounded-3xl p-6 sm:p-7">
          <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight mb-4">
            Balance neto por mes
          </h2>

          <StateWrapper
            loading={evolution.loading}
            error={evolution.error}
            onRetry={() => void evolution.reload()}
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
        </div>
      </div>

      {/* Mes por mes Table */}
      <div className="bg-[#141414] border border-white/5 rounded-3xl p-6 sm:p-7">
        <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight mb-4">
          Mes por mes
        </h2>

        {(monthly.data ?? []).length === 0 ? (
          <EmptyState title="Sin datos para comparar" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                  <th scope="col" className="pb-3 pr-4 font-bold">Mes</th>
                  <th scope="col" className="pb-3 px-4 text-right font-bold">Ingresos</th>
                  <th scope="col" className="pb-3 px-4 text-right font-bold">Gastos</th>
                  <th scope="col" className="pb-3 pl-4 text-right font-bold">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm">
                {(monthly.data ?? []).map((row) => (
                  <tr key={row.month} className="hover:bg-white/[0.02] transition">
                    <td className="py-3.5 pr-4 font-semibold text-white capitalize whitespace-nowrap">
                      {monthLabel(row.month)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-income tabular-nums whitespace-nowrap">
                      +{money(row.income)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-expense tabular-nums whitespace-nowrap">
                      −{money(row.expense)}
                    </td>
                    <td
                      className={`py-3.5 pl-4 text-right font-black tabular-nums whitespace-nowrap ${
                        row.balance >= 0 ? 'text-gold' : 'text-expense'
                      }`}
                    >
                      {row.balance >= 0 ? '+' : '−'}
                      {money(Math.abs(row.balance))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
