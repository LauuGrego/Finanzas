export type TransactionType = 'EXPENSE' | 'INCOME'
export type CategoryType = 'EXPENSE' | 'INCOME'
export type AccountType = 'BANK' | 'WALLET' | 'CASH' | 'CREDIT' | 'OTHER'
export type Frequency = 'WEEKLY' | 'MONTHLY'

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

/**
 * A rule, not a movement: "every month on the 3rd, Netflix, 15.000 from the
 * bank". It writes real movements when it comes due, and from then on those
 * are ordinary transactions you can edit or delete on their own.
 */
export interface Recurring {
  id: number
  account_id: number
  category_id: number
  amount: number
  description: string | null
  frequency: Frequency
  next_date: string
  active: boolean
  times_charged: number
  created_at: string
  category: CategoryRef | null
  account_name: string | null
  /** Comes from the category, which is why the payload has no `type`. */
  type: TransactionType
}

export interface RecurringList {
  items: Recurring[]
  total: number
}

export interface RecurringPayload {
  account_id: number
  category_id: number
  amount: number
  description: string | null
  frequency: Frequency
  next_date: string
}

/**
 * Una compra en cuotas: "la tele, 12 meses de 50.000 con la tarjeta". Tiene la
 * misma forma que un recurrente pero con fin, así que se cobra una vez por mes y
 * se termina sola cuando se registra la última.
 *
 * `amount` es lo que se cobra cada mes, no el total. Así es como se lee el
 * resumen de la tarjeta y es la única forma exacta: un total que no se divide
 * justo dejaría centavos que no entran en la cuota. El total y lo que falta se
 * calculan y vienen en la respuesta.
 */
export interface Installment {
  id: number
  account_id: number
  category_id: number
  amount: number
  description: string | null
  total_count: number
  next_date: string
  active: boolean
  paid_count: number
  /** El número de la que viene, empezando en 1, para "cuota 4 de 12". */
  current_installment: number
  remaining: number
  total_amount: number
  total_pending: number
  finished: boolean
  created_at: string
  category: CategoryRef | null
  account_name: string | null
  type: TransactionType
}

export interface InstallmentList {
  items: Installment[]
  total: number
}

export interface InstallmentPayload {
  account_id: number
  category_id: number
  amount: number
  description: string | null
  total_count: number
  next_date: string
}

/**
 * Un límite mensual para una categoría: "en Comida no paso de 200.000 este mes".
 *
 * No guarda el gastado ni lo que queda: los dos salen de los movimientos cada
 * vez que se pide la lista, por la misma razón que un saldo de cuenta no se
 * guarda. Si se guardaran, habría que mantenerlos al día con cada edición,
 * cada borrado y cada cuota que se registra sola.
 */
export interface Budget {
  id: number
  category_id: number
  /** 'YYYY-MM' */
  period: string
  amount: number
  active: boolean
  spent: number
  /** Puede ser negativo cuando ya te pasaste. */
  remaining: number
  percentage: number
  over: boolean
  created_at: string
  category: CategoryRef | null
}

export interface BudgetSummary {
  amount: number
  spent: number
  remaining: number
  percentage: number
  count: number
  over_count: number
}

export interface BudgetList {
  items: Budget[]
  total: number
  summary: BudgetSummary
}

export interface BudgetPayload {
  category_id: number
  amount: number
  period: string
  /** Cuántos meses seguidos se crean; 1 = solo este mes. */
  repeat_months: number
}

export interface BudgetCreated {
  items: Budget[]
  created: number
  skipped: number
}

/**
 * Una meta de ahorro.
 *
 * `current_amount` lo carga la persona a mano y no sale de ningún movimiento:
 * una meta es un compromiso, no una transacción.
 */
export interface Goal {
  id: number
  name: string
  target_amount: number
  current_amount: number
  /** 'YYYY-MM-DD'; puede venir null, y entonces no hay fecha. */
  deadline: string | null
  active: boolean
  /** Porcentaje juntado, un decimal. Puede pasar de 100. */
  progress: number
  /** Nunca negativo: si ya se pasó, queda en 0. */
  remaining: number
  /** Negativo si la fecha ya pasó; null si no hay fecha. */
  days_left: number | null
  status: 'en_progreso' | 'cumplida' | 'vencida'
  created_at: string
}

export interface GoalList {
  items: Goal[]
  total: number
}

export interface GoalPayload {
  name: string
  target_amount: number
  current_amount: number
  deadline: string | null
}

/** Lo que contesta el modal de movimiento: hay presupuesto o no en esa categoría. */
export interface BudgetCheck {
  has_budget: boolean
  period: string
  amount: number
  spent: number
  remaining: number
  percentage: number
  over: boolean
  category: CategoryRef | null
}
