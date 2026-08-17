package auth

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestAuthenticateCallsSupabaseUserEndpoint(t *testing.T) {
	t.Parallel()

	client := &http.Client{
		Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
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

			return jsonResponse(http.StatusOK, `{"id":"user-123","is_anonymous":true}`), nil
		}),
	}

	clientAuth := NewSupabaseAuthenticator("https://supabase.example", "sb_publishable_test", client)
	user, err := clientAuth.Authenticate(context.Background(), "token-123")
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

	client := &http.Client{
		Transport: roundTripFunc(func(_ *http.Request) (*http.Response, error) {
			return jsonResponse(http.StatusUnauthorized, `invalid token`), nil
		}),
	}

	clientAuth := NewSupabaseAuthenticator("https://supabase.example", "sb_publishable_test", client)
	_, err := clientAuth.Authenticate(context.Background(), "token-123")
	if !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("Authenticate() error = %v, want ErrUnauthorized", err)
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
