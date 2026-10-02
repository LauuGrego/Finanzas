import { useLayoutEffect, useRef } from 'react'
import { caretAnchor, caretFromAnchor, formatMoneyTyped, moneyEditable } from '../utils/format'

type MoneyInputProps = {
  id: string
  name: string
  /** Controlled only when the caller needs to read the value as it changes. */
  value?: string
  onChange?: (value: string) => void
  defaultValue?: string | number
  placeholder?: string
  required?: boolean
  autoFocus?: boolean
  className?: string
}

/**
 * Un campo de plata que se va formateando mientras escribís.
 *
 * Lo que se teclea se reformatea en el acto (`450750` se vuelve `450.750`,
 * `450,7` se queda en `450,7`), y lo que se ve es lo que se guarda: el valor sale
 * de `parseMoney`, que usa exactamente la misma convención.
 *
 * Lo difícil no es el formato sino el cursor. Al reescribir el valor, el navegador
 * deja el cursor donde le parece y escribir en el medio del número lo manda al
 * final, que es la forma más rápida de arruinar un campo. Por eso se cuenta
 * cuántos dígitos había antes del cursor y se lo vuelve a poner después de la
 * misma cantidad.
 *
 * `defaultValue` es un número en pesos, no un texto: por eso pasa por
 * `moneyEditable` y no por el formateador de tecleo, que leería el punto decimal
 * de `450.75` como separador de miles.
 */
export function MoneyInput({
  id,
  name,
  value,
  onChange,
  defaultValue,
  placeholder,
  required,
  autoFocus,
  className = 'input no-spinner pl-8',
}: MoneyInputProps) {
  const ref = useRef<HTMLInputElement>(null)
  const pending = useRef<number | null>(null)

  // Controlled: React owns the value, so the DOM can only be corrected once the
  // re-render has happened. `useLayoutEffect` runs after the DOM changes and
  // before the browser paints, which is the only moment the caret can be placed
  // without the jump being visible.
  useLayoutEffect(() => {
    const input = ref.current
    const anchor = pending.current
    if (!input || anchor === null) return
    pending.current = null
    const position = caretFromAnchor(input.value, anchor)
    if (input.selectionStart !== position) {
      input.setSelectionRange(position, position)
    }
  })

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const typed = event.target.value
    const formatted = formatMoneyTyped(typed)
    const anchor = caretAnchor(typed, event.target.selectionStart ?? typed.length)

    if (value === undefined) {
      // Uncontrolled: writing straight to the node is the only way to change it,
      // and React will not fight over a value it does not own.
      event.target.value = formatted
      const position = caretFromAnchor(formatted, anchor)
      event.target.setSelectionRange(position, position)
    } else {
      pending.current = anchor
    }

    onChange?.(formatted)
  }

  /** A value that arrives from outside still has to be formatted once. */
  function formatOnFocus() {
    const input = ref.current
    if (!input || value !== undefined) return
    const formatted = formatMoneyTyped(input.value)
    if (formatted === input.value) return
    const anchor = caretAnchor(input.value, input.value.length)
    input.value = formatted
    const position = caretFromAnchor(formatted, anchor)
    input.setSelectionRange(position, position)
  }

  return (
    <div className="relative">
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">$</span>
      <input
        ref={ref}
        id={id}
        name={name}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        required={required}
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={value}
        defaultValue={
          value === undefined && defaultValue !== undefined && defaultValue !== ''
            ? moneyEditable(defaultValue)
            : undefined
        }
        onChange={handleChange}
        onFocus={formatOnFocus}
        className={className}
      />
    </div>
  )
}
