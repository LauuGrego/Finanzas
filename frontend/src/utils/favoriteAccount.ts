import { useEffect, useState } from 'react'
import type { Account } from '../types'

const STORAGE_KEY = 'finanzas_favorite_account_id'

export function getFavoriteAccountId(): number | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const num = Number(raw)
    return Number.isFinite(num) && num > 0 ? num : null
  } catch {
    return null
  }
}

export function setFavoriteAccountId(id: number | null): void {
  if (typeof window === 'undefined') return
  try {
    if (id !== null && Number.isFinite(id) && id > 0) {
      localStorage.setItem(STORAGE_KEY, String(id))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // ignore storage error
  }
  window.dispatchEvent(new CustomEvent('favorite-account-changed', { detail: id }))
}

export function useFavoriteAccount(): [number | null, (id: number | null) => void] {
  const [favoriteId, setFavoriteId] = useState<number | null>(() => getFavoriteAccountId())

  useEffect(() => {
    function handleUpdate() {
      setFavoriteId(getFavoriteAccountId())
    }
    window.addEventListener('favorite-account-changed', handleUpdate)
    window.addEventListener('storage', handleUpdate)
    return () => {
      window.removeEventListener('favorite-account-changed', handleUpdate)
      window.removeEventListener('storage', handleUpdate)
    }
  }, [])

  return [favoriteId, setFavoriteAccountId]
}

/**
 * Returns the best account ID to preselect:
 * 1. An explicit ID if provided and present in the accounts list.
 * 2. The user's marked favorite account if active and available.
 * 3. The first available account as fallback.
 */
export function resolveDefaultAccountId(
  accounts: Account[] | { id: number; active?: boolean }[],
  explicitId?: number,
): number {
  const activeAccounts = accounts.filter((a) => a.active !== false)
  if (explicitId && activeAccounts.some((a) => a.id === explicitId)) {
    return explicitId
  }
  const favoriteId = getFavoriteAccountId()
  if (favoriteId && activeAccounts.some((a) => a.id === favoriteId)) {
    return favoriteId
  }
  return activeAccounts[0]?.id ?? accounts[0]?.id ?? 0
}
