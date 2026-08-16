package transactions

import (
	"context"
	"strings"
	"testing"
	"time"

	"cardledger/api/internal/rates"
)

type stubRateProvider struct {
	rate rates.Rate
	err  error
}

func (s stubRateProvider) USDToTHB(context.Context) (rates.Rate, error) {
	return s.rate, s.err
}

func TestValidateAndCanonicalizeRejectsInvalidInputs(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		input TransactionInput
		want  string
	}{
		{
			name: "unsupported action",
			input: TransactionInput{
				Action:          "HOLD",
				CardType:        "Sport card",
				Price:           "100.00",
				Currency:        "THB",
				TransactionDate: "2026-08-16",
			},
			want: "action must be BUY or SELL",
		},
		{
			name: "unsupported currency",
			input: TransactionInput{
				Action:          "BUY",
				CardType:        "Sport card",
				Price:           "100.00",
				Currency:        "EUR",
				TransactionDate: "2026-08-16",
			},
			want: "currency must be THB or USD",
		},
		{
			name: "zero price",
			input: TransactionInput{
				Action:          "BUY",
				CardType:        "Sport card",
				Price:           "0",
				Currency:        "THB",
				TransactionDate: "2026-08-16",
			},
			want: "price must be positive",
		},
		{
			name: "negative price",
			input: TransactionInput{
				Action:          "BUY",
				CardType:        "Sport card",
				Price:           "-1.25",
				Currency:        "THB",
				TransactionDate: "2026-08-16",
			},
			want: "price must be positive",
		},
		{
			name: "invalid date",
			input: TransactionInput{
				Action:          "BUY",
				CardType:        "Sport card",
				Price:           "100.00",
				Currency:        "THB",
				TransactionDate: "2026-13-01",
			},
			want: "transaction_date must be YYYY-MM-DD",
		},
		{
			name: "others requires custom type",
			input: TransactionInput{
				Action:          "BUY",
				CardType:        "Others",
				Price:           "100.00",
				Currency:        "THB",
				TransactionDate: "2026-08-16",
			},
			want: "custom_card_type is required for Others",
		},
		{
			name: "standard card type rejects custom type",
			input: TransactionInput{
				Action:          "BUY",
				CardType:        "Sport card",
				CustomCardType:  stringPtr("Signed"),
				Price:           "100.00",
				Currency:        "THB",
				TransactionDate: "2026-08-16",
			},
			want: "custom_card_type is only allowed when card_type is Others",
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			_, err := ValidateAndCanonicalize(context.Background(), tt.input, nil)
			if err == nil {
				t.Fatal("expected error, got nil")
			}
			if !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("error = %q, want substring %q", err.Error(), tt.want)
			}
		})
	}
}

func TestValidateAndCanonicalizeTHBUsesCanonicalRateOne(t *testing.T) {
	t.Parallel()

	got, err := ValidateAndCanonicalize(context.Background(), TransactionInput{
		Action:          "BUY",
		CardType:        "Sport card",
		Price:           "100.125",
		Currency:        "THB",
		TransactionDate: "2026-08-16",
	}, nil)
	if err != nil {
		t.Fatalf("ValidateAndCanonicalize() error = %v", err)
	}

	if got.PriceTHB != "100.13" {
		t.Fatalf("PriceTHB = %q, want %q", got.PriceTHB, "100.13")
	}
	if got.ExchangeRateToTHB != "1" {
		t.Fatalf("ExchangeRateToTHB = %q, want %q", got.ExchangeRateToTHB, "1")
	}
	if got.ExchangeRateDate != "2026-08-16" {
		t.Fatalf("ExchangeRateDate = %q, want %q", got.ExchangeRateDate, "2026-08-16")
	}
}

func TestValidateAndCanonicalizeUSDConvertsExactly(t *testing.T) {
	t.Parallel()

	got, err := ValidateAndCanonicalize(context.Background(), TransactionInput{
		Action:          "SELL",
		CardType:        "Others",
		CustomCardType:  stringPtr("Vintage Promo"),
		Price:           "100.00",
		Currency:        "USD",
		TransactionDate: "2026-08-16",
	}, stubRateProvider{
		rate: rates.Rate{
			Base:         "USD",
			Quote:        "THB",
			Value:        "35.50",
			ProviderDate: time.Date(2026, 8, 15, 0, 0, 0, 0, time.UTC),
		},
	})
	if err != nil {
		t.Fatalf("ValidateAndCanonicalize() error = %v", err)
	}

	if got.PriceTHB != "3550.00" {
		t.Fatalf("PriceTHB = %q, want %q", got.PriceTHB, "3550.00")
	}
	if got.ExchangeRateToTHB != "35.50" {
		t.Fatalf("ExchangeRateToTHB = %q, want %q", got.ExchangeRateToTHB, "35.50")
	}
	if got.ExchangeRateDate != "2026-08-15" {
		t.Fatalf("ExchangeRateDate = %q, want %q", got.ExchangeRateDate, "2026-08-15")
	}
	if got.CustomCardType == nil || *got.CustomCardType != "Vintage Promo" {
		t.Fatalf("CustomCardType = %v, want %q", got.CustomCardType, "Vintage Promo")
	}
}

func stringPtr(value string) *string {
	return &value
}
