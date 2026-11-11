import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { calculate, type CalculateOutcome } from '../api/calculatorClient'
import { Calculator } from './Calculator'

vi.mock('../api/calculatorClient', () => ({ calculate: vi.fn() }))
const calculateMock = vi.mocked(calculate)

beforeEach(() => {
  calculateMock.mockReset()
})

function setup() {
  const user = userEvent.setup()
  render(<Calculator />)
  return {
    user,
    first: screen.getByLabelText('First number'),
    second: screen.getByLabelText('Second number'),
    submit: screen.getByRole('button', { name: /calculat/i }),
    result: screen.getByRole('status'),
    operation: (name: string) => screen.getByRole('radio', { name }),
  }
}

/** A promise the test resolves by hand, to observe the loading state. */
function deferred() {
  let resolve!: (outcome: CalculateOutcome) => void
  const promise = new Promise<CalculateOutcome>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('Calculator', () => {
  describe('submitting', () => {
    it('calculates with the default operation (add) when the button is clicked', async () => {
      calculateMock.mockResolvedValue({ ok: true, result: 5 })
      const { user, first, second, submit, result, operation } = setup()

      expect(operation('Add')).toBeChecked()
      await user.type(first, '2')
      await user.type(second, '3')
      await user.click(submit)

      expect(calculateMock).toHaveBeenCalledExactlyOnceWith('add', 2, 3)
      expect(result).toHaveTextContent('2 + 3 = 5')
    })

    it('calculates when Enter is pressed in an input', async () => {
      calculateMock.mockResolvedValue({ ok: true, result: 2.5 })
      const { user, first, second, result, operation } = setup()

      await user.type(first, '10')
      await user.click(operation('Divide'))
      await user.type(second, '4{Enter}')

      expect(calculateMock).toHaveBeenCalledExactlyOnceWith('divide', 10, 4)
      expect(result).toHaveTextContent('10 ÷ 4 = 2.5')
    })

    it('can be used with the keyboard alone', async () => {
      calculateMock.mockResolvedValue({ ok: true, result: 12 })
      const { user, first, result } = setup()

      await user.click(first)
      await user.keyboard('3')
      await user.tab() // to the operation radio group (Add)
      await user.keyboard('{ArrowRight}{ArrowRight}') // Subtract, then Multiply
      await user.tab() // to the second number
      await user.keyboard('4{Enter}')

      expect(calculateMock).toHaveBeenCalledExactlyOnceWith('multiply', 3, 4)
      expect(result).toHaveTextContent('3 × 4 = 12')
    })

    it.each([
      ['Add', 'add'],
      ['Subtract', 'subtract'],
      ['Multiply', 'multiply'],
      ['Divide', 'divide'],
    ])('sends the selected operation (%s)', async (label, expected) => {
      calculateMock.mockResolvedValue({ ok: true, result: 1 })
      const { user, first, second, submit, operation } = setup()

      await user.type(first, '1')
      await user.type(second, '1')
      await user.click(operation(label))
      await user.click(submit)

      expect(calculateMock).toHaveBeenCalledWith(expected, 1, 1)
    })

    it('sends the parsed values of the inputs', async () => {
      calculateMock.mockResolvedValue({ ok: true, result: 0 })
      const { user, first, second, submit } = setup()

      await user.type(first, '  -.5 ')
      await user.type(second, '007')
      await user.click(submit)

      expect(calculateMock).toHaveBeenCalledWith('add', -0.5, 7)
    })

    it('formats the result for display', async () => {
      calculateMock.mockResolvedValue({ ok: true, result: 0.1 + 0.2 })
      const { user, first, second, submit, result } = setup()

      await user.type(first, '0.1')
      await user.type(second, '0.2')
      await user.click(submit)

      expect(result).toHaveTextContent('0.1 + 0.2 = 0.3')
    })

    it('wraps a negative second operand in parentheses', async () => {
      calculateMock.mockResolvedValue({ ok: true, result: 8 })
      const { user, first, second, submit, result, operation } = setup()

      await user.type(first, '5')
      await user.click(operation('Subtract'))
      await user.type(second, '-3')
      await user.click(submit)

      expect(result).toHaveTextContent('5 − (-3) = 8')
    })
  })

  describe('validation', () => {
    it('shows field errors, focuses the first invalid field and does not call the API', async () => {
      const { user, first, second, submit } = setup()

      await user.type(first, 'abc')
      await user.click(submit)

      expect(calculateMock).not.toHaveBeenCalled()
      expect(first).toHaveAttribute('aria-invalid', 'true')
      expect(first).toHaveAccessibleDescription(/valid number/)
      expect(second).toHaveAttribute('aria-invalid', 'true')
      expect(second).toHaveAccessibleDescription('Enter a number.')
      expect(first).toHaveFocus()
    })

    it('focuses the second field when only it is invalid', async () => {
      const { user, first, second, submit } = setup()

      await user.type(first, '1')
      await user.type(second, '1e3')
      await user.click(submit)

      expect(calculateMock).not.toHaveBeenCalled()
      expect(first).not.toHaveAttribute('aria-invalid')
      expect(second).toHaveAttribute('aria-invalid', 'true')
      expect(second).toHaveFocus()
    })

    it('rejects a number that would lose precision, without calling the API', async () => {
      const { user, first, second, submit } = setup()

      await user.type(first, '9007199254740993')
      await user.type(second, '0')
      await user.click(submit)

      expect(calculateMock).not.toHaveBeenCalled()
      expect(first).toHaveAccessibleDescription(/too many digits/)
      expect(first).toHaveFocus()
    })

    it('clears the error of a field when that field is edited', async () => {
      const { user, first, second, submit } = setup()

      await user.click(submit)
      await user.type(first, '1')

      expect(first).not.toHaveAttribute('aria-invalid')
      expect(first).not.toHaveAccessibleDescription()
      expect(second).toHaveAttribute('aria-invalid', 'true')
    })

    it('does not validate division by zero itself; the backend decides', async () => {
      calculateMock.mockResolvedValue({ ok: false, code: 'DIVISION_BY_ZERO', message: 'cannot divide by zero' })
      const { user, first, second, submit, operation } = setup()

      await user.type(first, '1')
      await user.click(operation('Divide'))
      await user.type(second, '0')
      await user.click(submit)

      expect(calculateMock).toHaveBeenCalledWith('divide', 1, 0)
      expect(screen.getByRole('alert')).toHaveTextContent('Cannot divide by zero')
    })
  })

  describe('errors from the API client', () => {
    it.each([
      ['an API error', { ok: false, code: 'RESULT_OUT_OF_RANGE', message: 'result is too large to represent' }, 'Result is too large to represent'],
      ['a network error', { ok: false, code: 'NETWORK_ERROR', message: 'Could not reach the server.' }, 'Could not reach the server.'],
      ['an unexpected response', { ok: false, code: 'UNEXPECTED_RESPONSE', message: 'Unexpected response (HTTP 502).' }, 'Unexpected response (HTTP 502).'],
    ] as const)('shows %s as an alert, with no result', async (_label, outcome, message) => {
      calculateMock.mockResolvedValue(outcome)
      const { user, first, second, submit, result } = setup()

      await user.type(first, '1')
      await user.type(second, '2')
      await user.click(submit)

      expect(screen.getByRole('alert')).toHaveTextContent(message)
      expect(result).toBeEmptyDOMElement()
    })
  })

  it('recovers if the API client throws unexpectedly', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    calculateMock.mockRejectedValue(new Error('bug'))
    const { user, first, second, submit, result } = setup()

    await user.type(first, '1')
    await user.type(second, '2')
    await user.click(submit)

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong. Please try again.')
    expect(result).toBeEmptyDOMElement()
    expect(submit).toHaveAttribute('aria-disabled', 'false')
    expect(consoleError).toHaveBeenCalledWith(expect.objectContaining({ message: 'bug' }))
    consoleError.mockRestore()
  })

  describe('clearing stale results', () => {
    async function showResult() {
      calculateMock.mockResolvedValue({ ok: true, result: 5 })
      const ui = setup()
      await ui.user.type(ui.first, '2')
      await ui.user.type(ui.second, '3')
      await ui.user.click(ui.submit)
      expect(ui.result).toHaveTextContent('2 + 3 = 5')
      return ui
    }

    it('clears the result when the first operand changes', async () => {
      const { user, first, result } = await showResult()

      await user.type(first, '0')

      expect(result).toBeEmptyDOMElement()
    })

    it('clears the result when the second operand changes', async () => {
      const { user, second, result } = await showResult()

      await user.type(second, '{Backspace}')

      expect(result).toBeEmptyDOMElement()
    })

    it('clears the result when the operation changes', async () => {
      const { user, result, operation } = await showResult()

      await user.click(operation('Multiply'))

      expect(result).toBeEmptyDOMElement()
    })

    it('clears an error message when the inputs change', async () => {
      calculateMock.mockResolvedValue({ ok: false, code: 'DIVISION_BY_ZERO', message: 'cannot divide by zero' })
      const { user, first, second, submit } = setup()
      await user.type(first, '1')
      await user.type(second, '0')
      await user.click(submit)
      expect(screen.getByRole('alert')).toBeInTheDocument()

      await user.type(second, '1')

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('while a request is in flight', () => {
    it('marks the button busy and ignores further submissions', async () => {
      const pending = deferred()
      calculateMock.mockReturnValue(pending.promise)
      const { user, first, second, submit, result } = setup()

      await user.type(first, '2')
      await user.type(second, '3')
      await user.click(submit)

      expect(submit).toHaveAttribute('aria-disabled', 'true')
      expect(submit).toHaveTextContent('Calculating…')

      await user.click(submit)
      await user.type(second, '{Enter}')
      expect(calculateMock).toHaveBeenCalledTimes(1)

      await act(async () => pending.resolve({ ok: true, result: 5 }))

      expect(submit).toHaveAttribute('aria-disabled', 'false')
      expect(submit).toHaveTextContent('Calculate')
      expect(result).toHaveTextContent('2 + 3 = 5')
    })

    it('discards a response that arrives after the inputs changed', async () => {
      const pending = deferred()
      calculateMock.mockReturnValue(pending.promise)
      const { user, first, second, submit, result } = setup()

      await user.type(first, '2')
      await user.type(second, '3')
      await user.click(submit)
      await user.type(first, '0') // now "20 + 3"

      await act(async () => pending.resolve({ ok: true, result: 5 }))

      expect(result).toBeEmptyDOMElement()
      expect(submit).toHaveAttribute('aria-disabled', 'false')
    })
  })
})
