import type {
  Account,
  AccountList,
  Category,
  Dashboard,
  DayDetail,
  MonthComparison,
  CategoryTotal,
  Transaction,
  TransactionPage,
  TransactionPayload,
  Transfer,
  TransferPayload,
} from '../types'

const BASE = '/api'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })

  if (!response.ok) {
    let message = 'Ocurrió un error'
    try {
      const body = await response.json()
      message = typeof body.detail === 'string' ? body.detail : formatDetail(body.detail)
    } catch {
      // The response was not JSON; keep the generic message.
    }
    throw new ApiError(message, response.status)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/** FastAPI returns validation errors as a list of { loc, msg }. */
function formatDetail(detail: unknown): string {
  if (Array.isArray(detail)) {
    return detail
      .map((item) => (typeof item?.msg === 'string' ? item.msg : ''))
      .filter(Boolean)
      .join(' · ')
  }
  return 'Revisá los datos ingresados'
}

function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

export const api = {
  accounts: {
    list: (includeInactive = false) =>
      request<AccountList>(`/accounts${query({ include_inactive: includeInactive })}`),
    create: (payload: Partial<Account>) =>
      request<Account>('/accounts', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id: number, payload: Partial<Account>) =>
      request<Account>(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    remove: (id: number) => request<void>(`/accounts/${id}`, { method: 'DELETE' }),
  },
  categories: {
    list: (type?: string, includeInactive = false) =>
      request<Category[]>(`/categories${query({ type, include_inactive: includeInactive })}`),
    create: (payload: Partial<Category>) =>
      request<Category>('/categories', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id: number, payload: Partial<Category>) =>
      request<Category>(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    remove: (id: number) => request<void>(`/categories/${id}`, { method: 'DELETE' }),
  },
  transactions: {
    list: (params: {
      month?: string
      start?: string
      end?: string
      account_id?: number
      category_id?: number
      type?: string
      search?: string
      limit?: number
      offset?: number
    } = {}) => request<TransactionPage>(`/transactions${query(params)}`),
    create: (payload: TransactionPayload) =>
      request<Transaction>('/transactions', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id: number, payload: Partial<TransactionPayload>) =>
      request<Transaction>(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    remove: (id: number) => request<void>(`/transactions/${id}`, { method: 'DELETE' }),
  },
  transfers: {
    create: (payload: TransferPayload) =>
      request<Transfer>('/transfers', { method: 'POST', body: JSON.stringify(payload) }),
  },
  dashboard: {
    get: (month?: string) => request<Dashboard>(`/dashboard${query({ month })}`),
  },
  reports: {
    monthly: (months = 6, month?: string) =>
      request<MonthComparison[]>(`/reports/monthly${query({ months, month })}`),
    balanceEvolution: (months = 6, month?: string) =>
      request<MonthComparison[]>(`/reports/balance-evolution${query({ months, month })}`),
    categories: (month?: string) =>
      request<CategoryTotal[]>(`/reports/categories${query({ month })}`),
  },
  calendar: {
    day: (day: string) => request<DayDetail>(`/calendar/day${query({ day })}`),
    month: (month: string) => request<Record<string, DayDetail>>(`/calendar/month${query({ month })}`),
  },
}
