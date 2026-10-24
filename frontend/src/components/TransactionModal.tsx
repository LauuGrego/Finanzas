import { useEffect, useState } from 'react'
import { api } from '../services/api'
import type { Account, BudgetCheck, Category, Transaction, TransactionPayload } from '../types'
import { resolveColor } from '../utils/colors'
import { resolveDefaultAccountId, useFavoriteAccount } from '../utils/favoriteAccount'
import { todayIso, money, moneyEditable, parseMoney, percent } from '../utils/format'
import { FormModal } from './FormModal'
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
  }, [open, defaultAccountId, accounts])

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
      <div className="grid grid-cols-2 gap-2">
        {(['EXPENSE', 'INCOME'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => {
              setType(option)
              setCategoryId(0)
            }}
            aria-pressed={type === option}
            className={`py-2.5 rounded-xl font-medium transition border ${
              type === option
                ? option === 'EXPENSE'
                  ? 'bg-expense/10 border-expense text-expense'
                  : 'bg-income/10 border-income text-income'
                : 'border-line text-muted hover:bg-raised'
            }`}
          >
            {option === 'EXPENSE' ? 'Gasto' : 'Ingreso'}
          </button>
        ))}
      </div>

      <div>
        <label className="label" htmlFor="amount">
          Monto
        </label>
        <MoneyInput
          id="amount"
          name="amount"
          required
          autoFocus
          placeholder="25.000"
          value={amountText}
          onChange={setAmountText}
          className="input no-spinner pl-8 text-lg font-semibold"
        />
      </div>

      <div>
        <label className="label" htmlFor="category_id">
          Categoría
        </label>
        <select
          id="category_id"
          name="category_id"
          required
          value={selectedCategoryId || ''}
          onChange={(event) => setCategoryId(Number(event.target.value))}
          className="input"
        >
          {relevant.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        {budget?.has_budget && (
          <p
            className={`text-xs mt-1.5 ${budgetOver ? 'text-expense' : 'text-muted'}`}
            aria-live="polite"
          >
            <span
              aria-hidden="true"
              className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
              style={{
                backgroundColor: resolveColor(selectedCategory?.color, selectedCategoryId),
              }}
            />
            En {selectedCategory?.name ?? 'esta categoría'} vas a{' '}
            <span className="tabular-nums text-ink">{money(budgetProjected)}</span> de{' '}
            <span className="tabular-nums">{money(budget.amount)}</span>
            <span className="tabular-nums"> · {percent(budgetPercentage)}</span>
            {budgetOver && ' · te pasaste'}
          </p>
        )}
      </div>

      <div>
        <label className="label" htmlFor="description">
          Descripción
        </label>
        <input
          id="description"
          name="description"
          type="text"
          placeholder="Supermercado"
          maxLength={200}
          defaultValue={transaction?.description ?? ''}
          className="input"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="account_id">
            Cuenta
          </label>
          <select
            id="account_id"
            name="account_id"
            required
            value={accountId}
            onChange={(event) => setAccountId(Number(event.target.value))}
            className="input"
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
                {account.id === favoriteId ? ' (Principal)' : ''}
              </option>
            ))}
          </select>
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
            className="input"
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
      onClose={onClose}
      onSubmit={handleSubmit}
      error={error}
    >
      <div>
        <label className="label" htmlFor="from_account_id">
          Desde
        </label>
        <select
          id="from_account_id"
          name="from_account_id"
          required
          value={fromId}
          onChange={(event) => setFromId(Number(event.target.value))}
          className="input"
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
              {account.id === favoriteId ? ' (Principal)' : ''}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="to_account_id">
          Hacia
        </label>
        <select
          id="to_account_id"
          name="to_account_id"
          required
          defaultValue={defaultTo}
          className="input"
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
              {account.id === favoriteId ? ' (Principal)' : ''}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="transfer-amount">
          Monto
        </label>
        <MoneyInput
          id="transfer-amount"
          name="amount"
          required
          autoFocus
          placeholder="50.000"
          value={amountText}
          onChange={setAmountText}
          className="input no-spinner pl-8 text-lg font-semibold"
        />
      </div>

      <div>
        <label className="label" htmlFor="transfer-description">
          Descripción
        </label>
        <input
          id="transfer-description"
          name="description"
          type="text"
          placeholder="Opcional"
          maxLength={200}
          className="input"
        />
      </div>

      <div>
        <label className="label" htmlFor="transfer-date">
          Fecha
        </label>
        <input
          id="transfer-date"
          name="date"
          type="date"
          required
          defaultValue={todayIso()}
          className="input"
        />
      </div>

      <p className="text-xs text-muted">
        Transferir plata entre tus cuentas no es un gasto: solo mueve el dinero.
      </p>
    </FormModal>
  )
}
