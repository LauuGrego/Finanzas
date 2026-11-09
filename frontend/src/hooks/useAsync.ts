import { useCallback, useEffect, useRef, useState } from 'react'

interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

/**
 * Runs `loader` on mount and whenever `deps` change, exposing a `reload`
 * for after a mutation. Errors come back as a message ready to show.
 * Protects against race conditions if dependencies change rapidly.
 */
export function useAsync<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
): AsyncState<T> & { reload: () => Promise<void>; setData: (value: T) => void } {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: true,
    error: null,
  })

  const reqIdRef = useRef(0)

  const reload = useCallback(async () => {
    const currentReqId = ++reqIdRef.current
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const data = await loader()
      if (currentReqId === reqIdRef.current) {
        setState({ data, loading: false, error: null })
      }
    } catch (error) {
      if (currentReqId === reqIdRef.current) {
        setState((prev) => ({
          data: prev.data,
          loading: false,
          error: error instanceof Error ? error.message : 'Error desconocido',
        }))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    void reload()
  }, [reload])

  const setData = useCallback((value: T) => {
    reqIdRef.current++
    setState({ data: value, loading: false, error: null })
  }, [])

  return { ...state, reload, setData }
}
