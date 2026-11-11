export type ParseResult =
  | { ok: true; value: number }
  | { ok: false; message: string }

// An optional minus sign, then digits with an optional fractional part
// ("12", "-3.5", "5.") or a bare fraction (".5"). Deliberately rejects
// exponents, thousands separators, hex, "Infinity" and so on, which Number()
// would otherwise accept or silently turn into 0 (as it does for "").
const NUMBER_PATTERN = /^-?(\d+(\.\d*)?|\.\d+)$/

/** Parses user input into a number to send to the API. */
export function parseOperand(raw: string): ParseResult {
  const text = raw.trim()
  if (text === '') {
    return { ok: false, message: 'Enter a number.' }
  }
  if (!NUMBER_PATTERN.test(text)) {
    return { ok: false, message: 'Enter a valid number, such as 12, -3.5 or 0.25.' }
  }

  const value = Number(text)
  if (!Number.isFinite(value)) {
    // Only reachable with hundreds of digits, e.g. "9".repeat(400).
    return { ok: false, message: 'This number is too large.' }
  }
  return { ok: true, value }
}

// 15 significant digits is the most a float64 can round-trip for every
// decimal input, so it is the precision at which representation error
// (0.1 + 0.2 = 0.30000000000000004) disappears.
const DISPLAY_PRECISION = 15

/**
 * Formats a result from the API for display.
 *
 * Binary floating point cannot represent most decimals exactly, so results
 * such as 0.1 + 0.2 come back as 0.30000000000000004. This hides that noise
 * without ever changing a value in a way a reader could notice:
 *
 * - Integers are shown exactly as received: 9007199254740991 must not
 *   become 9007199254740990.
 * - Otherwise the value is rounded to 15 significant digits, but only when
 *   that changes it by at most about one unit in the last place (relative
 *   error <= Number.EPSILON). Values whose extra digits are real, such as
 *   1 / 3 = 0.3333333333333333, are shown in full.
 * - Negative zero is shown as "0".
 * - Very large and very small values use JavaScript's exponent notation
 *   (1e+21, 5e-324), which is unambiguous and loses no information.
 */
export function formatResult(value: number): string {
  if (!Number.isFinite(value) || Number.isInteger(value)) {
    return String(value) // String(-0) is "0"
  }

  const rounded = Number(value.toPrecision(DISPLAY_PRECISION))
  const isRepresentationNoise =
    Number.isFinite(rounded) && Math.abs(rounded - value) <= Math.abs(value) * Number.EPSILON

  return String(isRepresentationNoise ? rounded : value)
}
