// Package api exposes the calculator over HTTP as a JSON REST API.
package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"

	"sezzle-calculator/internal/calculator"
)

// maxBodyBytes caps the request body. A valid request is well under 100 bytes.
const maxBodyBytes = 1 << 10

// NewHandler returns the handler for the whole API. Every response,
// including routing errors (404, 405), has a JSON body.
func NewHandler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("POST /api/v1/calculate", handleCalculate)
	mux.HandleFunc("GET /api/v1/health", handleHealth)

	// Method-less patterns catch every other method on the same paths, so a
	// wrong method gets a JSON 405 instead of ServeMux's plain-text one.
	mux.HandleFunc("/api/v1/calculate", methodNotAllowed("POST"))
	mux.HandleFunc("/api/v1/health", methodNotAllowed("GET, HEAD"))
	mux.HandleFunc("/", handleNotFound)

	return mux
}

// calculateRequest uses pointers for the operands so that a missing (or null)
// operand can be told apart from an explicit 0.
type calculateRequest struct {
	Operation string   `json:"operation"`
	A         *float64 `json:"a"`
	B         *float64 `json:"b"`
}

type calculateResponse struct {
	Result float64 `json:"result"`
}

func handleCalculate(w http.ResponseWriter, r *http.Request) {
	req, apiErr := decodeCalculateRequest(w, r)
	if apiErr != nil {
		writeError(w, apiErr)
		return
	}

	result, err := calculator.Calculate(calculator.Operation(req.Operation), *req.A, *req.B)
	if err != nil {
		writeError(w, calculationError(err))
		return
	}

	writeJSON(w, http.StatusOK, calculateResponse{Result: result})
}

// decodeCalculateRequest parses and validates the body. On success the
// returned request has a non-empty Operation and non-nil A and B.
func decodeCalculateRequest(w http.ResponseWriter, r *http.Request) (calculateRequest, *apiError) {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()

	var req calculateRequest
	if err := dec.Decode(&req); err != nil {
		return req, decodeError(err)
	}

	// Decode stops after the first JSON value, so read again to make sure
	// nothing follows it (e.g. `{...}{...}` or `{...} garbage`).
	if err := dec.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			return req, decodeError(err)
		}
		return req, badRequest(codeInvalidJSON, "request body must contain a single JSON object")
	}

	switch {
	case req.Operation == "":
		return req, badRequest(codeValidation, "operation is required")
	case req.A == nil:
		return req, badRequest(codeValidation, "a is required")
	case req.B == nil:
		return req, badRequest(codeValidation, "b is required")
	}
	return req, nil
}

// decodeError translates an encoding/json (or body size) error into an API error.
func decodeError(err error) *apiError {
	var (
		maxBytesErr *http.MaxBytesError
		syntaxErr   *json.SyntaxError
		typeErr     *json.UnmarshalTypeError
	)

	switch {
	case errors.As(err, &maxBytesErr):
		return &apiError{
			Status:  http.StatusRequestEntityTooLarge,
			Code:    codePayloadTooLarge,
			Message: fmt.Sprintf("request body must not exceed %d bytes", maxBytesErr.Limit),
		}
	case errors.Is(err, io.EOF):
		return badRequest(codeInvalidJSON, "request body is empty")
	case errors.As(err, &syntaxErr), errors.Is(err, io.ErrUnexpectedEOF):
		return badRequest(codeInvalidJSON, "request body is not valid JSON")
	case errors.As(err, &typeErr):
		return typeError(typeErr)
	case strings.HasPrefix(err.Error(), "json: unknown field "):
		// encoding/json has no typed error for this case; matching the
		// message is the standard workaround.
		return badRequest(codeValidation, strings.TrimPrefix(err.Error(), "json: "))
	default:
		return badRequest(codeInvalidJSON, "request body is not valid JSON")
	}
}

func typeError(e *json.UnmarshalTypeError) *apiError {
	switch {
	case e.Field == "":
		// The body itself is not an object, e.g. `[1, 2]` or `"add"`.
		return badRequest(codeInvalidJSON, "request body must be a JSON object")
	case e.Field == "operation":
		return badRequest(codeValidation, "operation must be a string")
	case strings.HasPrefix(e.Value, "number"):
		// A numeric literal that does not fit in a float64, e.g. 1e400.
		return badRequest(codeValidation, e.Field+" is out of range")
	default:
		return badRequest(codeValidation, e.Field+" must be a number")
	}
}

// calculationError maps domain errors to API errors. Division by zero and
// overflow are 422: the request is well-formed, but has no representable result.
func calculationError(err error) *apiError {
	switch {
	case errors.Is(err, calculator.ErrUnsupportedOperation):
		return badRequest(codeValidation, err.Error())
	case errors.Is(err, calculator.ErrDivisionByZero):
		return &apiError{
			Status:  http.StatusUnprocessableEntity,
			Code:    codeDivisionByZero,
			Message: "cannot divide by zero",
		}
	case errors.Is(err, calculator.ErrResultOutOfRange):
		return &apiError{
			Status:  http.StatusUnprocessableEntity,
			Code:    codeResultOutOfRange,
			Message: "result is too large to represent",
		}
	default:
		log.Printf("calculate: unexpected error: %v", err)
		return errInternal
	}
}

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func methodNotAllowed(allow string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Allow", allow)
		writeError(w, &apiError{
			Status:  http.StatusMethodNotAllowed,
			Code:    codeMethodNotAllowed,
			Message: fmt.Sprintf("method %s is not allowed (allowed: %s)", r.Method, allow),
		})
	}
}

func handleNotFound(w http.ResponseWriter, _ *http.Request) {
	writeError(w, &apiError{
		Status:  http.StatusNotFound,
		Code:    codeNotFound,
		Message: "resource not found",
	})
}
