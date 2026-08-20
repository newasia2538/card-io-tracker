package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"cardledger/api/internal/config"
)

func TestHealthzReturnsOK(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	res := httptest.NewRecorder()

	newHandler(nil).ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusOK)
	}

	var body map[string]string
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body["status"] != "ok" {
		t.Fatalf("status field = %q, want %q", body["status"], "ok")
	}
}

func TestHandlerSetsSecurityHeaders(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	res := httptest.NewRecorder()

	newHandler(nil).ServeHTTP(res, req)

	expected := map[string]string{
		"Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
		"X-Content-Type-Options":    "nosniff",
		"X-Frame-Options":           "DENY",
		"Referrer-Policy":           "strict-origin-when-cross-origin",
		"Permissions-Policy":        "camera=(), microphone=(), geolocation=()",
		"Content-Security-Policy":   "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
	}
	for header, want := range expected {
		if got := res.Header().Get(header); got != want {
			t.Fatalf("%s = %q, want %q", header, got, want)
		}
	}
}

func TestHandlerRateLimitsAPIRequestsByClient(t *testing.T) {
	apiHandler := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	handler := newHandler(apiHandler)

	for attempt := 0; attempt < 60; attempt++ {
		req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
		req.RemoteAddr = "198.51.100.10:1234"
		res := httptest.NewRecorder()

		handler.ServeHTTP(res, req)

		if res.Code != http.StatusNoContent {
			t.Fatalf("request %d status = %d, want %d", attempt+1, res.Code, http.StatusNoContent)
		}
	}

	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req.RemoteAddr = "198.51.100.10:1234"
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)

	if res.Code != http.StatusTooManyRequests {
		t.Fatalf("blocked request status = %d, want %d", res.Code, http.StatusTooManyRequests)
	}
	if res.Header().Get("Retry-After") == "" {
		t.Fatal("Retry-After header missing")
	}
	if !strings.Contains(res.Body.String(), `"code":"rate_limited"`) {
		t.Fatalf("body = %q, want rate_limited code", res.Body.String())
	}
}

func TestNewServerConfiguresTimeouts(t *testing.T) {
	server := newServer(config.Config{Port: "8080"}, newHandler(nil))

	if server.Addr != ":8080" {
		t.Fatalf("server.Addr = %q, want %q", server.Addr, ":8080")
	}
	if server.ReadHeaderTimeout != 5*time.Second {
		t.Fatalf("ReadHeaderTimeout = %s, want %s", server.ReadHeaderTimeout, 5*time.Second)
	}
	if server.ReadTimeout != 15*time.Second {
		t.Fatalf("ReadTimeout = %s, want %s", server.ReadTimeout, 15*time.Second)
	}
	if server.WriteTimeout != 15*time.Second {
		t.Fatalf("WriteTimeout = %s, want %s", server.WriteTimeout, 15*time.Second)
	}
	if server.IdleTimeout != 60*time.Second {
		t.Fatalf("IdleTimeout = %s, want %s", server.IdleTimeout, 60*time.Second)
	}
}
