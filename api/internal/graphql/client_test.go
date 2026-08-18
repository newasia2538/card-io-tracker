package graphql

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"

	"cardledger/api/internal/transactions"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}
func TestClientListSendsHeadersAndDescendingSort(t *testing.T) {
	t.Parallel()

	client := NewClient("https://supabase.example", "sb_publishable_test", &http.Client{
		Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		assertGraphQLHeaders(t, r)
		if r.URL.String() != "https://supabase.example/graphql/v1" {
			t.Fatalf("url = %q, want %q", r.URL.String(), "https://supabase.example/graphql/v1")
		}

		var req graphQLRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if !strings.Contains(req.Query, "transactionsCollection") {
			t.Fatalf("query = %q, want transactionsCollection", req.Query)
		}
		if !strings.Contains(req.Query, "orderBy: [{transaction_date: DescNullsLast}, {created_at: DescNullsLast}]") {
			t.Fatalf("query = %q, want descending transaction_date and created_at sort", req.Query)
		}

		filter, ok := req.Variables["filter"].(map[string]any)
		if !ok {
			t.Fatalf("filter variables = %#v, want object", req.Variables["filter"])
		}
		action, ok := filter["action"].(map[string]any)
		if !ok || action["eq"] != "BUY" {
			t.Fatalf("action filter = %#v, want eq BUY", filter["action"])
		}

		return jsonResponse(http.StatusOK, `{"data":{"transactionsCollection":{"edges":[{"node":{"id":"txn-1","user_id":"user-123","action":"BUY","card_type":"Sport card","custom_card_type":null,"price":"100.00","currency":"THB","price_thb":"100.00","exchange_rate_to_thb":"1","exchange_rate_date":"2026-08-17","transaction_date":"2026-08-17","created_at":"2026-08-17T10:00:00Z","updated_at":"2026-08-17T10:00:00Z"}}]}}}`), nil
		}),
	})

	records, err := client.List(context.Background(), "jwt-token", "BUY")
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}
	if len(records) != 1 {
		t.Fatalf("len(records) = %d, want 1", len(records))
	}
	if records[0].ID != "txn-1" {
		t.Fatalf("records[0].ID = %q, want %q", records[0].ID, "txn-1")
	}
}

func TestClientCreateSendsCanonicalStoredFields(t *testing.T) {
	t.Parallel()

	client := NewClient("https://supabase.example", "sb_publishable_test", &http.Client{
		Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		assertGraphQLHeaders(t, r)

		var req graphQLRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if !strings.Contains(req.Query, "insertIntotransactionsCollection") {
			t.Fatalf("query = %q, want insertIntotransactionsCollection", req.Query)
		}

		input, ok := req.Variables["input"].([]any)
		if !ok || len(input) != 1 {
			t.Fatalf("input variables = %#v, want single-element array", req.Variables["input"])
		}
		record, ok := input[0].(map[string]any)
		if !ok {
			t.Fatalf("input[0] = %#v, want object", input[0])
		}
		if record["user_id"] != "user-123" {
			t.Fatalf("user_id = %#v, want %q", record["user_id"], "user-123")
		}
		if record["price_thb"] != "3550.00" {
			t.Fatalf("price_thb = %#v, want %q", record["price_thb"], "3550.00")
		}
		if record["exchange_rate_to_thb"] != "35.50" {
			t.Fatalf("exchange_rate_to_thb = %#v, want %q", record["exchange_rate_to_thb"], "35.50")
		}
		if record["exchange_rate_date"] != "2026-08-17" {
			t.Fatalf("exchange_rate_date = %#v, want %q", record["exchange_rate_date"], "2026-08-17")
		}

		return jsonResponse(http.StatusOK, `{"data":{"insertIntotransactionsCollection":{"records":[{"id":"txn-1","user_id":"user-123","action":"BUY","card_type":"Sport card","custom_card_type":null,"price":"100.00","currency":"USD","price_thb":"3550.00","exchange_rate_to_thb":"35.50","exchange_rate_date":"2026-08-17","transaction_date":"2026-08-17","created_at":"2026-08-17T10:00:00Z","updated_at":"2026-08-17T10:00:00Z"}]}}}`), nil
		}),
	})

	record, err := client.Create(context.Background(), "jwt-token", transactions.StoredTransaction{
		UserID:            "user-123",
		Action:            "BUY",
		CardType:          "Sport card",
		Price:             "100.00",
		Currency:          "USD",
		PriceTHB:          "3550.00",
		ExchangeRateToTHB: "35.50",
		ExchangeRateDate:  "2026-08-17",
		TransactionDate:   "2026-08-17",
	})
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	if record.ID != "txn-1" {
		t.Fatalf("record.ID = %q, want %q", record.ID, "txn-1")
	}
}

func TestClientUpdateUsesIDFilterAndAtMostOne(t *testing.T) {
	t.Parallel()

	client := NewClient("https://supabase.example", "sb_publishable_test", &http.Client{
		Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		assertGraphQLHeaders(t, r)

		var req graphQLRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if !strings.Contains(req.Query, "updatetransactionsCollection") {
			t.Fatalf("query = %q, want updatetransactionsCollection", req.Query)
		}
		if !strings.Contains(req.Query, "atMost: 1") {
			t.Fatalf("query = %q, want atMost: 1", req.Query)
		}

		filter, ok := req.Variables["filter"].(map[string]any)
		if !ok {
			t.Fatalf("filter variables = %#v, want object", req.Variables["filter"])
		}
		idFilter, ok := filter["id"].(map[string]any)
		if !ok || idFilter["eq"] != "txn-123" {
			t.Fatalf("id filter = %#v, want eq txn-123", filter["id"])
		}

		return jsonResponse(http.StatusOK, `{"data":{"updatetransactionsCollection":{"affectedCount":1,"records":[{"id":"txn-123","user_id":"user-123","action":"SELL","card_type":"Pokemon card","custom_card_type":null,"price":"50.00","currency":"THB","price_thb":"50.00","exchange_rate_to_thb":"1","exchange_rate_date":"2026-08-17","transaction_date":"2026-08-17","created_at":"2026-08-17T10:00:00Z","updated_at":"2026-08-17T11:00:00Z"}]}}}`), nil
		}),
	})

	record, err := client.Update(context.Background(), "jwt-token", "txn-123", transactions.StoredTransaction{
		UserID:            "user-123",
		Action:            "SELL",
		CardType:          "Pokemon card",
		Price:             "50.00",
		Currency:          "THB",
		PriceTHB:          "50.00",
		ExchangeRateToTHB: "1",
		ExchangeRateDate:  "2026-08-17",
		TransactionDate:   "2026-08-17",
	})
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	if record.ID != "txn-123" {
		t.Fatalf("record.ID = %q, want %q", record.ID, "txn-123")
	}
}

func TestClientDeleteUsesIDFilterAndAtMostOne(t *testing.T) {
	t.Parallel()

	client := NewClient("https://supabase.example", "sb_publishable_test", &http.Client{
		Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		assertGraphQLHeaders(t, r)

		var req graphQLRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if !strings.Contains(req.Query, "deleteFromtransactionsCollection") {
			t.Fatalf("query = %q, want deleteFromtransactionsCollection", req.Query)
		}
		if !strings.Contains(req.Query, "atMost: 1") {
			t.Fatalf("query = %q, want atMost: 1", req.Query)
		}
		filter, ok := req.Variables["filter"].(map[string]any)
		if !ok {
			t.Fatalf("filter variables = %#v, want object", req.Variables["filter"])
		}
		idFilter, ok := filter["id"].(map[string]any)
		if !ok || idFilter["eq"] != "txn-123" {
			t.Fatalf("id filter = %#v, want eq txn-123", filter["id"])
		}

		return jsonResponse(http.StatusOK, `{"data":{"deleteFromtransactionsCollection":{"affectedCount":1}}}`), nil
		}),
	})

	if err := client.Delete(context.Background(), "jwt-token", "txn-123"); err != nil {
		t.Fatalf("Delete() error = %v", err)
	}
}

func TestClientReturnsTypedGraphQLError(t *testing.T) {
	t.Parallel()

	client := NewClient("https://supabase.example", "sb_publishable_test", &http.Client{
		Transport: roundTripFunc(func(_ *http.Request) (*http.Response, error) {
			return jsonResponse(http.StatusOK, `{"errors":[{"message":"duplicate key value violates unique constraint","extensions":{"code":"23505"}}]}`), nil
		}),
	})
	_, err := client.Create(context.Background(), "jwt-token", transactions.StoredTransaction{
		UserID:            "user-123",
		Action:            "BUY",
		CardType:          "Sport card",
		Price:             "100.00",
		Currency:          "USD",
		PriceTHB:          "3550.00",
		ExchangeRateToTHB: "35.50",
		ExchangeRateDate:  "2026-08-17",
		TransactionDate:   "2026-08-17",
	})
	if err == nil {
		t.Fatal("Create() error = nil, want error")
	}

	var graphQLErr *Error
	if !errors.As(err, &graphQLErr) {
		t.Fatalf("Create() error = %T, want *Error", err)
	}
	if graphQLErr.Kind != ErrorKindConflict {
		t.Fatalf("graphQLErr.Kind = %q, want %q", graphQLErr.Kind, ErrorKindConflict)
	}
}

func assertGraphQLHeaders(t *testing.T, r *http.Request) {
	t.Helper()

	if got := r.Header.Get("apikey"); got != "sb_publishable_test" {
		t.Fatalf("apikey header = %q, want %q", got, "sb_publishable_test")
	}
	if got := r.Header.Get("Authorization"); got != "Bearer jwt-token" {
		t.Fatalf("authorization header = %q, want %q", got, "Bearer jwt-token")
	}
}

func jsonResponse(status int, body string) *http.Response {
	return &http.Response{
		StatusCode: status,
		Header: http.Header{
			"Content-Type": []string{"application/json"},
		},
		Body: io.NopCloser(strings.NewReader(body)),
	}
}
