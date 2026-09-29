import type { Transaction } from '../types'
import { formatDate, money } from '../utils/format'
import { Icon, type IconName } from './Icon'

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

  const glyph: IconName = isTransfer ? 'transfer' : isIncome ? 'income' : 'expense'
  const color = isTransfer
    ? 'text-muted'
    : isIncome
      ? 'text-income'
      : 'text-expense'

  // Only spend the second line on details that are actually shown.
  const meta = [
    showDate ? formatDate(transaction.date) : null,
    transaction.category?.name,
    showAccount ? transaction.account_name : null,
    isTransfer ? 'Transferencia' : null,
  ].filter(Boolean)

  return (
    <div className="flex items-center gap-3 py-3">
      <div
        aria-hidden="true"
        className={`w-9 h-9 rounded-xl grid place-items-center shrink-0 bg-raised ${color}`}
      >
        <Icon name={glyph} size={18} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-medium truncate">
          {transaction.description ||
            transaction.category?.name ||
            (isTransfer ? 'Transferencia' : 'Movimiento')}
        </p>
        {meta.length > 0 && (
          <p className="text-sm text-muted truncate">
            {meta.length > 1 ? `${meta.slice(0, -1).join(' · ')} · ` : ''}
            <span className="text-muted/80">{meta[meta.length - 1]}</span>
          </p>
        )}
      </div>

      <p
        className={`font-semibold tabular-nums shrink-0 ${
          isIncome ? 'text-income' : 'text-expense'
        }`}
      >
        {isIncome ? '+' : '−'}
        {money(Math.abs(transaction.amount))}
      </p>

      {(onEdit || onDelete) && !isTransfer && (
        <div className="flex gap-0.5 shrink-0">
          {onEdit && (
            <button
              onClick={() => onEdit(transaction)}
              aria-label={`Editar ${transaction.description ?? 'movimiento'}`}
              className="text-muted hover:text-ink p-2 rounded-lg hover:bg-raised transition"
            >
              <Icon name="pencil" size={16} />
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(transaction)}
              aria-label={`Eliminar ${transaction.description ?? 'movimiento'}`}
              className="text-muted hover:text-expense p-2 rounded-lg hover:bg-raised transition"
            >
              <Icon name="trash" size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
