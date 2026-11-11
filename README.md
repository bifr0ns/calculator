# Calculator: Sezzle technical assignment

A full-stack calculator. A Go REST API performs addition, subtraction, multiplication and division. A React + TypeScript app validates the input, sends it to the API, and shows the result or a clear error message.

| Layer | Stack |
|---|---|
| Backend | Go 1.22+, standard library only (`net/http`, `encoding/json`) |
| Frontend | React 19, TypeScript 7, Vite 8, plain CSS (no UI framework) |
| Tests | Go `testing` + `net/http/httptest`; Vitest, React Testing Library, jsdom |

## Prerequisites

- **Go 1.22 or newer.** The tests pass on Go 1.22.12 and 1.27.4.
- **Node.js 22.22.2+, 24.15+ or 26+**, with npm. These are the lowest versions the test tools (Vitest, jsdom) support. Verified with Node 26.13.0 and npm 11.20.0.

## Running locally

Use two terminals.

**Backend** (listens on port 8080; set the `PORT` environment variable to change it):

```bash
cd backend
go run ./cmd/server
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev
```

Then open http://localhost:5173.

In development, Vite forwards every `/api/*` request to `http://localhost:8080` (see [`frontend/vite.config.ts`](frontend/vite.config.ts)), so the backend must be running on port 8080. If you change `PORT`, change the proxy target as well.

> **Windows PowerShell:** if `npm` fails with *"running scripts is disabled on this system"*, use `npm.cmd` instead (for example, `npm.cmd install` and `npm.cmd run dev`).

## Tests and coverage

**Backend:**

```bash
cd backend
go test ./...                             # run all tests
go test -cover ./...                      # coverage per package
go test -coverprofile=coverage.out ./...  # write a coverage profile (git-ignored)
go tool cover -func=coverage.out          # coverage per function
go tool cover -html=coverage.out          # HTML report, opens in a browser
```

**Frontend:**

```bash
cd frontend
npm test            # run the tests once (Vitest)
npm run coverage    # tests + coverage: prints a summary, writes the HTML report to frontend/coverage/index.html
npm run typecheck   # TypeScript check (tsc -b)
npm run lint        # oxlint
npm run build       # type check + production bundle in frontend/dist
```

### Current results (commit `ecc3823`)

The backend has 103 passing tests and subtests; the frontend has 134.

| Area | Statement coverage |
|---|---|
| `backend/internal/calculator` | 100% |
| `backend/internal/api` | 92.0% |
| `backend/cmd/server` | **0%** (no tests) |
| `frontend/src/numbers.ts`, `api/calculatorClient.ts`, `components/Calculator.tsx` | 100% |
| `frontend/src/App.tsx` | **0%** (a 3-line wrapper) |
| Frontend overall | 99.0% of statements, 100% of branches |

**What the tests cover:**
- **Backend:**
  - Table-driven tests of the arithmetic, including overflow and division by zero.
  - `httptest` handler tests for every 4xx error code, routing (404/405), `Content-Type` rules, body size limits and malformed input. No test triggers the 500 response.
- **Frontend:**
  - Unit tests for input parsing, result formatting and the API client (with `fetch` replaced by a fake).
  - Component tests, with the API client replaced by a fake, covering:
    - submitting by click and by Enter, and keyboard-only use;
    - validation messages;
    - API, network and unexpected errors;
    - clearing old results when the inputs change;
    - behaviour while a request is in flight.

**What the tests don't cover:**
- `cmd/server/main.go`: start-up, `PORT`, graceful shutdown.
- A few defensive backend branches: failure to encode a response, an unreadable body, an unexpected calculator error.
- Browser end-to-end behaviour and the responsive layout. These were checked during development with a temporary Playwright script in Edge, at desktop, 375 px and 320 px widths, in light and dark mode. That script is **not** part of this repository, so `npm test` doesn't cover these behaviours.

## REST API

Every request and response body is JSON, including errors, 404 and 405.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/calculate` | Perform a calculation |
| `GET` | `/api/v1/health` | Health check; returns `{"status":"ok"}` |

### `POST /api/v1/calculate`

The `Content-Type: application/json` header is required. The body is a JSON object of at most 1 KiB with exactly these fields:

| Field | Type | Description |
|---|---|---|
| `operation` | string | `add`, `subtract`, `multiply` or `divide` (exact and case-sensitive) |
| `a` | number | First operand |
| `b` | number | Second operand. The result is `a <operation> b` |

Field names are case-sensitive. Each field may appear only once, and no other fields are allowed.

```bash
curl -i -X POST http://localhost:8080/api/v1/calculate \
  -H 'Content-Type: application/json' \
  -d '{"operation":"divide","a":10,"b":4}'
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{"result":2.5}
```

In Windows PowerShell 5.1, use `curl.exe`, and escape the inner quotes:

```powershell
curl.exe -X POST localhost:8080/api/v1/calculate -H "Content-Type: application/json" -d '{\"operation\":\"add\",\"a\":2,\"b\":3}'
```

### Errors

Every error uses the same shape. Clients should check `code`; `message` is for people to read.

```json
{"error":{"code":"DIVISION_BY_ZERO","message":"cannot divide by zero"}}
```

| Status | `code` | When |
|---|---|---|
| 400 | `INVALID_JSON` | Empty body, malformed JSON, a body that isn't an object, or extra data after the object |
| 400 | `VALIDATION_ERROR` | A field is missing or `null`, has the wrong type, is unknown or in the wrong case, or appears twice; the operation is unsupported; or a number is too large to store |
| 413 | `PAYLOAD_TOO_LARGE` | Body larger than 1 KiB |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | `Content-Type` missing or not `application/json` |
| 422 | `DIVISION_BY_ZERO` | `divide` with `b` equal to 0 |
| 422 | `RESULT_OUT_OF_RANGE` | The result is too large to represent (overflow) |
| 404 | `NOT_FOUND` | Unknown path |
| 405 | `METHOD_NOT_ALLOWED` | Wrong HTTP method; the response includes an `Allow` header |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

The rule for 400 vs 422: **400** means the request is wrong on its face. **422** means it's well-formed, but the arithmetic has no result that can be represented.

Example request bodies and the API's actual responses:

| Request body | Status | Response |
|---|---|---|
| `{"operation":"divide","a":1,"b":0}` | 422 | `{"error":{"code":"DIVISION_BY_ZERO","message":"cannot divide by zero"}}` |
| `{"operation":"multiply","a":1e308,"b":10}` | 422 | `{"error":{"code":"RESULT_OUT_OF_RANGE","message":"result is too large to represent"}}` |
| `{"operation":"power","a":2,"b":3}` | 400 | `{"error":{"code":"VALIDATION_ERROR","message":"unsupported operation \"power\" (supported: add, subtract, multiply, divide)"}}` |
| `{"operation":"add","a":"1","b":2}` | 400 | `{"error":{"code":"VALIDATION_ERROR","message":"a must be a number"}}` |
| `{"operation":"add","a":1}` | 400 | `{"error":{"code":"VALIDATION_ERROR","message":"b is required"}}` |
| `{"operation":"add","A":1,"b":2}` | 400 | `{"error":{"code":"VALIDATION_ERROR","message":"unknown field \"A\" (fields are case-sensitive: operation, a, b)"}}` |
| `{"operation":"add","a":1,"a":2,"b":2}` | 400 | `{"error":{"code":"VALIDATION_ERROR","message":"duplicate field \"a\""}}` |
| Valid body without the `Content-Type` header | 415 | `{"error":{"code":"UNSUPPORTED_MEDIA_TYPE","message":"Content-Type must be application/json"}}` |

## Project structure

```
backend/
  cmd/server/main.go              server setup: PORT, timeouts, graceful shutdown
  internal/calculator/            the arithmetic; no HTTP or JSON
  internal/api/                   routes, request decoding and validation, error responses
frontend/
  src/numbers.ts                  input parsing and result formatting (pure functions)
  src/api/calculatorClient.ts     the only code that calls the API
  src/components/Calculator.tsx   form, UI state, rendering
```

## Design decisions

- **One endpoint, with the operation in the body.** One handler and one validation path; adding an operation only touches the calculator package.
- **Layers.**
  - `calculator.Calculate(op, a, b)` is pure Go and returns specific errors (`ErrDivisionByZero`, `ErrResultOutOfRange`, `ErrUnsupportedOperation`).
  - The `api` package alone turns those errors into HTTP statuses.
  - The frontend mirrors this split: pure functions, then the API client, then the component.
- **Standard library only on the backend.** Go 1.22's method-aware routes (`"POST /api/v1/calculate"`) do the routing. Catch-all routes return JSON 404 and 405 responses instead of Go's default plain-text ones.
- **Strict request decoding.** The handler reads the JSON object key by key instead of unmarshalling it into a struct. Unmarshalling would accept `"A"` for `a` (Go's JSON package matches field names case-insensitively) and would let a repeated key silently overwrite the first.
- **Defensive limits.**
  - The request body is capped at 1 KiB.
  - Server timeouts are set.
  - Every result is checked to be finite, because JSON can't encode infinity or NaN.
  - Responses are fully encoded before anything is sent, so an encoding failure becomes a clean 500 rather than a half-sent 200.
- **`Content-Type` is required.** It makes the contract explicit, and it stops browsers from sending a cross-origin POST without first checking with the server.
- **The backend is the single source of truth for arithmetic.** The frontend checks only that the input is well-formed. It doesn't check for division by zero; that error comes from the server like any other.
- **Input validation in the frontend.**
  - Inputs are text fields with a strict pattern: an optional `-`, digits, and an optional decimal part. This avoids `Number()` traps such as `""` → 0 and `"0x10"` → 16.
  - Numbers that a 64-bit float (double) can't hold exactly are rejected, so the expression on screen always matches what was sent. For example, `9007199254740993` would otherwise silently become `9007199254740992`.
- **Result display** (`formatResult`).
  - Floating-point noise is hidden: `0.1 + 0.2` shows as `0.3`.
  - Integers are never rounded, and real digits are kept: `1 / 3` shows as `0.3333333333333333`.
  - `-0` shows as `0`.
  - Very large and very small values use exponent notation.
- **The API client never throws for expected failures.**
  - `calculate()` returns either `{ ok: true, result }` or `{ ok: false, code, message }`, which TypeScript can tell apart.
  - A network failure and a gateway error without a JSON body (502/503/504) both become "Could not reach the server".
  - A response that doesn't match the contract becomes `UNEXPECTED_RESPONSE`.
- **No stale results.** Editing an operand or changing the operation clears the result. A response that arrives after the inputs changed is discarded.
- **Accessibility.**
  - A real `<form>`, so Enter submits.
  - The operations are native radio buttons styled as a segmented control.
  - Every input has a label, and errors are linked to their field with `aria-describedby`.
  - Results and errors are announced through live regions.
- **A dev proxy instead of CORS.** The frontend calls `/api` on its own origin, so the backend needs no CORS configuration.

## Assumptions, trade-offs and known limitations

- **Scope:** each calculation has two operands and one operation. There's no chaining, operator precedence, history or persistence.
- **Numbers are 64-bit floats** (`float64` in Go, `number` in TypeScript). A decimal library would have added a dependency for little benefit at this scope. As a result:
  - The API returns raw values such as `0.30000000000000004` for `0.1 + 0.2`. Only the UI rounds that away.
  - **The API returns `{"result":-0}`** for negative-zero results such as `0 × -5`. The UI shows `0`.
  - **The API silently rounds operands with more digits than a double holds.** `9007199254740993` is used as `9007199254740992`. The UI rejects such input, but other API clients aren't protected.
  - Results smaller than the smallest representable number become `0`.
- **The UI doesn't accept exponent notation** (`1e3`), even though it displays very large or small results in that form (`1e+21`). A displayed result can therefore not always be pasted back as input. The API itself accepts exponents.
- **`VALIDATION_ERROR` doesn't name the failing field** in a machine-readable way. The field only appears in `message`.
- **Built for local development.** The Go server doesn't serve the built frontend, and there's no CORS. The production build expects `/api` on the same origin, for example behind a reverse proxy.
- **Not implemented:** authentication, rate limiting, request logging, security headers such as `X-Content-Type-Options`, and a shared API schema such as OpenAPI. The list of operations is defined separately in Go and in TypeScript.
- See [Tests and coverage](#tests-and-coverage) for what the automated tests don't cover.
