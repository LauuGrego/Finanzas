import type { Transaction } from '../types'
import { formatDate, money } from '../utils/format'
import { Icon } from './Icon'

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

  const iconWrapper = isTransfer
    ? 'bg-zinc-800 text-zinc-300'
    : isIncome
      ? 'bg-sky-950/70 text-sky-400 border border-sky-800/40'
      : 'bg-red-950/70 text-red-400 border border-red-800/40'

  const meta = [
    showDate ? formatDate(transaction.date) : null,
    transaction.category?.name,
    showAccount ? transaction.account_name : null,
    isTransfer ? 'Transferencia' : null,
  ].filter(Boolean)

  return (
    <div className="flex items-center gap-3.5 py-3.5 group">
      <div
        aria-hidden="true"
        className={`w-9 h-9 rounded-full grid place-items-center shrink-0 transition-transform duration-150 group-hover:scale-105 ${iconWrapper}`}
      >
        <Icon
          name={isTransfer ? 'transfer' : isIncome ? 'arrowDownLeft' : 'arrowUpRight'}
          size={16}
        />
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-semibold text-white text-sm sm:text-base truncate">
          {transaction.description ||
            transaction.category?.name ||
            (isTransfer ? 'Transferencia' : 'Movimiento')}
        </p>
        {meta.length > 0 && (
          <p className="text-xs text-zinc-400 truncate mt-0.5">
            {meta.length > 1 ? `${meta.slice(0, -1).join(' · ')} · ` : ''}
            <span className="text-zinc-400">{meta[meta.length - 1]}</span>
          </p>
        )}
      </div>

      <p
        className={`font-bold tabular-nums shrink-0 text-sm sm:text-base whitespace-nowrap tracking-tight ${
          isIncome ? 'text-income' : 'text-expense'
        }`}
      >
        {isIncome ? '+' : '−'}
        {money(Math.abs(transaction.amount))}
      </p>

      {(onEdit || onDelete) && (
        <div className="flex gap-1 shrink-0 ml-1">
          {onEdit && !isTransfer && (
            <button
              type="button"
              onClick={() => onEdit(transaction)}
              aria-label={`Editar ${transaction.description ?? 'movimiento'}`}
              className="text-zinc-500 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            >
              <Icon name="pencil" size={15} />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(transaction)}
              aria-label={`Eliminar ${transaction.description ?? 'movimiento'}`}
              className="text-zinc-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            >
              <Icon name="trash" size={15} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
