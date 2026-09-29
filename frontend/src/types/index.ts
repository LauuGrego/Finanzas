export type TransactionType = 'EXPENSE' | 'INCOME'
export type CategoryType = 'EXPENSE' | 'INCOME'
export type AccountType = 'BANK' | 'WALLET' | 'CASH' | 'CREDIT' | 'OTHER'

export interface Account {
  id: number
  name: string
  type: AccountType
  initial_balance: number
  balance: number
  active: boolean
  created_at: string
}

export interface AccountList {
  accounts: Account[]
  total_balance: number
}

export interface Category {
  id: number
  name: string
  type: CategoryType
  color: string | null
  active: boolean
  created_at: string
}

export interface CategoryRef {
  id: number
  name: string
  color: string | null
}

export interface Transaction {
  id: number
  account_id: number
  category_id: number | null
  type: TransactionType
  amount: number
  description: string | null
  date: string
  transfer_id: string | null
  created_at: string
  account_name: string | null
  category: CategoryRef | null
  signed_amount: number
}

export interface TransactionPage {
  items: Transaction[]
  total: number
  limit: number
  offset: number
}

export interface PeriodSummary {
  income: number
  expense: number
  balance: number
}

export interface CategoryTotal {
  category_id: number | null
  category_name: string
  color: string | null
  total: number
  percentage: number
  count: number
}

export interface UpcomingItem {
  date: string
  description: string
  amount: number
  kind: 'recurring' | 'installment'
  category: CategoryRef | null
}

export interface Dashboard {
  month: string
  available_balance: number
  month_summary: PeriodSummary
  expenses_by_category: CategoryTotal[]
  recent_transactions: Transaction[]
  upcoming: UpcomingItem[]
}

export interface MonthComparison {
  month: string
  income: number
  expense: number
  balance: number
}

export interface DayDetail {
  date: string
  summary: PeriodSummary
  transactions: Transaction[]
}

export interface Transfer {
  transfer_id: string
  date: string
  amount: number
  description: string | null
  from_account: CategoryRef
  to_account: CategoryRef
  movements: Transaction[]
}

export interface TransactionPayload {
  account_id: number
  category_id: number | null
  type: TransactionType
  amount: number
  description: string | null
  date: string
}

export interface TransferPayload {
  from_account_id: number
  to_account_id: number
  amount: number
  description: string | null
  date: string
}
