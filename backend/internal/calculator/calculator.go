// Package calculator implements the arithmetic supported by the API.
// It has no knowledge of HTTP or JSON.
package calculator

import (
	"errors"
	"fmt"
	"math"
)

// Operation identifies an arithmetic operation.
type Operation string

// Supported operations. Matching is exact and case-sensitive.
const (
	Add      Operation = "add"
	Subtract Operation = "subtract"
	Multiply Operation = "multiply"
	Divide   Operation = "divide"
)

// Errors returned by Calculate. Compare them with errors.Is.
var (
	ErrUnsupportedOperation = errors.New("unsupported operation")
	ErrDivisionByZero       = errors.New("division by zero")
	ErrResultOutOfRange     = errors.New("result is out of range")
)

// Calculate returns the result of "a op b".
//
// The result is always a finite number. If the computation produces an
// infinity or NaN (with finite operands this only happens on overflow, such as
// math.MaxFloat64 * 2), ErrResultOutOfRange is returned instead.
func Calculate(op Operation, a, b float64) (float64, error) {
	var result float64

	switch op {
	case Add:
		result = a + b
	case Subtract:
		result = a - b
	case Multiply:
		result = a * b
	case Divide:
		if b == 0 { // also true for -0
			return 0, ErrDivisionByZero
		}
		result = a / b
	default:
		return 0, fmt.Errorf("%w %q (supported: add, subtract, multiply, divide)", ErrUnsupportedOperation, op)
	}

	if math.IsInf(result, 0) || math.IsNaN(result) {
		return 0, ErrResultOutOfRange
	}
	return result, nil
}
