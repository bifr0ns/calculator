import { describe, expect, it } from 'vitest'
import { formatResult, parseOperand } from './numbers'

describe('parseOperand', () => {
  it.each([
    ['0', 0],
    ['42', 42],
    ['-7', -7],
    ['3.14', 3.14],
    ['-0.5', -0.5],
    ['.5', 0.5],
    ['-.5', -0.5],
    ['5.', 5],
    ['007', 7],
    ['  12  ', 12],
    ['-0', -0],
    ['0.000', 0],
    ['1.50000000000000000000', 1.5], // trailing zeros are not significant
    ['000000000000000000000012', 12], // nor are leading ones
    ['999999999999999', 999999999999999], // 15 significant digits
    ['-0.123456789012345', -0.123456789012345],
    ['9007199254740991', 9007199254740991], // 16 digits, but exactly representable
    ['1' + '0'.repeat(21), 1e21],
    ['0.' + '0'.repeat(20) + '1', 1e-21],
  ])('accepts %j as %d', (raw, expected) => {
    expect(parseOperand(raw)).toEqual({ ok: true, value: expected })
  })

  it.each([
    '9007199254740993', // would be sent as 9007199254740992
    '12345678901234567890', // would be sent as 12345678901234567000
    '123456789.123456789',
    '0.1000000000000000055511151231257827',
    '-1.0000000000000001',
  ])('rejects %j, which a float64 cannot hold exactly', (raw) => {
    expect(parseOperand(raw)).toEqual({
      ok: false,
      message: 'This number has too many digits to calculate exactly. Use at most 15 significant digits.',
    })
  })

  it('accepts every value with up to 15 significant digits', () => {
    // Sample across magnitudes; DBL_DIG = 15 guarantees all of these round-trip.
    for (const text of ['123456789012345', '1.23456789012345', '0.000123456789012345', '-98765.4321098765', '3.14159265358979']) {
      expect(parseOperand(text)).toMatchObject({ ok: true })
    }
  })

  it('rejects numbers too small to represent instead of sending 0', () => {
    expect(parseOperand('0.' + '0'.repeat(400) + '1')).toEqual({ ok: false, message: 'This number is too small.' })
  })

  it('handles very long input in linear time', () => {
    const start = performance.now()
    parseOperand('0'.repeat(200_000) + '1')
    parseOperand('1' + '0'.repeat(200_000) + '.5')
    expect(performance.now() - start).toBeLessThan(500)
  })

  it.each(['', '   ', '\t'])('asks for a number when the input is blank (%j)', (raw) => {
    expect(parseOperand(raw)).toEqual({ ok: false, message: 'Enter a number.' })
  })

  it.each([
    'abc',
    '1,000',
    '1 000',
    '1e3',
    '0x10',
    '+5',
    '--5',
    '1.2.3',
    '5-',
    '-',
    '.',
    'Infinity',
    'NaN',
    '١٢', // non-ASCII digits
  ])('rejects %j', (raw) => {
    const result = parseOperand(raw)
    expect(result.ok).toBe(false)
    expect(result).toHaveProperty('message', expect.stringContaining('valid number'))
  })

  it('rejects numbers too large to represent', () => {
    expect(parseOperand('9'.repeat(400))).toEqual({ ok: false, message: 'This number is too large.' })
  })
})

describe('formatResult', () => {
  it.each([
    [5, '5'],
    [-12, '-12'],
    [0, '0'],
    [2.5, '2.5'],
    [-0.75, '-0.75'],
  ])('formats ordinary values: %d -> %s', (value, expected) => {
    expect(formatResult(value)).toBe(expected)
  })

  it('shows negative zero as 0', () => {
    expect(formatResult(-0)).toBe('0')
    expect(formatResult(-1e-200 * 1e-200)).toBe('0') // underflows to -0
  })

  describe('floating-point representation noise', () => {
    it.each([
      ['0.1 + 0.2', 0.1 + 0.2, '0.3'],
      ['0.7 + 0.1', 0.7 + 0.1, '0.8'],
      ['0.3 - 0.1', 0.3 - 0.1, '0.2'],
      ['0.1 * 3', 0.1 * 3, '0.3'],
      ['1.1 * 1.1', 1.1 * 1.1, '1.21'],
      ['0.3 / 0.1', 0.3 / 0.1, '3'],
      ['4.35 * 100', 4.35 * 100, '435'],
      ['-(0.1 + 0.2)', -(0.1 + 0.2), '-0.3'],
    ])('cleans up %s', (_label, value, expected) => {
      expect(value).not.toBe(Number(expected)) // the raw value really is noisy
      expect(formatResult(value)).toBe(expected)
    })

    it.each([
      ['1 / 3', 1 / 3, '0.3333333333333333'],
      ['2 / 3', 2 / 3, '0.6666666666666666'],
      ['-1 / 3', -1 / 3, '-0.3333333333333333'],
      ['0.1234567890123456', 0.1234567890123456, '0.1234567890123456'],
      ['1 + 1e-15', 1 + 1e-15, '1.000000000000001'],
    ])('keeps significant digits of %s', (_label, value, expected) => {
      expect(formatResult(value)).toBe(expected)
    })
  })

  describe('large values', () => {
    it.each([
      [1234567890123456, '1234567890123456'],
      [Number.MAX_SAFE_INTEGER, '9007199254740991'],
      [-Number.MAX_SAFE_INTEGER, '-9007199254740991'],
      [2 ** 53, '9007199254740992'],
      [1e20, '100000000000000000000'],
    ])('never rounds integers: %d', (value, expected) => {
      expect(formatResult(value)).toBe(expected)
    })

    it.each([
      [1e21, '1e+21'],
      [1.5e300, '1.5e+300'],
      [Number.MAX_VALUE, '1.7976931348623157e+308'],
      [-Number.MAX_VALUE, '-1.7976931348623157e+308'],
    ])('uses exponent notation for %d', (value, expected) => {
      expect(formatResult(value)).toBe(expected)
    })

    it('keeps the fractional digits of large non-integers', () => {
      expect(formatResult(123456789012.34567)).toBe('123456789012.34567')
    })
  })

  describe('small values', () => {
    it.each([
      [0.000001, '0.000001'],
      [1e-7, '1e-7'],
      [-1.5e-10, '-1.5e-10'],
      [1e-300, '1e-300'],
      [1e-320, '1e-320'], // subnormal
      [Number.MIN_VALUE, '5e-324'], // smallest positive float64
      [-Number.MIN_VALUE, '-5e-324'],
    ])('formats %d without rounding it to 0', (value, expected) => {
      expect(formatResult(value)).toBe(expected)
    })

    it('cleans up noise at small magnitudes too', () => {
      expect(formatResult(0.1e-10 + 0.2e-10)).toBe('3e-11')
    })
  })

  it('round-trips: the displayed text parses back to (almost) the same value', () => {
    for (const value of [0.1 + 0.2, 1 / 3, 1e-7, Number.MAX_VALUE, Number.MIN_VALUE, 1234567890123456]) {
      const shown = Number(formatResult(value))
      expect(Math.abs(shown - value)).toBeLessThanOrEqual(Math.abs(value) * Number.EPSILON)
    }
  })
})
