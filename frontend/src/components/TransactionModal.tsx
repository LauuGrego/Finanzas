import { useEffect, useState } from 'react'
import { api } from '../services/api'
import type { Account, Category, Transaction, TransactionPayload } from '../types'
import { todayIso, moneyPrecise } from '../utils/format'
import { FormModal } from './FormModal'

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

/** A credit card is meant to end the month in the red: that balance is the debt. */
function blocksSpending(account: Account | undefined): boolean {
  return account !== undefined && account.type !== 'CREDIT'
}

/**
 * Whether an amount would take the account below zero.
 *
 * Mirrors what the backend checks, in centavos so the comparison never depends
 * on how a float rounds. `alreadyCounted` is what the balance already has
 * subtracted for the movement being edited: without adding it back, saving an
 * expense without changing a single thing would read as over the limit.
 */
function exceedsBalance(amountText: string, balance: number, alreadyCounted = 0): boolean {
  const amount = Number(amountText.replace(',', '.'))
  if (!Number.isFinite(amount) || amount <= 0) return false
  return Math.round(amount * 100) > Math.round((balance + alreadyCounted) * 100)
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
  const [error, setError] = useState<string | null>(null)
  const [type, setType] = useState<'EXPENSE' | 'INCOME'>(transaction?.type ?? defaultType)
  const [accountId, setAccountId] = useState<number>(
    transaction?.account_id ?? defaultAccountId ?? accounts[0]?.id ?? 0
  )
  const [amountText, setAmountText] = useState(transaction ? String(transaction.amount) : '')

  // El modal queda montado siempre, recibe open en vez de desmontarse. Por eso
  // el useState de arriba solo corre una vez y el tipo se queda pegado entre
  // aperturas: en Nuevo tocás "Ingreso" y el modal abre con el EXPENSE de la
  // apertura anterior, así que el botón deja de mandar. También se arrastraba
  // el error de un guardado fallido al volver a abrir.
  //
  // Los inputs sí se desmontan con el <Modal>, pero este estado vive acá
  // arriba, así que la cuenta y el monto también hay que resetearlos.
  //
  // La dependencia es solo `open` a propósito: interesa leer el default que el
  // padre pasó en este momento. Si también dependiera de `transaction` y el
  // padre lo creara inline, cambiaría de identidad en cada render y esto
  // pisaría lo que la persona eligió con el modal abierto.
  useEffect(() => {
    if (open) {
      setType(transaction?.type ?? defaultType)
      setError(null)
      setAccountId(transaction?.account_id ?? defaultAccountId ?? accounts[0]?.id ?? 0)
      setAmountText(transaction ? String(transaction.amount) : '')
    }
  }, [open])

  const editing = Boolean(transaction)
  const relevant = categories.filter((c) => c.type === type)

  const account = accounts.find((a) => a.id === accountId)
  // Al editar, el saldo que importa es el que queda si se saca este movimiento
  // de la cuenta. Si se muda de cuenta, el saldo de la nueva todavía no lo tiene.
  const sameAccount = !transaction || accountId === transaction.account_id
  const alreadyCounted =
    sameAccount && transaction
      ? transaction.type === 'EXPENSE'
        ? transaction.amount
        : -transaction.amount
      : 0
  const spendable = (account?.balance ?? 0) + alreadyCounted
  const overLimit =
    type === 'EXPENSE' && blocksSpending(account) && exceedsBalance(amountText, account?.balance ?? 0, alreadyCounted)

  async function handleSubmit(form: FormData) {
    setError(null)
    const amount = Number(String(form.get('amount') ?? '').replace(',', '.'))
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
      canSubmit={!overLimit}
      onClose={onClose}
      onSubmit={handleSubmit}
      error={error}
    >
      <div className="grid grid-cols-2 gap-2">
        {(['EXPENSE', 'INCOME'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setType(option)}
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
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">$</span>
          <input
            id="amount"
            name="amount"
            type="text"
            inputMode="decimal"
            required
            autoFocus
            placeholder="25.000"
            value={amountText}
            onChange={(event) => setAmountText(event.target.value)}
            className="input no-spinner pl-8 text-lg font-semibold"
          />
        </div>
      </div>

      {account && type === 'EXPENSE' && blocksSpending(account) && (
        <p className="text-xs text-muted -mt-2">
          {/* Al editar, el limite es el saldo mas lo que este movimiento ya
              tenia descontado, asi que puede ser mayor que el saldo de la cuenta.
              La etiqueta lo aclara: si no, el numero parece mentir. */}
          {alreadyCounted === 0
            ? `Disponible en ${account.name}`
            : 'Disponible para este movimiento'}
          {': '}
          <span className="tabular-nums text-ink">{moneyPrecise(spendable)}</span>
        </p>
      )}

      {overLimit && (
        <p
          role="alert"
          className="text-sm text-expense bg-expense/10 rounded-xl px-3 py-2"
        >
          No hay suficiente dinero en {account?.name}. Te quedan {moneyPrecise(spendable)}.
        </p>
      )}

      <div>
        <label className="label" htmlFor="category_id">
          Categoría
        </label>
        <select
          id="category_id"
          name="category_id"
          required
          key={type}
          defaultValue={transaction?.category_id ?? relevant[0]?.id ?? ''}
          className="input"
        >
          {relevant.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
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
            defaultValue={transaction?.date ?? todayIso()}
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
  const [error, setError] = useState<string | null>(null)
  const [fromId, setFromId] = useState<number>(accounts[0]?.id ?? 0)
  const [amountText, setAmountText] = useState('')

  // Mismo motivo que en TransactionModal: este estado sobrevive al cierre.
  useEffect(() => {
    if (open) {
      setError(null)
      setFromId(accounts[0]?.id ?? 0)
      setAmountText('')
    }
  }, [open])

  const from = accounts.find((a) => a.id === fromId)
  const overLimit =
    blocksSpending(from) && exceedsBalance(amountText, from?.balance ?? 0)

  async function handleSubmit(form: FormData) {
    setError(null)
    const amount = Number(String(form.get('amount') ?? '').replace(',', '.'))
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
      canSubmit={!overLimit}
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
            </option>
          ))}
        </select>
        {from && blocksSpending(from) && (
          <p className="text-xs text-muted mt-1.5">
            Disponible:{' '}
            <span className="tabular-nums text-ink">{moneyPrecise(from.balance)}</span>
          </p>
        )}
      </div>

      <div>
        <label className="label" htmlFor="to_account_id">
          Hacia
        </label>
        <select
          id="to_account_id"
          name="to_account_id"
          required
          defaultValue={accounts[1]?.id ?? accounts[0]?.id ?? ''}
          className="input"
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="transfer-amount">
          Monto
        </label>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">$</span>
          <input
            id="transfer-amount"
            name="amount"
            type="text"
            inputMode="decimal"
            required
            autoFocus
            placeholder="50.000"
            value={amountText}
            onChange={(event) => setAmountText(event.target.value)}
            className="input no-spinner pl-8 text-lg font-semibold"
          />
        </div>
      </div>

      {overLimit && (
        <p role="alert" className="text-sm text-expense bg-expense/10 rounded-xl px-3 py-2">
          No hay suficiente dinero en {from?.name}. Te quedan {moneyPrecise(from?.balance ?? 0)}.
        </p>
      )}

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
