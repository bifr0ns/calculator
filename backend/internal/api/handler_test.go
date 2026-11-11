package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func serve(t *testing.T, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	NewHandler().ServeHTTP(rec, req)
	return rec
}

func assertJSON(t *testing.T, rec *httptest.ResponseRecorder) {
	t.Helper()
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}
}

// assertError checks the status and the error envelope of a response.
// wantMsg is a substring of the message; empty means "don't check".
func assertError(t *testing.T, rec *httptest.ResponseRecorder, wantStatus int, wantCode, wantMsg string) {
	t.Helper()
	assertJSON(t, rec)
	if rec.Code != wantStatus {
		t.Errorf("status = %d, want %d (body: %s)", rec.Code, wantStatus, rec.Body)
	}
	var resp errorResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("body is not an error response: %v (body: %s)", err, rec.Body)
	}
	if resp.Error.Code != wantCode {
		t.Errorf("code = %q, want %q (message: %q)", resp.Error.Code, wantCode, resp.Error.Message)
	}
	if resp.Error.Message == "" {
		t.Error("message is empty")
	}
	if wantMsg != "" && !strings.Contains(resp.Error.Message, wantMsg) {
		t.Errorf("message = %q, want it to contain %q", resp.Error.Message, wantMsg)
	}
}

func TestCalculateSuccess(t *testing.T) {
	tests := []struct {
		name string
		body string
		want float64
	}{
		{"add", `{"operation":"add","a":2,"b":3}`, 5},
		{"subtract", `{"operation":"subtract","a":2,"b":3}`, -1},
		{"multiply", `{"operation":"multiply","a":-4,"b":2.5}`, -10},
		{"divide", `{"operation":"divide","a":10,"b":4}`, 2.5},
		{"explicit zero operands", `{"operation":"add","a":0,"b":0}`, 0},
		{"field order does not matter", `{"b":3,"a":2,"operation":"subtract"}`, -1},
		{"exponent notation", `{"operation":"multiply","a":1e3,"b":2}`, 2000},
		{"surrounding whitespace", " \n{\"operation\":\"add\",\"a\":1,\"b\":1}\n ", 2},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := serve(t, http.MethodPost, "/api/v1/calculate", tt.body)

			assertJSON(t, rec)
			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, want 200 (body: %s)", rec.Code, rec.Body)
			}
			var resp calculateResponse
			if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
				t.Fatalf("decode body: %v", err)
			}
			if resp.Result != tt.want {
				t.Errorf("result = %v, want %v", resp.Result, tt.want)
			}
		})
	}
}

func TestCalculateResponseShape(t *testing.T) {
	rec := serve(t, http.MethodPost, "/api/v1/calculate", `{"operation":"add","a":1,"b":2}`)

	if got, want := rec.Body.String(), `{"result":3}`; got != want {
		t.Errorf("body = %s, want %s", got, want)
	}
}

func TestCalculateErrors(t *testing.T) {
	tests := []struct {
		name       string
		body       string
		wantStatus int
		wantCode   string
		wantMsg    string
	}{
		// Malformed JSON
		{"empty body", ``, 400, codeInvalidJSON, "empty"},
		{"syntax error", `{"operation":"add",}`, 400, codeInvalidJSON, "not valid JSON"},
		{"truncated body", `{"operation":"add"`, 400, codeInvalidJSON, "not valid JSON"},
		{"not JSON at all", `add 1 2`, 400, codeInvalidJSON, "not valid JSON"},
		{"array instead of object", `[1,2]`, 400, codeInvalidJSON, "JSON object"},
		{"string instead of object", `"add"`, 400, codeInvalidJSON, "JSON object"},
		{"trailing garbage", `{"operation":"add","a":1,"b":2} x`, 400, codeInvalidJSON, "single JSON object"},
		{"two objects", `{"operation":"add","a":1,"b":2}{}`, 400, codeInvalidJSON, "single JSON object"},

		// Missing fields
		{"empty object", `{}`, 400, codeValidation, "operation is required"},
		{"missing operation", `{"a":1,"b":2}`, 400, codeValidation, "operation is required"},
		{"empty operation", `{"operation":"","a":1,"b":2}`, 400, codeValidation, "operation is required"},
		{"missing a", `{"operation":"add","b":2}`, 400, codeValidation, "a is required"},
		{"missing b", `{"operation":"add","a":1}`, 400, codeValidation, "b is required"},
		{"null operand", `{"operation":"add","a":null,"b":2}`, 400, codeValidation, "a is required"},

		// Invalid types and values
		{"string operand", `{"operation":"add","a":"1","b":2}`, 400, codeValidation, "a must be a number"},
		{"boolean operand", `{"operation":"add","a":1,"b":true}`, 400, codeValidation, "b must be a number"},
		{"object operand", `{"operation":"add","a":{"v":1},"b":2}`, 400, codeValidation, "a must be a number"},
		{"numeric operation", `{"operation":1,"a":1,"b":2}`, 400, codeValidation, "operation must be a string"},
		{"operand out of float64 range", `{"operation":"add","a":1e400,"b":1}`, 400, codeValidation, "a is out of range"},
		{"unknown field", `{"operation":"add","a":1,"b":2,"c":3}`, 400, codeValidation, `unknown field "c"`},

		// Unsupported operations
		{"unsupported operation", `{"operation":"power","a":2,"b":3}`, 400, codeValidation, `unsupported operation "power"`},
		{"operation is case-sensitive", `{"operation":"ADD","a":2,"b":3}`, 400, codeValidation, "unsupported operation"},

		// Arithmetic errors
		{"division by zero", `{"operation":"divide","a":1,"b":0}`, 422, codeDivisionByZero, "divide by zero"},
		{"division by negative zero", `{"operation":"divide","a":1,"b":-0}`, 422, codeDivisionByZero, ""},
		{"zero divided by zero", `{"operation":"divide","a":0,"b":0}`, 422, codeDivisionByZero, ""},
		{"multiplication overflow", `{"operation":"multiply","a":1e308,"b":10}`, 422, codeResultOutOfRange, ""},
		{"addition overflow", `{"operation":"add","a":1.7e308,"b":1.7e308}`, 422, codeResultOutOfRange, ""},

		// Size limit
		{
			"oversized body",
			`{"operation":"add","a":1,"b":2` + strings.Repeat(" ", maxBodyBytes) + `}`,
			413, codePayloadTooLarge, "must not exceed",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := serve(t, http.MethodPost, "/api/v1/calculate", tt.body)
			assertError(t, rec, tt.wantStatus, tt.wantCode, tt.wantMsg)
		})
	}
}

func TestRouting(t *testing.T) {
	t.Run("health check", func(t *testing.T) {
		rec := serve(t, http.MethodGet, "/api/v1/health", "")
		assertJSON(t, rec)
		if rec.Code != http.StatusOK {
			t.Errorf("status = %d, want 200", rec.Code)
		}
		if got, want := rec.Body.String(), `{"status":"ok"}`; got != want {
			t.Errorf("body = %s, want %s", got, want)
		}
	})

	methodTests := []struct {
		method, path, wantAllow string
	}{
		{http.MethodGet, "/api/v1/calculate", "POST"},
		{http.MethodPut, "/api/v1/calculate", "POST"},
		{http.MethodDelete, "/api/v1/calculate", "POST"},
		{http.MethodPost, "/api/v1/health", "GET, HEAD"},
	}
	for _, tt := range methodTests {
		t.Run(tt.method+" "+tt.path+" is not allowed", func(t *testing.T) {
			rec := serve(t, tt.method, tt.path, "")
			assertError(t, rec, http.StatusMethodNotAllowed, codeMethodNotAllowed, tt.method)
			if got := rec.Header().Get("Allow"); got != tt.wantAllow {
				t.Errorf("Allow = %q, want %q", got, tt.wantAllow)
			}
		})
	}

	for _, path := range []string{"/", "/api", "/api/v1", "/api/v1/calculate/extra", "/api/calculate"} {
		t.Run("unknown path "+path, func(t *testing.T) {
			rec := serve(t, http.MethodPost, path, "")
			assertError(t, rec, http.StatusNotFound, codeNotFound, "")
		})
	}
}
