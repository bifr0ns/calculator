export type Operation = 'add' | 'subtract' | 'multiply' | 'divide'

/**
 * The outcome of a calculation request. Expected failures are returned, not
 * thrown, so callers must handle both branches.
 *
 * `code` is either an API error code (e.g. "DIVISION_BY_ZERO") or one of the
 * client-side codes below.
 */
export type CalculateOutcome =
  | { ok: true; result: number }
  | { ok: false; code: string; message: string }

/**
 * The calculator service could not be reached: the request itself failed, or
 * a proxy in front of the service reported it unavailable (502/503/504).
 */
export const NETWORK_ERROR = 'NETWORK_ERROR'
/** The server answered with something other than the documented contract. */
export const UNEXPECTED_RESPONSE = 'UNEXPECTED_RESPONSE'

const ENDPOINT = '/api/v1/calculate'

// Statuses a proxy or load balancer returns when the service behind it is down
// or not responding (in development, Vite's proxy answers 502 with an empty
// body when the Go server is not running).
const GATEWAY_ERROR_STATUSES = new Set([502, 503, 504])

function unreachable(): CalculateOutcome {
  return {
    ok: false,
    code: NETWORK_ERROR,
    message: 'Could not reach the server. Please try again in a moment.',
  }
}

export async function calculate(operation: Operation, a: number, b: number): Promise<CalculateOutcome> {
  let response: Response
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ operation, a, b }),
    })
  } catch {
    return unreachable()
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = undefined // not JSON, e.g. an HTML error page from a proxy
  }

  if (response.ok && isSuccessBody(body)) {
    return { ok: true, result: body.result }
  }
  if (!response.ok && isErrorBody(body)) {
    return { ok: false, code: body.error.code, message: body.error.message }
  }
  if (GATEWAY_ERROR_STATUSES.has(response.status)) {
    return unreachable()
  }
  return {
    ok: false,
    code: UNEXPECTED_RESPONSE,
    message: `The server returned an unexpected response (HTTP ${response.status}). Please try again.`,
  }
}

function isSuccessBody(body: unknown): body is { result: number } {
  return (
    typeof body === 'object' &&
    body !== null &&
    'result' in body &&
    typeof body.result === 'number' &&
    Number.isFinite(body.result)
  )
}

function isErrorBody(body: unknown): body is { error: { code: string; message: string } } {
  if (typeof body !== 'object' || body === null || !('error' in body)) {
    return false
  }
  const { error } = body
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string'
  )
}
