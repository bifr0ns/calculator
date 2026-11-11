package calculator

import (
	"errors"
	"math"
	"testing"
)

func TestCalculate(t *testing.T) {
	tests := []struct {
		name string
		op   Operation
		a, b float64
		want float64
	}{
		{"add integers", Add, 2, 3, 5},
		{"add negatives", Add, -2, -3, -5},
		{"add decimals", Add, 1.5, 2.25, 3.75},
		{"subtract", Subtract, 10, 4, 6},
		{"subtract to negative", Subtract, 4, 10, -6},
		{"multiply", Multiply, 3, 4, 12},
		{"multiply by negative", Multiply, -3, 4, -12},
		{"multiply by zero", Multiply, 123, 0, 0},
		{"divide", Divide, 10, 4, 2.5},
		{"divide negative", Divide, -9, 3, -3},
		{"divide zero", Divide, 0, 5, 0},
		{"largest finite value is allowed", Add, math.MaxFloat64, 0, math.MaxFloat64},
		{"smallest positive value is allowed", Divide, math.SmallestNonzeroFloat64, 1, math.SmallestNonzeroFloat64},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Calculate(tt.op, tt.a, tt.b)
			if err != nil {
				t.Fatalf("Calculate(%q, %v, %v) returned error: %v", tt.op, tt.a, tt.b, err)
			}
			if got != tt.want {
				t.Errorf("Calculate(%q, %v, %v) = %v, want %v", tt.op, tt.a, tt.b, got, tt.want)
			}
		})
	}
}

func TestCalculateErrors(t *testing.T) {
	negativeZero := math.Copysign(0, -1)

	tests := []struct {
		name    string
		op      Operation
		a, b    float64
		wantErr error
	}{
		{"divide by zero", Divide, 1, 0, ErrDivisionByZero},
		{"divide by negative zero", Divide, 1, negativeZero, ErrDivisionByZero},
		{"zero divided by zero", Divide, 0, 0, ErrDivisionByZero},

		{"add overflow", Add, math.MaxFloat64, math.MaxFloat64, ErrResultOutOfRange},
		{"subtract overflow", Subtract, -math.MaxFloat64, math.MaxFloat64, ErrResultOutOfRange},
		{"multiply overflow", Multiply, math.MaxFloat64, 2, ErrResultOutOfRange},
		{"divide overflow", Divide, math.MaxFloat64, 0.5, ErrResultOutOfRange},
		{"infinite operand", Add, math.Inf(1), 1, ErrResultOutOfRange},
		{"NaN operand", Multiply, math.NaN(), 1, ErrResultOutOfRange},

		{"unknown operation", Operation("power"), 2, 3, ErrUnsupportedOperation},
		{"empty operation", Operation(""), 2, 3, ErrUnsupportedOperation},
		{"operation is case-sensitive", Operation("ADD"), 2, 3, ErrUnsupportedOperation},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Calculate(tt.op, tt.a, tt.b)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("Calculate(%q, %v, %v) error = %v, want %v", tt.op, tt.a, tt.b, err, tt.wantErr)
			}
			if got != 0 {
				t.Errorf("Calculate(%q, %v, %v) = %v on error, want 0", tt.op, tt.a, tt.b, got)
			}
		})
	}
}
