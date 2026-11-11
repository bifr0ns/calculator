import { useId, useRef, useState, type FormEvent, type RefObject } from 'react'
import { calculate, type Operation } from '../api/calculatorClient'
import { formatResult, parseOperand } from '../numbers'
import './Calculator.css'

const OPERATIONS = {
  add: { symbol: '+', label: 'Add' },
  subtract: { symbol: '−', label: 'Subtract' },
  multiply: { symbol: '×', label: 'Multiply' },
  divide: { symbol: '÷', label: 'Divide' },
} satisfies Record<Operation, { symbol: string; label: string }>

const OPERATION_ORDER: Operation[] = ['add', 'subtract', 'multiply', 'divide']

type Operand = 'a' | 'b'

type RequestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; expression: string; result: number }
  | { status: 'error'; message: string }

export function Calculator() {
  const [operands, setOperands] = useState<Record<Operand, string>>({ a: '', b: '' })
  const [operation, setOperation] = useState<Operation>('add')
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Operand, string>>>({})
  const [request, setRequest] = useState<RequestState>({ status: 'idle' })

  const inputA = useRef<HTMLInputElement>(null)
  const inputB = useRef<HTMLInputElement>(null)

  // Identifies the latest request. Bumped on every submit and every edit, so a
  // response that arrives after the inputs changed is ignored, never shown.
  const latestRequestId = useRef(0)

  const isLoading = request.status === 'loading'

  function clearResult() {
    latestRequestId.current += 1
    setRequest({ status: 'idle' })
  }

  function handleOperandChange(operand: Operand, value: string) {
    setOperands((prev) => ({ ...prev, [operand]: value }))
    setFieldErrors((prev) => ({ ...prev, [operand]: undefined }))
    clearResult()
  }

  function handleOperationChange(next: Operation) {
    setOperation(next)
    clearResult()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isLoading) {
      return
    }

    const a = parseOperand(operands.a)
    const b = parseOperand(operands.b)
    if (!a.ok || !b.ok) {
      setFieldErrors({ a: a.ok ? undefined : a.message, b: b.ok ? undefined : b.message })
      ;(a.ok ? inputB : inputA).current?.focus()
      return
    }

    // Capture the expression now; the inputs may change while we wait.
    const expression = describe(operands.a, operation, operands.b)
    const requestId = ++latestRequestId.current
    setRequest({ status: 'loading' })

    const outcome = await calculate(operation, a.value, b.value)
    if (requestId !== latestRequestId.current) {
      return
    }

    setRequest(
      outcome.ok
        ? { status: 'success', expression, result: outcome.result }
        : { status: 'error', message: capitalize(outcome.message) },
    )
  }

  return (
    <section className="calculator" aria-labelledby="calculator-title">
      <h1 id="calculator-title" className="calculator__title">
        Calculator
      </h1>

      <form className="calculator__form" onSubmit={handleSubmit} noValidate>
        <div className="calculator__inputs">
          <OperandField
            label="First number"
            value={operands.a}
            error={fieldErrors.a}
            inputRef={inputA}
            onChange={(value) => handleOperandChange('a', value)}
          />

          <fieldset className="operations">
            <legend className="operations__legend">Operation</legend>
            <div className="operations__options">
              {OPERATION_ORDER.map((op) => (
                <label key={op} className="operation">
                  <input
                    type="radio"
                    name="operation"
                    value={op}
                    className="operation__input"
                    checked={operation === op}
                    onChange={() => handleOperationChange(op)}
                  />
                  <span className="operation__symbol" aria-hidden="true">
                    {OPERATIONS[op].symbol}
                  </span>
                  <span className="visually-hidden">{OPERATIONS[op].label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <OperandField
            label="Second number"
            value={operands.b}
            error={fieldErrors.b}
            inputRef={inputB}
            onChange={(value) => handleOperandChange('b', value)}
          />
        </div>

        <button type="submit" className="calculator__submit" aria-disabled={isLoading}>
          {isLoading ? 'Calculating…' : 'Calculate'}
        </button>
      </form>

      <div className="calculator__status">
        <output className="result" aria-live="polite">
          {request.status === 'success' && (
            <>
              <span className="result__expression">{request.expression}</span>{' '}
              <span className="result__equals">=</span>{' '}
              <strong className="result__value">{formatResult(request.result)}</strong>
            </>
          )}
        </output>

        {request.status === 'error' && (
          <p className="calculator__error" role="alert">
            {request.message}
          </p>
        )}
      </div>
    </section>
  )
}

type OperandFieldProps = {
  label: string
  value: string
  error: string | undefined
  inputRef: RefObject<HTMLInputElement | null>
  onChange: (value: string) => void
}

function OperandField({ label, value, error, inputRef, onChange }: OperandFieldProps) {
  const id = useId()
  const errorId = `${id}-error`

  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <input
        id={id}
        ref={inputRef}
        className="field__input"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        placeholder="0"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error && (
        <p id={errorId} className="field__error">
          {error}
        </p>
      )}
    </div>
  )
}

/** "5 − (-3)": wraps a negative second operand so the expression reads clearly. */
function describe(a: string, operation: Operation, b: string): string {
  const right = b.trim()
  return `${a.trim()} ${OPERATIONS[operation].symbol} ${right.startsWith('-') ? `(${right})` : right}`
}

/** API messages are lower-case fragments ("cannot divide by zero"). */
function capitalize(message: string): string {
  return message.charAt(0).toUpperCase() + message.slice(1)
}
