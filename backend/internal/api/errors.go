package api

import (
	"encoding/json"
	"log"
	"net/http"
)

// Error codes sent in the "code" field of error responses. Clients should
// branch on these, not on the human-readable message.
const (
	codeInvalidJSON          = "INVALID_JSON"
	codeValidation           = "VALIDATION_ERROR"
	codeDivisionByZero       = "DIVISION_BY_ZERO"
	codeResultOutOfRange     = "RESULT_OUT_OF_RANGE"
	codePayloadTooLarge      = "PAYLOAD_TOO_LARGE"
	codeUnsupportedMediaType = "UNSUPPORTED_MEDIA_TYPE"
	codeMethodNotAllowed     = "METHOD_NOT_ALLOWED"
	codeNotFound             = "NOT_FOUND"
	codeInternal             = "INTERNAL_ERROR"
)

// apiError is a failure with a defined HTTP representation.
type apiError struct {
	Status  int
	Code    string
	Message string
}

func badRequest(code, message string) *apiError {
	return &apiError{Status: http.StatusBadRequest, Code: code, Message: message}
}

// internalError returns a new value on every call so no caller can modify a
// shared instance.
func internalError() *apiError {
	return &apiError{
		Status:  http.StatusInternalServerError,
		Code:    codeInternal,
		Message: "internal server error",
	}
}

// errorResponse is the JSON body of every error response:
//
//	{"error": {"code": "DIVISION_BY_ZERO", "message": "cannot divide by zero"}}
type errorResponse struct {
	Error errorDetail `json:"error"`
}

type errorDetail struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func writeError(w http.ResponseWriter, e *apiError) {
	writeJSON(w, e.Status, errorResponse{Error: errorDetail{Code: e.Code, Message: e.Message}})
}

// writeJSON encodes v fully before writing anything, so that an encoding
// failure becomes a clean 500 rather than a 200 with a truncated body.
func writeJSON(w http.ResponseWriter, status int, v any) {
	body, err := json.Marshal(v)
	if err != nil {
		log.Printf("encode response: %v", err)
		status = http.StatusInternalServerError
		body = []byte(`{"error":{"code":"` + codeInternal + `","message":"internal server error"}}`)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(body)
}
