import { Card } from '../components/Card'
import { EmptyState, StateWrapper } from '../components/States'
import { useAsync } from '../hooks/useAsync'
import { api } from '../services/api'
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

const PALETTE = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#65a30d']

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
  border: '1px solid #e2e8f0',
  fontSize: 13,
} as const

/** Recharts passes ValueType | undefined, so narrow before formatting. */
function tooltipMoney(value: unknown): string {
  return money(typeof value === 'number' ? value : Number(value ?? 0))
}

export function Stats() {
  const period = currentPeriod()
  const categories = useAsync(() => api.reports.categories(period), [period])
  const monthly = useAsync(() => api.reports.monthly(6, period), [period])
  const evolution = useAsync(() => api.reports.balanceEvolution(6, period), [period])

  const categoryData = (categories.data ?? []).map((item) => ({
    name: `${item.icon ?? ''} ${item.category_name}`.trim(),
    value: item.total,
  }))

  const monthData = (monthly.data ?? []).map((row) => ({
    month: shortMonth(row.month),
    Ingresos: row.income,
    Gastos: row.expense,
  }))

  const lineData = (evolution.data ?? []).map((row) => ({
    month: shortMonth(row.month),
    Saldo: row.balance,
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
                  >
                    {categoryData.map((_, index) => (
                      <Cell key={index} fill={PALETTE[index % PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={tooltipMoney}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </StateWrapper>

        {categoryData.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {(categories.data ?? []).map((item, index) => (
              <li key={item.category_name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: PALETTE[index % PALETTE.length] }}
                  />
                  {item.category_name}
                </span>
                <span className="tabular-nums text-muted">
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
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={compact}
                  width={40}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={tooltipMoney} />
                <Legend wrapperStyle={{ fontSize: 13 }} />
                <Bar dataKey="Ingresos" fill="#059669" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Gastos" fill="#dc2626" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </StateWrapper>
      </Card>

      <Card title="Evolución del saldo">
        <StateWrapper
          loading={evolution.loading}
          error={evolution.error}
          onRetry={() => void evolution.reload()}
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={compact}
                  width={40}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={tooltipMoney} />
                <Line
                  type="monotone"
                  dataKey="Saldo"
                  stroke="#4f46e5"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </StateWrapper>
      </Card>

      <Card title="Comparación mensual">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted text-left">
                <th className="font-medium pb-2">Mes</th>
                <th className="font-medium pb-2 text-right">Ingresos</th>
                <th className="font-medium pb-2 text-right">Gastos</th>
                <th className="font-medium pb-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(monthly.data ?? []).map((row) => (
                <tr key={row.month}>
                  <td className="py-2.5">{monthLabel(row.month)}</td>
                  <td className="py-2.5 text-right tabular-nums text-income">
                    {money(row.income)}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-expense">
                    {money(row.expense)}
                  </td>
                  <td
                    className={`py-2.5 text-right tabular-nums font-medium ${
                      row.balance >= 0 ? 'text-income' : 'text-expense'
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
      </Card>
    </div>
  )
}
