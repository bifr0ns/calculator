// Package api exposes the calculator over HTTP as a JSON REST API.
package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"

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

type calculateRequest struct {
	Operation string
	A, B      float64
}

type calculateResponse struct {
	Result float64 `json:"result"`
}

func handleCalculate(w http.ResponseWriter, r *http.Request) {
	if apiErr := checkContentType(r); apiErr != nil {
		writeError(w, apiErr)
		return
	}

	req, apiErr := decodeCalculateRequest(w, r)
	if apiErr != nil {
		writeError(w, apiErr)
		return
	}

	result, err := calculator.Calculate(calculator.Operation(req.Operation), req.A, req.B)
	if err != nil {
		writeError(w, calculationError(err))
		return
	}

	writeJSON(w, http.StatusOK, calculateResponse{Result: result})
}

// checkContentType requires a JSON body. Besides making the contract
// explicit, this means browsers cannot send the request cross-origin as a
// "simple" request (text/plain or form-encoded) without a CORS preflight.
func checkContentType(r *http.Request) *apiError {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		return &apiError{
			Status:  http.StatusUnsupportedMediaType,
			Code:    codeUnsupportedMediaType,
			Message: "Content-Type must be application/json",
		}
	}
	return nil
}

// requestFields are the only keys a request may contain, matched exactly.
var requestFields = map[string]bool{"operation": true, "a": true, "b": true}

// decodeCalculateRequest parses and validates the body.
//
// It reads the object key by key instead of unmarshalling into a struct,
// because encoding/json matches keys case-insensitively ("A" fills a) and
// lets a repeated key silently overwrite the first; both are rejected here.
func decodeCalculateRequest(w http.ResponseWriter, r *http.Request) (calculateRequest, *apiError) {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	fields, apiErr := readObject(json.NewDecoder(r.Body))
	if apiErr != nil {
		return calculateRequest{}, apiErr
	}

	var req calculateRequest
	if req.Operation, apiErr = operationField(fields); apiErr != nil {
		return calculateRequest{}, apiErr
	}
	if req.A, apiErr = operandField(fields, "a"); apiErr != nil {
		return calculateRequest{}, apiErr
	}
	if req.B, apiErr = operandField(fields, "b"); apiErr != nil {
		return calculateRequest{}, apiErr
	}
	return req, nil
}

// readObject reads exactly one JSON object whose keys are all known and
// unique, and returns its values undecoded. Only whitespace may follow it.
func readObject(dec *json.Decoder) (map[string]json.RawMessage, *apiError) {
	tok, err := dec.Token()
	if err != nil {
		return nil, decodeError(err)
	}
	if tok != json.Delim('{') {
		return nil, badRequest(codeInvalidJSON, "request body must be a JSON object")
	}

	fields := make(map[string]json.RawMessage, len(requestFields))
	for dec.More() {
		tok, err := dec.Token()
		if err != nil {
			return nil, decodeError(truncated(err))
		}
		// Inside an object, Token always returns keys as strings.
		key, _ := tok.(string)
		if !requestFields[key] {
			return nil, badRequest(codeValidation,
				fmt.Sprintf("unknown field %q (fields are case-sensitive: operation, a, b)", key))
		}
		if _, seen := fields[key]; seen {
			return nil, badRequest(codeValidation, fmt.Sprintf("duplicate field %q", key))
		}

		var value json.RawMessage
		if err := dec.Decode(&value); err != nil {
			return nil, decodeError(truncated(err))
		}
		fields[key] = value
	}
	if _, err := dec.Token(); err != nil { // the closing '}'
		return nil, decodeError(truncated(err))
	}

	if _, err := dec.Token(); !errors.Is(err, io.EOF) {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			return nil, decodeError(err)
		}
		return nil, badRequest(codeInvalidJSON, "request body must contain a single JSON object")
	}
	return fields, nil
}

// truncated reports running out of input part-way through the object as
// invalid JSON rather than as an empty body. Older Go versions (e.g. 1.22)
// return a plain io.EOF there; newer ones already return io.ErrUnexpectedEOF.
func truncated(err error) error {
	if errors.Is(err, io.EOF) {
		return io.ErrUnexpectedEOF
	}
	return err
}

func operationField(fields map[string]json.RawMessage) (string, *apiError) {
	raw, ok := fields["operation"]
	if !ok || isNull(raw) {
		return "", badRequest(codeValidation, "operation is required")
	}
	var op string
	if err := json.Unmarshal(raw, &op); err != nil {
		return "", badRequest(codeValidation, "operation must be a string")
	}
	if op == "" {
		return "", badRequest(codeValidation, "operation is required")
	}
	return op, nil
}

func operandField(fields map[string]json.RawMessage, name string) (float64, *apiError) {
	raw, ok := fields[name]
	if !ok || isNull(raw) {
		return 0, badRequest(codeValidation, name+" is required")
	}
	var value float64
	if err := json.Unmarshal(raw, &value); err != nil {
		if isNumber(raw) {
			// Valid JSON, but too large for a float64, e.g. 1e400.
			return 0, badRequest(codeValidation, name+" is out of range")
		}
		return 0, badRequest(codeValidation, name+" must be a number")
	}
	return value, nil
}

func isNull(raw json.RawMessage) bool {
	return string(raw) == "null"
}

func isNumber(raw json.RawMessage) bool {
	return len(raw) > 0 && (raw[0] == '-' || (raw[0] >= '0' && raw[0] <= '9'))
}

// decodeError translates a JSON syntax or body size error into an API error.
func decodeError(err error) *apiError {
	var (
		maxBytesErr *http.MaxBytesError
		syntaxErr   *json.SyntaxError
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
	default:
		return badRequest(codeInvalidJSON, "request body could not be read")
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
		return internalError()
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
