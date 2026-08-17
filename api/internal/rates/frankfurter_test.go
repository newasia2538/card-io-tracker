package rates

import (
	"context"
	"io"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestUSDToTHBParsesFrankfurterJSON(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 8, 16, 9, 0, 0, 0, time.UTC)
	provider := NewFrankfurterProvider(&http.Client{
		Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			if r.URL.String() != "https://rates.example/v2/rate/USD/THB" {
				t.Fatalf("url = %q, want %q", r.URL.String(), "https://rates.example/v2/rate/USD/THB")
			}
			return jsonResponse(http.StatusOK, `{"date":"2026-08-15","base":"USD","quote":"THB","rate":35.50}`), nil
		}),
	})
	provider.baseURL = "https://rates.example"
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

func TestNewFrankfurterProviderUsesBaseURLOption(t *testing.T) {
	t.Parallel()

	provider := NewFrankfurterProvider(&http.Client{
		Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			if r.URL.String() != "https://config.example/v2/rate/USD/THB" {
				t.Fatalf("url = %q, want %q", r.URL.String(), "https://config.example/v2/rate/USD/THB")
			}
			return jsonResponse(http.StatusOK, `{"date":"2026-08-15","base":"USD","quote":"THB","rate":35.50}`), nil
		}),
	}, WithBaseURL("https://config.example/"))
	provider.now = func() time.Time {
		return time.Date(2026, 8, 16, 9, 0, 0, 0, time.UTC)
	}

	if _, err := provider.USDToTHB(context.Background()); err != nil {
		t.Fatalf("USDToTHB() error = %v", err)
	}
}

func TestValidatePositiveDecimalRejectsNonDecimalGrammar(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		value string
	}{
		{name: "fraction", value: "1/2"},
		{name: "scientific notation", value: "1e2"},
		{name: "hex float", value: "0x10p0"},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			err := validatePositiveDecimal(tt.value)
			if err == nil {
				t.Fatalf("validatePositiveDecimal(%q) error = nil, want non-nil", tt.value)
			}
			if !strings.Contains(err.Error(), "must be a decimal") {
				t.Fatalf("validatePositiveDecimal(%q) error = %q, want substring %q", tt.value, err.Error(), "must be a decimal")
			}
		})
	}
}

func TestUSDToTHBReusesFreshCache(t *testing.T) {
	t.Parallel()

	var requests atomic.Int32
	now := time.Date(2026, 8, 16, 9, 0, 0, 0, time.UTC)
	provider := NewFrankfurterProvider(&http.Client{
		Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			requests.Add(1)
			return jsonResponse(http.StatusOK, `{"date":"2026-08-15","base":"USD","quote":"THB","rate":35.50}`), nil
		}),
	})
	provider.baseURL = "https://rates.example"
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

func TestUSDToTHBSerializesExpiredCacheRefresh(t *testing.T) {
	t.Parallel()

	const callers = 6

	var requests atomic.Int32
	now := time.Date(2026, 8, 16, 9, 0, 0, 0, time.UTC)
	freshDate := time.Date(2026, 8, 16, 0, 0, 0, 0, time.UTC)
	provider := NewFrankfurterProvider(&http.Client{
		Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			requestNumber := requests.Add(1)
			time.Sleep(25 * time.Millisecond)
			if requestNumber == 1 {
				return jsonResponse(http.StatusOK, `{"date":"2026-08-16","base":"USD","quote":"THB","rate":36.25}`), nil
			}
			return jsonResponse(http.StatusBadGateway, `upstream down`), nil
		}),
	})
	provider.baseURL = "https://rates.example"
	provider.now = func() time.Time { return now }
	provider.cached = Rate{
		Base:         "USD",
		Quote:        "THB",
		Value:        "35.50",
		ProviderDate: time.Date(2026, 8, 15, 0, 0, 0, 0, time.UTC),
		FetchedAt:    now.Add(-25 * time.Hour),
	}
	provider.hasRate = true

	type result struct {
		rate Rate
		err  error
	}

	start := make(chan struct{})
	results := make(chan result, callers)
	var wg sync.WaitGroup
	for i := 0; i < callers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			rate, err := provider.USDToTHB(context.Background())
			results <- result{rate: rate, err: err}
		}()
	}

	close(start)
	wg.Wait()
	close(results)

	if requests.Load() != 1 {
		t.Fatalf("requests = %d, want %d", requests.Load(), 1)
	}

	for got := range results {
		if got.err != nil {
			t.Fatalf("USDToTHB() error = %v, want nil", got.err)
		}
		if got.rate.Stale {
			t.Fatalf("Stale = %t, want false", got.rate.Stale)
		}
		if got.rate.Value != "36.25" {
			t.Fatalf("Value = %q, want %q", got.rate.Value, "36.25")
		}
		if got.rate.ProviderDate != freshDate {
			t.Fatalf("ProviderDate = %s, want %s", got.rate.ProviderDate, freshDate)
		}
		if got.rate.FetchedAt != now {
			t.Fatalf("FetchedAt = %s, want %s", got.rate.FetchedAt, now)
		}
	}
}

func TestUSDToTHBReturnsStaleCacheWhenRefreshFails(t *testing.T) {
	t.Parallel()

	var requests atomic.Int32
	status := http.StatusOK
	now := time.Date(2026, 8, 16, 9, 0, 0, 0, time.UTC)
	provider := NewFrankfurterProvider(&http.Client{
		Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			requests.Add(1)
			if status != http.StatusOK {
				return jsonResponse(status, `upstream down`), nil
			}
			return jsonResponse(http.StatusOK, `{"date":"2026-08-15","base":"USD","quote":"THB","rate":35.50}`), nil
		}),
	})
	provider.baseURL = "https://rates.example"
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
	t.Parallel()

	provider := NewFrankfurterProvider(&http.Client{
		Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			return jsonResponse(http.StatusBadGateway, `upstream down`), nil
		}),
	})
	provider.baseURL = "https://rates.example"
	provider.now = func() time.Time {
		return time.Date(2026, 8, 16, 9, 0, 0, 0, time.UTC)
	}

	_, err := provider.USDToTHB(context.Background())
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

func jsonResponse(status int, body string) *http.Response {
	resp := &http.Response{
		StatusCode: status,
		Header:     make(http.Header),
		Body:       io.NopCloser(strings.NewReader(body)),
	}
	resp.Header.Set("Content-Type", "application/json")
	return resp
}
