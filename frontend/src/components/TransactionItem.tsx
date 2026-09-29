import type { Transaction } from '../types'
import { formatDate, money } from '../utils/format'

interface Props {
  transaction: Transaction
  onEdit?: (transaction: Transaction) => void
  onDelete?: (transaction: Transaction) => void
  showDate?: boolean
  showAccount?: boolean
}

export function TransactionItem({
  transaction,
  onEdit,
  onDelete,
  showDate = false,
  showAccount = false,
}: Props) {
  const isIncome = transaction.type === 'INCOME'
  const isTransfer = transaction.transfer_id !== null

  return (
    <div className="flex items-center gap-3 py-3">
      <div
        aria-hidden="true"
        className="w-9 h-9 rounded-full grid place-items-center text-base shrink-0 bg-canvas"
      >
        {isTransfer ? '↔️' : (transaction.category?.icon ?? (isIncome ? '💼' : '💸'))}
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-medium truncate">
          {transaction.description ||
            transaction.category?.name ||
            (isTransfer ? 'Transferencia' : 'Movimiento')}
        </p>
        <p className="text-sm text-muted truncate">
          {showDate && `${formatDate(transaction.date)} · `}
          {transaction.category?.name && `${transaction.category.name} · `}
          {showAccount && transaction.account_name ? `${transaction.account_name} · ` : null}
          {isTransfer ? 'Transferencia' : null}
          {!isTransfer && !transaction.category?.name && !showAccount && 'Sin categoría'}
        </p>
      </div>

      <p
        className={`font-semibold tabular-nums shrink-0 ${
          isIncome ? 'text-income' : 'text-expense'
        }`}
      >
        {isIncome ? '+' : '−'}
        {money(Math.abs(transaction.amount))}
      </p>

      {(onEdit || onDelete) && (
        <div className="flex gap-1 shrink-0">
          {onEdit && !isTransfer && (
            <button
              onClick={() => onEdit(transaction)}
              aria-label="Editar movimiento"
              className="text-muted hover:text-ink px-2 py-1 rounded-lg hover:bg-canvas transition"
            >
              ✏️
            </button>
          )}
          {onDelete && !isTransfer && (
            <button
              onClick={() => onDelete(transaction)}
              aria-label="Eliminar movimiento"
              className="text-muted hover:text-expense px-2 py-1 rounded-lg hover:bg-canvas transition"
            >
              🗑️
            </button>
          )}
        </div>
      )}
    </div>
  )
}
