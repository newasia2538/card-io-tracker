package transactions

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"cardledger/api/internal/auth"
	"cardledger/api/internal/rates"
)

type stubAuthenticator struct {
	user  auth.User
	err   error
	token string
}

func (s *stubAuthenticator) Authenticate(_ context.Context, token string) (auth.User, error) {
	s.token = token
	return s.user, s.err
}

type stubService struct {
	listAction string
	listToken  string
	listResult []Transaction
	listErr    error

	createToken  string
	createUserID string
	createInput  TransactionInput
	createResult Transaction
	createErr    error

	updateToken  string
	updateUserID string
	updateID     string
	updateInput  TransactionInput
	updateResult Transaction
	updateErr    error

	deleteToken string
	deleteID    string
	deleteErr   error

	rateFrom   string
	rateTo     string
	rateResult ExchangeRate
	rateErr    error
}

func (s *stubService) List(_ context.Context, token string, action string) ([]Transaction, error) {
	s.listToken = token
	s.listAction = action
	return s.listResult, s.listErr
}

func (s *stubService) Create(_ context.Context, token string, userID string, input TransactionInput) (Transaction, error) {
	s.createToken = token
	s.createUserID = userID
	s.createInput = input
	return s.createResult, s.createErr
}

func (s *stubService) Update(_ context.Context, token string, userID string, id string, input TransactionInput) (Transaction, error) {
	s.updateToken = token
	s.updateUserID = userID
	s.updateID = id
	s.updateInput = input
	return s.updateResult, s.updateErr
}

func (s *stubService) Delete(_ context.Context, token string, id string) error {
	s.deleteToken = token
	s.deleteID = id
	return s.deleteErr
}

func (s *stubService) ExchangeRate(_ context.Context, from string, to string) (ExchangeRate, error) {
	s.rateFrom = from
	s.rateTo = to
	return s.rateResult, s.rateErr
}

func TestHandlerRejectsMissingBearerToken(t *testing.T) {
	t.Parallel()

	handler := NewHandler(&stubAuthenticator{}, &stubService{})
	req := httptest.NewRequest(http.MethodGet, "/api/transactions", nil)
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusUnauthorized)
	}

	var body map[string]string
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body["code"] != "unauthorized" {
		t.Fatalf("body[code] = %q, want %q", body["code"], "unauthorized")
	}
}

func TestHandlerRejectsOversizedJSONBody(t *testing.T) {
	t.Parallel()

	authenticator := &stubAuthenticator{user: auth.User{ID: "user-123"}}
	service := &stubService{}
	handler := NewHandler(authenticator, service)
	body := `{"action":"BUY","card_type":"Others","custom_card_type":"` + strings.Repeat("x", 70*1024) + `","price":"100.00","currency":"THB","transaction_date":"2026-08-17"}`

	req := httptest.NewRequest(http.MethodPost, "/api/transactions", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer jwt-token")
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusRequestEntityTooLarge)
	}
	if service.createToken != "" {
		t.Fatalf("service.createToken = %q, want empty string", service.createToken)
	}

	var response map[string]string
	if err := json.NewDecoder(res.Body).Decode(&response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response["code"] != "payload_too_large" {
		t.Fatalf("body[code] = %q, want %q", response["code"], "payload_too_large")
	}
}

func TestHandlerListsTransactionsForAuthenticatedUser(t *testing.T) {
	t.Parallel()

	authenticator := &stubAuthenticator{user: auth.User{ID: "user-123", IsAnonymous: true}}
	service := &stubService{
		listResult: []Transaction{{ID: "txn-1", Action: "BUY"}},
	}
	handler := NewHandler(authenticator, service)

	req := httptest.NewRequest(http.MethodGet, "/api/transactions?action=BUY", nil)
	req.Header.Set("Authorization", "Bearer jwt-token")
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusOK)
	}
	if authenticator.token != "jwt-token" {
		t.Fatalf("authenticator.token = %q, want %q", authenticator.token, "jwt-token")
	}
	if service.listToken != "jwt-token" {
		t.Fatalf("service.listToken = %q, want %q", service.listToken, "jwt-token")
	}
	if service.listAction != "BUY" {
		t.Fatalf("service.listAction = %q, want %q", service.listAction, "BUY")
	}

	var body struct {
		Transactions []Transaction `json:"transactions"`
	}
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(body.Transactions) != 1 || body.Transactions[0].ID != "txn-1" {
		t.Fatalf("transactions = %#v, want txn-1", body.Transactions)
	}
}

func TestHandlerCreateReturns503WhenUSDNeedsUnavailableRate(t *testing.T) {
	t.Parallel()

	authenticator := &stubAuthenticator{user: auth.User{ID: "user-123"}}
	service := &stubService{
		createErr: &Error{Kind: ErrorKindRateUnavailable, Message: "usd/thb rate unavailable"},
	}
	handler := NewHandler(authenticator, service)

	req := httptest.NewRequest(http.MethodPost, "/api/transactions", bytes.NewBufferString(`{"action":"BUY","card_type":"Sport card","price":"100.00","currency":"USD","transaction_date":"2026-08-17"}`))
	req.Header.Set("Authorization", "Bearer jwt-token")
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusServiceUnavailable)
	}

	var body map[string]string
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body["code"] != "rate_unavailable" {
		t.Fatalf("body[code] = %q, want %q", body["code"], "rate_unavailable")
	}
}

func TestHandlerCreateReturns502WhenUSDRatePayloadIsInvalid(t *testing.T) {
	t.Parallel()

	authenticator := &stubAuthenticator{user: auth.User{ID: "user-123"}}
	service := &stubService{
		createErr: &Error{Kind: ErrorKindUpstream, Message: "usd/thb rate response invalid"},
	}
	handler := NewHandler(authenticator, service)

	req := httptest.NewRequest(http.MethodPost, "/api/transactions", bytes.NewBufferString(`{"action":"BUY","card_type":"Sport card","price":"100.00","currency":"USD","transaction_date":"2026-08-17"}`))
	req.Header.Set("Authorization", "Bearer jwt-token")
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusBadGateway)
	}

	var body map[string]string
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body["code"] != "upstream_unavailable" {
		t.Fatalf("body[code] = %q, want %q", body["code"], "upstream_unavailable")
	}
}

func TestHandlerCreateReturns502WhenFrankfurterPayloadIsMalformed(t *testing.T) {
	t.Parallel()

	authenticator := &stubAuthenticator{user: auth.User{ID: "user-123"}}
	provider := rates.NewFrankfurterProvider(&http.Client{
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"application/json"}},
				Body:       io.NopCloser(strings.NewReader(`{"date":"2026-08-17"`)),
			}, nil
		}),
	}, rates.WithBaseURL("https://rates.example"))
	service := NewService(&captureStore{}, provider)
	handler := NewHandler(authenticator, service)

	req := httptest.NewRequest(http.MethodPost, "/api/transactions", bytes.NewBufferString(`{"action":"BUY","card_type":"Sport card","price":"100.00","currency":"USD","transaction_date":"2026-08-17"}`))
	req.Header.Set("Authorization", "Bearer jwt-token")
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusBadGateway)
	}

	var body map[string]string
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body["code"] != "upstream_unavailable" {
		t.Fatalf("body[code] = %q, want %q", body["code"], "upstream_unavailable")
	}
}

func TestHandlerUpdateRecalculatesUsingAuthenticatedUser(t *testing.T) {
	t.Parallel()

	authenticator := &stubAuthenticator{user: auth.User{ID: "user-123"}}
	service := &stubService{
		updateResult: Transaction{ID: "txn-9", PriceTHB: "3550.00"},
	}
	handler := NewHandler(authenticator, service)

	req := httptest.NewRequest(http.MethodPatch, "/api/transactions/txn-9", bytes.NewBufferString(`{"action":"BUY","card_type":"Sport card","price":"100.00","currency":"USD","transaction_date":"2026-08-17"}`))
	req.Header.Set("Authorization", "Bearer jwt-token")
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusOK)
	}
	if service.updateUserID != "user-123" {
		t.Fatalf("service.updateUserID = %q, want %q", service.updateUserID, "user-123")
	}
	if service.updateID != "txn-9" {
		t.Fatalf("service.updateID = %q, want %q", service.updateID, "txn-9")
	}
	if service.updateInput.Currency != "USD" {
		t.Fatalf("service.updateInput.Currency = %q, want %q", service.updateInput.Currency, "USD")
	}
}

func TestHandlerDeleteByIDReturnsNoContent(t *testing.T) {
	t.Parallel()

	authenticator := &stubAuthenticator{user: auth.User{ID: "user-123"}}
	service := &stubService{}
	handler := NewHandler(authenticator, service)

	req := httptest.NewRequest(http.MethodDelete, "/api/transactions/txn-5", nil)
	req.Header.Set("Authorization", "Bearer jwt-token")
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusNoContent)
	}
	if service.deleteID != "txn-5" {
		t.Fatalf("service.deleteID = %q, want %q", service.deleteID, "txn-5")
	}
}

func TestHandlerExchangeRateReturnsProviderDateAndStaleFlag(t *testing.T) {
	t.Parallel()

	authenticator := &stubAuthenticator{user: auth.User{ID: "user-123"}}
	service := &stubService{
		rateResult: ExchangeRate{
			Base:         "USD",
			Quote:        "THB",
			Rate:         "35.50",
			ProviderDate: "2026-08-17",
			Stale:        true,
		},
	}
	handler := NewHandler(authenticator, service)

	req := httptest.NewRequest(http.MethodGet, "/api/exchange-rate?from=USD&to=THB", nil)
	req.Header.Set("Authorization", "Bearer jwt-token")
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusOK)
	}
	if service.rateFrom != "USD" || service.rateTo != "THB" {
		t.Fatalf("pair = %s/%s, want USD/THB", service.rateFrom, service.rateTo)
	}

	var body ExchangeRate
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !body.Stale {
		t.Fatal("body.Stale = false, want true")
	}
	if body.ProviderDate != "2026-08-17" {
		t.Fatalf("body.ProviderDate = %q, want %q", body.ProviderDate, "2026-08-17")
	}
}

func TestHandlerMapsStableErrorStatuses(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		err        error
		wantStatus int
		wantCode   string
	}{
		{
			name:       "validation",
			err:        &Error{Kind: ErrorKindValidation, Message: "transaction_date must be YYYY-MM-DD"},
			wantStatus: http.StatusBadRequest,
			wantCode:   "validation_failed",
		},
		{
			name:       "not found",
			err:        &Error{Kind: ErrorKindNotFound, Message: "transaction not found"},
			wantStatus: http.StatusNotFound,
			wantCode:   "not_found",
		},
		{
			name:       "conflict",
			err:        &Error{Kind: ErrorKindConflict, Message: "duplicate transaction"},
			wantStatus: http.StatusConflict,
			wantCode:   "conflict",
		},
		{
			name:       "upstream",
			err:        &Error{Kind: ErrorKindUpstream, Message: "provider unavailable"},
			wantStatus: http.StatusBadGateway,
			wantCode:   "upstream_unavailable",
		},
		{
			name:       "unexpected",
			err:        errors.New("boom"),
			wantStatus: http.StatusInternalServerError,
			wantCode:   "internal_error",
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			authenticator := &stubAuthenticator{user: auth.User{ID: "user-123"}}
			service := &stubService{createErr: tt.err}
			handler := NewHandler(authenticator, service)

			req := httptest.NewRequest(http.MethodPost, "/api/transactions", bytes.NewBufferString(`{"action":"BUY","card_type":"Sport card","price":"100.00","currency":"THB","transaction_date":"2026-08-17"}`))
			req.Header.Set("Authorization", "Bearer jwt-token")
			req.Header.Set("Content-Type", "application/json")
			res := httptest.NewRecorder()

			handler.ServeHTTP(res, req)

			if res.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d", res.Code, tt.wantStatus)
			}

			var body map[string]string
			if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
				t.Fatalf("decode response: %v", err)
			}
			if body["code"] != tt.wantCode {
				t.Fatalf("body[code] = %q, want %q", body["code"], tt.wantCode)
			}
		})
	}
}

func TestHandlerRejectsTrailingSecondTopLevelJSONObject(t *testing.T) {
	t.Parallel()

	authenticator := &stubAuthenticator{user: auth.User{ID: "user-123"}}
	service := &stubService{}
	handler := NewHandler(authenticator, service)

	req := httptest.NewRequest(http.MethodPost, "/api/transactions", bytes.NewBufferString(`{"action":"BUY","card_type":"Sport card","price":"100.00","currency":"THB","transaction_date":"2026-08-17"}{"extra":true}`))
	req.Header.Set("Authorization", "Bearer jwt-token")
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusBadRequest)
	}
	if service.createToken != "" {
		t.Fatalf("service.createToken = %q, want empty string", service.createToken)
	}

	var body map[string]string
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body["code"] != "validation_failed" {
		t.Fatalf("body[code] = %q, want %q", body["code"], "validation_failed")
	}
}
