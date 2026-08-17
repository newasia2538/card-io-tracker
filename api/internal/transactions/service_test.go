package transactions

import (
	"context"
	"errors"
	"testing"
	"time"

	"cardledger/api/internal/rates"
)

type captureStore struct {
	listToken       string
	listAction      string
	listRecords     []Transaction
	listErr         error
	createToken     string
	createInput     StoredTransaction
	createRecord    Transaction
	createErr       error
	updateToken     string
	updateID        string
	updateInput     StoredTransaction
	updateRecord    Transaction
	updateErr       error
	deleteToken     string
	deleteID        string
	deleteErr       error
}

func (s *captureStore) List(_ context.Context, token string, action string) ([]Transaction, error) {
	s.listToken = token
	s.listAction = action
	return s.listRecords, s.listErr
}

func (s *captureStore) Create(_ context.Context, token string, input StoredTransaction) (Transaction, error) {
	s.createToken = token
	s.createInput = input
	return s.createRecord, s.createErr
}

func (s *captureStore) Update(_ context.Context, token string, id string, input StoredTransaction) (Transaction, error) {
	s.updateToken = token
	s.updateID = id
	s.updateInput = input
	return s.updateRecord, s.updateErr
}

func (s *captureStore) Delete(_ context.Context, token string, id string) error {
	s.deleteToken = token
	s.deleteID = id
	return s.deleteErr
}

type stubRates struct {
	rate rates.Rate
	err  error
}

func (s stubRates) USDToTHB(context.Context) (rates.Rate, error) {
	return s.rate, s.err
}

type stubStoreError struct {
	kind    string
	message string
}

func (e *stubStoreError) Error() string {
	return e.message
}

func (e *stubStoreError) StoreErrorKind() string {
	return e.kind
}

func TestServiceCreateCanonicalizesOnServer(t *testing.T) {
	t.Parallel()

	store := &captureStore{
		createRecord: Transaction{ID: "txn-1", PriceTHB: "3550.00"},
	}
	service := NewService(store, stubRates{
		rate: rates.Rate{
			Base:         "USD",
			Quote:        "THB",
			Value:        "35.50",
			ProviderDate: time.Date(2026, 8, 17, 0, 0, 0, 0, time.UTC),
		},
	})

	record, err := service.Create(context.Background(), "jwt-token", "user-123", TransactionInput{
		Action:          "BUY",
		CardType:        "Sport card",
		Price:           "100.00",
		Currency:        "USD",
		TransactionDate: "2026-08-17",
	})
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	if record.ID != "txn-1" {
		t.Fatalf("record.ID = %q, want %q", record.ID, "txn-1")
	}
	if store.createToken != "jwt-token" {
		t.Fatalf("store.createToken = %q, want %q", store.createToken, "jwt-token")
	}
	if store.createInput.UserID != "user-123" {
		t.Fatalf("UserID = %q, want %q", store.createInput.UserID, "user-123")
	}
	if store.createInput.PriceTHB != "3550.00" {
		t.Fatalf("PriceTHB = %q, want %q", store.createInput.PriceTHB, "3550.00")
	}
	if store.createInput.ExchangeRateToTHB != "35.50" {
		t.Fatalf("ExchangeRateToTHB = %q, want %q", store.createInput.ExchangeRateToTHB, "35.50")
	}
	if store.createInput.ExchangeRateDate != "2026-08-17" {
		t.Fatalf("ExchangeRateDate = %q, want %q", store.createInput.ExchangeRateDate, "2026-08-17")
	}
}

func TestServiceCreateReturnsRateUnavailableForUSDWithoutRate(t *testing.T) {
	t.Parallel()

	service := NewService(&captureStore{}, stubRates{err: errors.New("upstream down")})

	_, err := service.Create(context.Background(), "jwt-token", "user-123", TransactionInput{
		Action:          "BUY",
		CardType:        "Sport card",
		Price:           "100.00",
		Currency:        "USD",
		TransactionDate: "2026-08-17",
	})
	if err == nil {
		t.Fatal("Create() error = nil, want error")
	}

	var serviceErr *Error
	if !errors.As(err, &serviceErr) {
		t.Fatalf("Create() error = %T, want *Error", err)
	}
	if serviceErr.Kind != ErrorKindRateUnavailable {
		t.Fatalf("serviceErr.Kind = %q, want %q", serviceErr.Kind, ErrorKindRateUnavailable)
	}
}

func TestServiceUpdateMapsGraphQLNotFound(t *testing.T) {
	t.Parallel()

	store := &captureStore{
		updateErr: &stubStoreError{kind: "not_found", message: "transaction not found"},
	}
	service := NewService(store, stubRates{})

	_, err := service.Update(context.Background(), "jwt-token", "user-123", "txn-404", TransactionInput{
		Action:          "SELL",
		CardType:        "Sport card",
		Price:           "50.00",
		Currency:        "THB",
		TransactionDate: "2026-08-17",
	})
	if err == nil {
		t.Fatal("Update() error = nil, want error")
	}

	var serviceErr *Error
	if !errors.As(err, &serviceErr) {
		t.Fatalf("Update() error = %T, want *Error", err)
	}
	if serviceErr.Kind != ErrorKindNotFound {
		t.Fatalf("serviceErr.Kind = %q, want %q", serviceErr.Kind, ErrorKindNotFound)
	}
}

func TestServiceExchangeRateReturnsSupportedPair(t *testing.T) {
	t.Parallel()

	service := NewService(&captureStore{}, stubRates{
		rate: rates.Rate{
			Base:         "USD",
			Quote:        "THB",
			Value:        "35.50",
			ProviderDate: time.Date(2026, 8, 17, 0, 0, 0, 0, time.UTC),
			Stale:        true,
		},
	})

	rate, err := service.ExchangeRate(context.Background(), "USD", "THB")
	if err != nil {
		t.Fatalf("ExchangeRate() error = %v", err)
	}
	if rate.Rate != "35.50" {
		t.Fatalf("rate.Rate = %q, want %q", rate.Rate, "35.50")
	}
	if !rate.Stale {
		t.Fatal("rate.Stale = false, want true")
	}
	if rate.ProviderDate != "2026-08-17" {
		t.Fatalf("rate.ProviderDate = %q, want %q", rate.ProviderDate, "2026-08-17")
	}
}
