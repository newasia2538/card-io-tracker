package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
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
