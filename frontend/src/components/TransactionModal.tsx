import { useEffect, useState } from 'react'
import { api } from '../services/api'
import type { Account, BudgetCheck, Category, Transaction, TransactionPayload } from '../types'
import { resolveColor } from '../utils/colors'
import { resolveDefaultAccountId, useFavoriteAccount } from '../utils/favoriteAccount'
import { todayIso, money, moneyEditable, parseMoney, percent } from '../utils/format'
import { FormModal } from './FormModal'
import { Icon } from './Icon'
import { MoneyInput } from './MoneyInput'

interface Props {
  open: boolean
  accounts: Account[]
  categories: Category[]
  /** Present when editing; absent when creating. */
  transaction?: Transaction | null
  defaultType?: 'EXPENSE' | 'INCOME'
  /** Preselects an account, used when adding a movement from inside one account. */
  defaultAccountId?: number
  onClose: () => void
  onSaved: () => void
}

export function TransactionModal({
  open,
  accounts,
  categories,
  transaction,
  defaultType = 'EXPENSE',
  defaultAccountId,
  onClose,
  onSaved,
}: Props) {
  const [favoriteId] = useFavoriteAccount()
  const [error, setError] = useState<string | null>(null)
  const [type, setType] = useState<'EXPENSE' | 'INCOME'>(transaction?.type ?? defaultType)
  const [accountId, setAccountId] = useState<number>(
    transaction?.account_id ?? resolveDefaultAccountId(accounts, defaultAccountId)
  )
  const [amountText, setAmountText] = useState(
    transaction ? moneyEditable(transaction.amount) : ''
  )
  const [categoryId, setCategoryId] = useState<number>(transaction?.category_id ?? 0)
  const [date, setDate] = useState(transaction?.date ?? todayIso())
  const [budgetState, setBudgetState] = useState<{
    key: string
    data: BudgetCheck
  } | null>(null)

  useEffect(() => {
    if (open) {
      setType(transaction?.type ?? defaultType)
      setError(null)
      setAccountId(
        transaction?.account_id ?? resolveDefaultAccountId(accounts, defaultAccountId)
      )
      setAmountText(transaction ? moneyEditable(transaction.amount) : '')
      setCategoryId(transaction?.category_id ?? 0)
      setDate(transaction?.date ?? todayIso())
    }
  }, [open, defaultAccountId, accounts, defaultType, transaction])

  const editing = Boolean(transaction)
  const relevant = categories.filter((c) => c.type === type)
  const selectedCategoryId = categoryId || relevant[0]?.id || 0
  const selectedCategory = relevant.find((c) => c.id === selectedCategoryId)
  const budgetKey = [
    selectedCategoryId,
    date.slice(0, 7),
    transaction?.id ?? 0,
    type,
  ].join('|')
  const budget = budgetState?.key === budgetKey ? budgetState.data : null

  useEffect(() => {
    if (!open || type !== 'EXPENSE' || !selectedCategoryId) return
    const key = budgetKey
    let alive = true
    api.budgets
      .check(selectedCategoryId, date.slice(0, 7), transaction?.id)
      .then((data) => {
        if (alive) setBudgetState({ key, data })
      })
      .catch(() => {
        if (alive) setBudgetState(null)
      })
    return () => {
      alive = false
    }
  }, [open, type, selectedCategoryId, date, transaction?.id, budgetKey])

  const pendingAmount = type === 'EXPENSE' ? parseMoney(amountText) || 0 : 0
  const budgetProjected = (budget?.spent ?? 0) + pendingAmount
  const budgetOver = Boolean(
    budget?.has_budget && budgetProjected > budget.amount,
  )
  const budgetPercentage =
    budget?.has_budget && budget.amount > 0
      ? Math.round((budgetProjected * 1000) / budget.amount) / 10
      : 0

  async function handleSubmit(form: FormData) {
    setError(null)
    const amount = parseMoney(String(form.get('amount') ?? ''))
    if (!amount || amount <= 0) {
      setError('El monto tiene que ser mayor a cero')
      return
    }

    const payload: TransactionPayload = {
      account_id: Number(form.get('account_id')),
      category_id: Number(form.get('category_id')) || null,
      type,
      amount,
      description: (form.get('description') as string)?.trim() || null,
      date: form.get('date') as string,
    }

    try {
      if (transaction) await api.transactions.update(transaction.id, payload)
      else await api.transactions.create(payload)
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  return (
    <FormModal
      open={open}
      title={editing ? 'Editar movimiento' : type === 'EXPENSE' ? 'Nuevo gasto' : 'Nuevo ingreso'}
      submitLabel={editing ? 'Guardar cambios' : 'Guardar'}
      onClose={onClose}
      onSubmit={handleSubmit}
      error={error}
    >
      {/* Segmented Control: Gasto / Ingreso */}
      <div className="bg-black/60 p-1.5 rounded-full border border-white/10 flex gap-1.5 shadow-inner">
        <button
          type="button"
          onClick={() => {
            setType('EXPENSE')
            setCategoryId(0)
          }}
          aria-pressed={type === 'EXPENSE'}
          className={`flex-1 py-2.5 rounded-full text-xs sm:text-sm font-bold transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
            type === 'EXPENSE'
              ? 'bg-expense text-white shadow-md shadow-expense/25'
              : 'text-neutral-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Icon name="arrowUpRight" size={16} />
          Gasto
        </button>
        <button
          type="button"
          onClick={() => {
            setType('INCOME')
            setCategoryId(0)
          }}
          aria-pressed={type === 'INCOME'}
          className={`flex-1 py-2.5 rounded-full text-xs sm:text-sm font-bold transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
            type === 'INCOME'
              ? 'bg-income text-black shadow-md shadow-income/25'
              : 'text-neutral-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Icon name="arrowDownLeft" size={16} />
          Ingreso
        </button>
      </div>

      {/* Hero Amount Card */}
      <div
        className={`rounded-3xl p-5 sm:p-6 text-center border transition-all duration-200 ${
          type === 'EXPENSE'
            ? 'bg-expense/[0.04] border-white/10 focus-within:border-expense/60 focus-within:ring-2 focus-within:ring-expense/15'
            : 'bg-income/[0.04] border-white/10 focus-within:border-income/60 focus-within:ring-2 focus-within:ring-income/15'
        }`}
      >
        <span className="block text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-1.5">
          Monto
        </span>
        <div className="flex items-center justify-center gap-1.5">
          <span
            className={`text-3xl sm:text-4xl font-extrabold select-none ${
              type === 'EXPENSE' ? 'text-expense/80' : 'text-income/80'
            }`}
          >
            $
          </span>
          <MoneyInput
            id="amount"
            name="amount"
            required
            autoFocus
            placeholder="0"
            hidePrefix
            value={amountText}
            onChange={setAmountText}
            className="bg-transparent border-none text-3xl sm:text-5xl font-black text-white text-center tabular-nums focus:outline-none w-full max-w-[280px] p-0 tracking-tight no-spinner"
          />
        </div>
      </div>

      {/* Categoría */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="label mb-0" htmlFor="category_id">
            Categoría
          </label>
          {selectedCategory && (
            <span className="flex items-center gap-1.5 text-xs text-neutral-400">
              <span
                aria-hidden="true"
                className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                style={{ backgroundColor: resolveColor(selectedCategory.color, selectedCategoryId) }}
              />
              <span className="font-medium text-white">{selectedCategory.name}</span>
            </span>
          )}
        </div>

        <div className="relative">
          <select
            id="category_id"
            name="category_id"
            required
            value={selectedCategoryId || ''}
            onChange={(event) => setCategoryId(Number(event.target.value))}
            className="w-full appearance-none rounded-2xl border border-white/10 bg-[#161616] px-4 py-3.5 pr-10 text-white font-medium focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 transition-all cursor-pointer text-sm"
          >
            {relevant.map((category) => (
              <option key={category.id} value={category.id} className="bg-zinc-900 text-white">
                {category.name}
              </option>
            ))}
          </select>
          <Icon
            name="chevronDown"
            size={18}
            className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400"
          />
        </div>

        {budget?.has_budget && (
          <div
            className={`mt-2.5 p-3.5 rounded-2xl border text-xs transition-all ${
              budgetOver
                ? 'bg-expense/10 border-expense/30 text-expense'
                : 'bg-white/5 border-white/10 text-neutral-300'
            }`}
            aria-live="polite"
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="font-semibold truncate">
                Presupuesto de {selectedCategory?.name}
              </span>
              <span className="font-bold tabular-nums shrink-0">
                {percent(budgetPercentage)}
              </span>
            </div>
            <div className="h-2 bg-black/40 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  budgetOver ? 'bg-expense' : 'bg-gold'
                }`}
                style={{ width: `${Math.min(budgetPercentage, 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-2 text-[11px] opacity-90 tabular-nums">
              <span>{money(budgetProjected)} de {money(budget.amount)}</span>
              <span className="font-bold">
                {budgetOver
                  ? `Excedido por ${money(budgetProjected - budget.amount)}`
                  : `Restan ${money(budget.amount - budgetProjected)}`}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Descripción */}
      <div>
        <label className="label" htmlFor="description">
          Descripción
        </label>
        <input
          id="description"
          name="description"
          type="text"
          placeholder="Supermercado, Almuerzo, Nafta, etc."
          maxLength={200}
          defaultValue={transaction?.description ?? ''}
          className="w-full rounded-2xl border border-white/10 bg-[#161616] px-4 py-3 text-white placeholder:text-neutral-600 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 transition-all text-sm"
        />
      </div>

      {/* Cuenta y Fecha */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="account_id">
            Cuenta
          </label>
          <div className="relative">
            <select
              id="account_id"
              name="account_id"
              required
              value={accountId}
              onChange={(event) => setAccountId(Number(event.target.value))}
              className="w-full appearance-none rounded-2xl border border-white/10 bg-[#161616] px-4 py-3 pr-10 text-white font-medium focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 transition-all cursor-pointer text-sm"
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id} className="bg-zinc-900 text-white">
                  {account.name}
                  {account.id === favoriteId ? ' (Principal)' : ''}
                </option>
              ))}
            </select>
            <Icon
              name="chevronDown"
              size={16}
              className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400"
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="date">
            Fecha
          </label>
          <input
            id="date"
            name="date"
            type="date"
            required
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-[#161616] px-4 py-3 text-white focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 transition-all cursor-pointer text-sm"
          />
        </div>
      </div>
    </FormModal>
  )
}

export function TransferModal({
  open,
  accounts,
  onClose,
  onSaved,
}: {
  open: boolean
  accounts: Account[]
  onClose: () => void
  onSaved: () => void
}) {
  const [favoriteId] = useFavoriteAccount()
  const defaultFrom = resolveDefaultAccountId(accounts)
  const defaultTo = accounts.find((a) => a.id !== defaultFrom)?.id ?? accounts[0]?.id ?? ''

  const [error, setError] = useState<string | null>(null)
  const [fromId, setFromId] = useState<number>(defaultFrom)
  const [amountText, setAmountText] = useState('')

  useEffect(() => {
    if (open) {
      setError(null)
      setFromId(resolveDefaultAccountId(accounts))
      setAmountText('')
    }
  }, [open, accounts])

  async function handleSubmit(form: FormData) {
    setError(null)
    const amount = parseMoney(String(form.get('amount') ?? ''))
    if (!amount || amount <= 0) {
      setError('El monto tiene que ser mayor a cero')
      return
    }

    try {
      await api.transfers.create({
        from_account_id: Number(form.get('from_account_id')),
        to_account_id: Number(form.get('to_account_id')),
        amount,
        description: (form.get('description') as string)?.trim() || null,
        date: form.get('date') as string,
      })
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo transferir')
    }
  }

  return (
    <FormModal
      open={open}
      title="Transferir dinero"
      submitLabel="Transferir"
      onClose={onClose}
      onSubmit={handleSubmit}
      error={error}
    >
      {/* Visual Transfer Flow (Desde -> Hacia) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative">
        <div>
          <label className="label" htmlFor="from_account_id">
            Cuenta de origen
          </label>
          <div className="relative">
            <select
              id="from_account_id"
              name="from_account_id"
              required
              value={fromId}
              onChange={(event) => setFromId(Number(event.target.value))}
              className="w-full appearance-none rounded-2xl border border-white/10 bg-[#161616] px-4 py-3 pr-10 text-white font-medium focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 transition-all cursor-pointer text-sm"
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id} className="bg-zinc-900 text-white">
                  {account.name}
                  {account.id === favoriteId ? ' (Principal)' : ''}
                </option>
              ))}
            </select>
            <Icon
              name="chevronDown"
              size={16}
              className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400"
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="to_account_id">
            Cuenta de destino
          </label>
          <div className="relative">
            <select
              id="to_account_id"
              name="to_account_id"
              required
              defaultValue={defaultTo}
              className="w-full appearance-none rounded-2xl border border-white/10 bg-[#161616] px-4 py-3 pr-10 text-white font-medium focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 transition-all cursor-pointer text-sm"
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id} className="bg-zinc-900 text-white">
                  {account.name}
                  {account.id === favoriteId ? ' (Principal)' : ''}
                </option>
              ))}
            </select>
            <Icon
              name="chevronDown"
              size={16}
              className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400"
            />
          </div>
        </div>
      </div>

      {/* Hero Amount Field */}
      <div className="rounded-3xl p-5 sm:p-6 text-center border border-white/10 bg-gold/[0.04] focus-within:border-gold/60 focus-within:ring-2 focus-within:ring-gold/15 transition-all duration-200">
        <span className="block text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-1.5">
          Monto a transferir
        </span>
        <div className="flex items-center justify-center gap-1.5">
          <span className="text-3xl sm:text-4xl font-extrabold text-gold/80 select-none">
            $
          </span>
          <MoneyInput
            id="transfer-amount"
            name="amount"
            required
            autoFocus
            placeholder="0"
            hidePrefix
            value={amountText}
            onChange={setAmountText}
            className="bg-transparent border-none text-3xl sm:text-5xl font-black text-white text-center tabular-nums focus:outline-none w-full max-w-[280px] p-0 tracking-tight no-spinner"
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="transfer-description">
          Motivo o referencia
        </label>
        <input
          id="transfer-description"
          name="description"
          type="text"
          placeholder="Opcional: Ahorro, cambio de cuenta, etc."
          maxLength={200}
          className="w-full rounded-2xl border border-white/10 bg-[#161616] px-4 py-3 text-white placeholder:text-neutral-600 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 transition-all text-sm"
        />
      </div>

      <div>
        <label className="label" htmlFor="transfer-date">
          Fecha de la transferencia
        </label>
        <input
          id="transfer-date"
          name="date"
          type="date"
          required
          defaultValue={todayIso()}
          className="w-full rounded-2xl border border-white/10 bg-[#161616] px-4 py-3 text-white focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 transition-all cursor-pointer text-sm"
        />
      </div>

      <p className="text-xs text-neutral-400 bg-white/5 border border-white/5 rounded-2xl p-3 text-center">
        Mover saldo entre cuentas no computa como gasto ni como ingreso.
      </p>
    </FormModal>
  )
}
