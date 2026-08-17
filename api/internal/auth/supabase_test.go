package auth

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAuthenticateCallsSupabaseUserEndpoint(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Fatalf("method = %s, want %s", r.Method, http.MethodGet)
		}
		if r.URL.Path != "/auth/v1/user" {
			t.Fatalf("path = %s, want %s", r.URL.Path, "/auth/v1/user")
		}
		if got := r.Header.Get("apikey"); got != "sb_publishable_test" {
			t.Fatalf("apikey header = %q, want %q", got, "sb_publishable_test")
		}
		if got := r.Header.Get("Authorization"); got != "Bearer token-123" {
			t.Fatalf("authorization header = %q, want %q", got, "Bearer token-123")
		}

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"user-123","is_anonymous":true}`))
	}))
	defer server.Close()

	client := NewSupabaseAuthenticator(server.URL, "sb_publishable_test", server.Client())
	user, err := client.Authenticate(context.Background(), "token-123")
	if err != nil {
		t.Fatalf("Authenticate() error = %v", err)
	}

	if user.ID != "user-123" {
		t.Fatalf("user.ID = %q, want %q", user.ID, "user-123")
	}
	if !user.IsAnonymous {
		t.Fatal("user.IsAnonymous = false, want true")
	}
}

func TestAuthenticateMapsInvalidTokenToUnauthorized(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "invalid token", http.StatusUnauthorized)
	}))
	defer server.Close()

	client := NewSupabaseAuthenticator(server.URL, "sb_publishable_test", server.Client())
	_, err := client.Authenticate(context.Background(), "token-123")
	if !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("Authenticate() error = %v, want ErrUnauthorized", err)
	}
}
