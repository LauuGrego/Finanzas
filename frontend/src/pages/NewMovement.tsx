import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { useAsync } from '../hooks/useAsync'
import { api } from '../services/api'
import type { CategoryType } from '../types'
import { resolveDefaultAccountId, useFavoriteAccount } from '../utils/favoriteAccount'
import { money, todayIso } from '../utils/format'

export function NewMovement() {
  const navigate = useNavigate()
  const [favoriteId] = useFavoriteAccount()
  const [type, setType] = useState<CategoryType>('EXPENSE')
  const [rawAmount, setRawAmount] = useState<string>('0')
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [accountId, setAccountId] = useState<number | null>(null)
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(todayIso())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const accounts = useAsync(() => api.accounts.list(), [])
  const categories = useAsync(() => api.categories.list(undefined, true), [])

  const activeAccounts = accounts.data?.accounts.filter((a) => a.active) ?? []
  const activeCategories = (categories.data ?? []).filter(
    (c) => c.active && c.type === type
  )

  const selectedAccountId =
    accountId ??
    (activeAccounts.length > 0
      ? resolveDefaultAccountId(activeAccounts, favoriteId ?? undefined)
      : null)

  const selectedCategoryId =
    (activeCategories.some((c) => c.id === categoryId)
      ? categoryId
      : activeCategories[0]?.id) ?? null

  function handleKeypad(digit: string) {
    if (digit === 'backspace') {
      setRawAmount((prev) => (prev.length <= 1 ? '0' : prev.slice(0, -1)))
      return
    }

    setRawAmount((prev) => {
      if (prev === '0') return digit === '00' ? '0' : digit
      if (prev.length >= 10) return prev
      return prev + digit
    })
  }

  const numericAmount = Number(rawAmount) || 0

  async function handleSave() {
    setError(null)
    if (!selectedAccountId) {
      setError('Elegí una cuenta')
      return
    }
    if (!selectedCategoryId) {
      setError('Elegí una categoría')
      return
    }
    if (numericAmount <= 0) {
      setError('Ingresá un importe mayor a cero')
      return
    }

    setSaving(true)
    try {
      await api.transactions.create({
        account_id: selectedAccountId,
        category_id: selectedCategoryId,
        type,
        amount: numericAmount,
        date,
        description: description.trim() || null,
      })
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar')
      setSaving(false)
    }
  }

  return (
    <div className="max-w-md mx-auto min-h-[calc(100vh-6rem)] flex flex-col justify-between py-2 sm:py-4 space-y-4">
      {/* Top Header Row */}
      <div className="flex items-center justify-between gap-3 px-1">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Volver"
          className="w-10 h-10 rounded-full bg-[#18181b] border border-white/5 flex items-center justify-center text-neutral-300 hover:text-white transition cursor-pointer"
        >
          <Icon name="x" size={18} />
        </button>

        {/* Segmented Type Toggle */}
        <div className="bg-[#18181b] border border-white/5 p-1 rounded-full flex items-center">
          <button
            type="button"
            onClick={() => setType('EXPENSE')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
              type === 'EXPENSE'
                ? 'bg-expense text-white shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Gasto
          </button>
          <button
            type="button"
            onClick={() => setType('INCOME')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
              type === 'INCOME'
                ? 'bg-income text-black shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Ingreso
          </button>
        </div>

        {/* Date Selector */}
        <label className="relative cursor-pointer">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="sr-only"
          />
          <span className="px-3 py-1.5 rounded-full bg-[#18181b] border border-white/5 text-xs font-semibold text-neutral-300 hover:text-white flex items-center gap-1.5 transition">
            <Icon name="calendar" size={13} />
            <span>{date === todayIso() ? 'Hoy' : date.slice(5)}</span>
          </span>
        </label>
      </div>

      {/* Hero Yellow Amount Card */}
      <div className="bg-gold text-black rounded-3xl p-5 sm:p-6 shadow-md transition-all">
        <span className="text-[11px] font-bold uppercase tracking-wider text-black/75 block">
          Importe
        </span>
        <div className="text-4xl sm:text-5xl font-black text-black tracking-tight tabular-nums mt-1 truncate">
          {money(numericAmount)}
        </div>
      </div>

      {error && (
        <p className="text-xs text-expense font-semibold bg-expense/10 border border-expense/20 rounded-2xl p-3 px-4 text-center">
          {error}
        </p>
      )}

      {/* Category Pills (Horizontal Scroll) */}
      <div>
        <div className="flex items-center justify-between px-1 mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
            Categoría
          </span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {activeCategories.map((category) => {
            const isSelected = category.id === selectedCategoryId
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => setCategoryId(category.id)}
                className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition cursor-pointer shrink-0 border ${
                  isSelected
                    ? 'bg-gold text-black border-gold font-bold shadow-sm'
                    : 'bg-[#18181b] border-white/5 text-neutral-300 hover:text-white hover:border-white/10'
                }`}
              >
                {category.name}
              </button>
            )
          })}
        </div>
      </div>

      {/* Details Row: Cuenta & Descripción */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="quick-account" className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 block px-1 mb-1.5">
            Cuenta
          </label>
          <select
            id="quick-account"
            value={selectedAccountId ?? ''}
            onChange={(e) => setAccountId(Number(e.target.value))}
            className="w-full bg-[#18181b] border border-white/5 text-white text-xs font-semibold rounded-2xl px-3 py-2.5 focus:border-gold outline-none cursor-pointer"
          >
            {activeAccounts.map((account) => (
              <option key={account.id} value={account.id} className="bg-neutral-900 text-white">
                {account.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="quick-desc" className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 block px-1 mb-1.5">
            Detalle
          </label>
          <input
            id="quick-desc"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ej. Supermercado"
            maxLength={120}
            className="w-full bg-[#18181b] border border-white/5 text-white text-xs font-semibold rounded-2xl px-3 py-2.5 placeholder:text-neutral-500 focus:border-gold outline-none"
          />
        </div>
      </div>

      {/* Tactile Numeric Keypad */}
      <div className="grid grid-cols-3 gap-2 sm:gap-2.5 pt-1">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0'].map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => handleKeypad(digit)}
            className="h-12 sm:h-14 rounded-2xl bg-[#18181b] border border-white/5 hover:bg-white/10 active:scale-95 text-lg sm:text-xl font-bold text-white flex items-center justify-center transition cursor-pointer tabular-nums"
          >
            {digit}
          </button>
        ))}

        <button
          type="button"
          onClick={() => handleKeypad('backspace')}
          aria-label="Borrar dígito"
          className="h-12 sm:h-14 rounded-2xl bg-[#18181b] border border-white/5 hover:bg-white/10 active:scale-95 text-neutral-400 hover:text-white flex items-center justify-center transition cursor-pointer"
        >
          <Icon name="delete" size={20} />
        </button>
      </div>

      {/* Full-width Bottom Save Pill */}
      <div className="pt-2">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || numericAmount <= 0}
          className="w-full bg-gold hover:bg-gold-light disabled:opacity-40 text-black font-black py-4 rounded-full text-base tracking-tight shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
        >
          {saving ? 'Guardando...' : type === 'EXPENSE' ? 'Guardar gasto' : 'Guardar ingreso'}
        </button>
      </div>
    </div>
  )
}
