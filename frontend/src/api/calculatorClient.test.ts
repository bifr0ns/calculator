import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { calculate, NETWORK_ERROR, UNEXPECTED_RESPONSE } from './calculatorClient'

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('calculate', () => {
  it('sends the operation and operands as a JSON POST', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { result: 2.5 }))

    await calculate('divide', 10, 4)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/calculate')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json' })
    expect(JSON.parse(init?.body as string)).toEqual({ operation: 'divide', a: 10, b: 4 })
  })

  it('returns the result on success', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { result: 2.5 }))

    await expect(calculate('divide', 10, 4)).resolves.toEqual({ ok: true, result: 2.5 })
  })

  it('returns zero results correctly', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { result: 0 }))

    await expect(calculate('subtract', 1, 1)).resolves.toEqual({ ok: true, result: 0 })
  })

  it.each([
    [422, 'DIVISION_BY_ZERO', 'cannot divide by zero'],
    [422, 'RESULT_OUT_OF_RANGE', 'result is too large to represent'],
    [400, 'VALIDATION_ERROR', 'a must be a number'],
    [500, 'INTERNAL_ERROR', 'internal server error'],
  ])('passes through API errors (HTTP %i %s)', async (status, code, message) => {
    fetchMock.mockResolvedValue(jsonResponse(status, { error: { code, message } }))

    await expect(calculate('divide', 1, 0)).resolves.toEqual({ ok: false, code, message })
  })

  it('reports network failures', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(calculate('add', 1, 2)).resolves.toEqual({
      ok: false,
      code: NETWORK_ERROR,
      message: expect.stringContaining('Could not reach the server'),
    })
  })

  it.each([
    ['502 with an empty body (Vite proxy, backend not running)', new Response(null, { status: 502 })],
    ['502 with an HTML page', new Response('<html>Bad Gateway</html>', { status: 502, headers: { 'Content-Type': 'text/html' } })],
    ['503', new Response('Service Unavailable', { status: 503 })],
    ['504', new Response('Gateway Timeout', { status: 504 })],
  ])('reports a gateway error as the server being unreachable (%s)', async (_label, response) => {
    fetchMock.mockResolvedValue(response)

    await expect(calculate('add', 1, 2)).resolves.toEqual({
      ok: false,
      code: NETWORK_ERROR,
      message: expect.stringContaining('Could not reach the server'),
    })
  })

  it('passes through an API error envelope even with a gateway status', async () => {
    fetchMock.mockResolvedValue(jsonResponse(503, { error: { code: 'MAINTENANCE', message: 'back soon' } }))

    await expect(calculate('add', 1, 2)).resolves.toEqual({ ok: false, code: 'MAINTENANCE', message: 'back soon' })
  })

  it('reports a non-JSON response as unexpected', async () => {
    fetchMock.mockResolvedValue(
      new Response('<html>Internal Server Error</html>', { status: 500, headers: { 'Content-Type': 'text/html' } }),
    )

    await expect(calculate('add', 1, 2)).resolves.toEqual({
      ok: false,
      code: UNEXPECTED_RESPONSE,
      message: expect.stringContaining('HTTP 500'),
    })
  })

  it('reports a non-JSON success response as unexpected', async () => {
    fetchMock.mockResolvedValue(new Response('5', { status: 200, headers: { 'Content-Type': 'text/plain' } }))

    await expect(calculate('add', 1, 2)).resolves.toMatchObject({ ok: false, code: UNEXPECTED_RESPONSE })
  })

  it('reports an empty response as unexpected', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }))

    await expect(calculate('add', 1, 2)).resolves.toMatchObject({ ok: false, code: UNEXPECTED_RESPONSE })
  })

  it.each([
    ['missing result', {}],
    ['string result', { result: '3' }],
    ['null result', { result: null }],
    ['array body', [3]],
    ['null body', null],
  ])('reports a malformed success body as unexpected (%s)', async (_label, body) => {
    fetchMock.mockResolvedValue(jsonResponse(200, body))

    await expect(calculate('add', 1, 2)).resolves.toMatchObject({ ok: false, code: UNEXPECTED_RESPONSE })
  })

  it.each([
    ['no error envelope', { message: 'nope' }],
    ['error is a string', { error: 'nope' }],
    ['missing message', { error: { code: 'X' } }],
    ['non-string code', { error: { code: 1, message: 'x' } }],
  ])('reports a malformed error body as unexpected (%s)', async (_label, body) => {
    fetchMock.mockResolvedValue(jsonResponse(400, body))

    await expect(calculate('add', 1, 2)).resolves.toMatchObject({ ok: false, code: UNEXPECTED_RESPONSE })
  })

  it('does not treat an error envelope with a 200 status as success', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { error: { code: 'X', message: 'x' } }))

    await expect(calculate('add', 1, 2)).resolves.toMatchObject({ ok: false, code: UNEXPECTED_RESPONSE })
  })
})
