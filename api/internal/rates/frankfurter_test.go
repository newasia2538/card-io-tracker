package rates

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func TestUSDToTHBParsesFrankfurterJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v2/rate/USD/THB" {
			t.Fatalf("path = %q, want %q", r.URL.Path, "/v2/rate/USD/THB")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"date":"2026-08-15","base":"USD","quote":"THB","rate":35.50}`))
	}))
	defer server.Close()

	t.Setenv("FRANKFURTER_BASE_URL", server.URL)

	now := time.Date(2026, 8, 16, 9, 0, 0, 0, time.UTC)
	provider := NewFrankfurterProvider(server.Client())
	provider.now = func() time.Time { return now }

	got, err := provider.USDToTHB(context.Background())
	if err != nil {
		t.Fatalf("USDToTHB() error = %v", err)
	}

	if got.Base != "USD" {
		t.Fatalf("Base = %q, want %q", got.Base, "USD")
	}
	if got.Quote != "THB" {
		t.Fatalf("Quote = %q, want %q", got.Quote, "THB")
	}
	if got.Value != "35.50" {
		t.Fatalf("Value = %q, want %q", got.Value, "35.50")
	}
	if got.ProviderDate.Format("2006-01-02") != "2026-08-15" {
		t.Fatalf("ProviderDate = %s, want %s", got.ProviderDate.Format("2006-01-02"), "2026-08-15")
	}
	if got.FetchedAt != now {
		t.Fatalf("FetchedAt = %s, want %s", got.FetchedAt, now)
	}
	if got.Stale {
		t.Fatal("Stale = true, want false")
	}
}

func TestUSDToTHBReusesFreshCache(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"date":"2026-08-15","base":"USD","quote":"THB","rate":35.50}`))
	}))
	defer server.Close()

	t.Setenv("FRANKFURTER_BASE_URL", server.URL)

	now := time.Date(2026, 8, 16, 9, 0, 0, 0, time.UTC)
	provider := NewFrankfurterProvider(server.Client())
	provider.now = func() time.Time { return now }

	first, err := provider.USDToTHB(context.Background())
	if err != nil {
		t.Fatalf("first USDToTHB() error = %v", err)
	}

	now = now.Add(23 * time.Hour)
	second, err := provider.USDToTHB(context.Background())
	if err != nil {
		t.Fatalf("second USDToTHB() error = %v", err)
	}

	if requests.Load() != 1 {
		t.Fatalf("requests = %d, want %d", requests.Load(), 1)
	}
	if second != first {
		t.Fatalf("second rate = %#v, want %#v", second, first)
	}
}

func TestUSDToTHBReturnsStaleCacheWhenRefreshFails(t *testing.T) {
	var requests atomic.Int32
	status := http.StatusOK
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		if status != http.StatusOK {
			http.Error(w, "upstream down", status)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"date":"2026-08-15","base":"USD","quote":"THB","rate":35.50}`))
	}))
	defer server.Close()

	t.Setenv("FRANKFURTER_BASE_URL", server.URL)

	now := time.Date(2026, 8, 16, 9, 0, 0, 0, time.UTC)
	provider := NewFrankfurterProvider(server.Client())
	provider.now = func() time.Time { return now }

	fresh, err := provider.USDToTHB(context.Background())
	if err != nil {
		t.Fatalf("fresh USDToTHB() error = %v", err)
	}

	status = http.StatusBadGateway
	now = now.Add(25 * time.Hour)

	stale, err := provider.USDToTHB(context.Background())
	if err != nil {
		t.Fatalf("stale USDToTHB() error = %v", err)
	}

	if requests.Load() != 2 {
		t.Fatalf("requests = %d, want %d", requests.Load(), 2)
	}
	if !stale.Stale {
		t.Fatal("Stale = false, want true")
	}
	if stale.Value != fresh.Value {
		t.Fatalf("Value = %q, want %q", stale.Value, fresh.Value)
	}
	if stale.ProviderDate != fresh.ProviderDate {
		t.Fatalf("ProviderDate = %s, want %s", stale.ProviderDate, fresh.ProviderDate)
	}
}

func TestUSDToTHBReturnsErrorWithoutCacheWhenRefreshFails(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "upstream down", http.StatusBadGateway)
	}))
	defer server.Close()

	t.Setenv("FRANKFURTER_BASE_URL", server.URL)

	provider := NewFrankfurterProvider(server.Client())
	provider.now = func() time.Time {
		return time.Date(2026, 8, 16, 9, 0, 0, 0, time.UTC)
	}

	_, err := provider.USDToTHB(context.Background())
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}
