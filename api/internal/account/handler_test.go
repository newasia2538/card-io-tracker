package account

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

type stubManager struct {
	deactivateID  string
	deactivateErr error
	reactivateID  string
	reactivateErr error
	deleteID      string
	deleteErr     error
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return f(request)
}

func (s *stubManager) Deactivate(_ context.Context, userID string) error {
	s.deactivateID = userID
	return s.deactivateErr
}

func (s *stubManager) Reactivate(_ context.Context, userID string) error {
	s.reactivateID = userID
	return s.reactivateErr
}

func (s *stubManager) Delete(_ context.Context, userID string) error {
	s.deleteID = userID
	return s.deleteErr
}

func TestHandlerDeactivatesOnlyRegisteredAuthenticatedUser(t *testing.T) {
	t.Parallel()

	authenticator := &stubAuthenticator{user: auth.User{ID: "user-123"}}
	manager := &stubManager{}
	handler := NewHandler(authenticator, manager)

	req := httptest.NewRequest(http.MethodPost, "/api/account/deactivate", nil)
	req.Header.Set("Authorization", "Bearer jwt-token")
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusNoContent)
	}
	if authenticator.token != "jwt-token" {
		t.Fatalf("authenticator.token = %q, want %q", authenticator.token, "jwt-token")
	}
	if manager.deactivateID != "user-123" {
		t.Fatalf("manager.deactivateID = %q, want %q", manager.deactivateID, "user-123")
	}
}

func TestHandlerRejectsAnonymousAccountLifecycleRequest(t *testing.T) {
	t.Parallel()

	authenticator := &stubAuthenticator{user: auth.User{ID: "anonymous-123", IsAnonymous: true}}
	manager := &stubManager{}
	handler := NewHandler(authenticator, manager)

	req := httptest.NewRequest(http.MethodPost, "/api/account/deactivate", nil)
	req.Header.Set("Authorization", "Bearer jwt-token")
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusForbidden)
	}
	if manager.deactivateID != "" {
		t.Fatalf("manager.deactivateID = %q, want empty string", manager.deactivateID)
	}

	var body map[string]string
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body["code"] != "registered_account_required" {
		t.Fatalf("body[code] = %q, want %q", body["code"], "registered_account_required")
	}
}

func TestHandlerDeleteUsesAuthenticatedUserAndRequiresConfirmation(t *testing.T) {
	t.Parallel()

	authenticator := &stubAuthenticator{user: auth.User{ID: "user-123"}}
	manager := &stubManager{}
	handler := NewHandler(authenticator, manager)

	missingConfirmation := httptest.NewRequest(http.MethodDelete, "/api/account", bytes.NewBufferString(`{}`))
	missingConfirmation.Header.Set("Authorization", "Bearer jwt-token")
	missingRes := httptest.NewRecorder()
	handler.ServeHTTP(missingRes, missingConfirmation)

	if missingRes.Code != http.StatusBadRequest {
		t.Fatalf("missing confirmation status = %d, want %d", missingRes.Code, http.StatusBadRequest)
	}
	if manager.deleteID != "" {
		t.Fatalf("manager.deleteID after missing confirmation = %q, want empty string", manager.deleteID)
	}

	confirmed := httptest.NewRequest(http.MethodDelete, "/api/account", bytes.NewBufferString(`{"confirmation":"DELETE"}`))
	confirmed.Header.Set("Authorization", "Bearer jwt-token")
	confirmed.Header.Set("Content-Type", "application/json")
	confirmedRes := httptest.NewRecorder()
	handler.ServeHTTP(confirmedRes, confirmed)

	if confirmedRes.Code != http.StatusNoContent {
		t.Fatalf("confirmed status = %d, want %d", confirmedRes.Code, http.StatusNoContent)
	}
	if manager.deleteID != "user-123" {
		t.Fatalf("manager.deleteID = %q, want authenticated user id %q", manager.deleteID, "user-123")
	}
}

func TestHandlerMapsManagerFailure(t *testing.T) {
	t.Parallel()

	authenticator := &stubAuthenticator{user: auth.User{ID: "user-123"}}
	manager := &stubManager{deactivateErr: ErrUpstream}
	handler := NewHandler(authenticator, manager)

	req := httptest.NewRequest(http.MethodPost, "/api/account/deactivate", nil)
	req.Header.Set("Authorization", "Bearer jwt-token")
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)

	if res.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusBadGateway)
	}
	var body map[string]string
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body["code"] != "account_upstream_unavailable" {
		t.Fatalf("body[code] = %q, want %q", body["code"], "account_upstream_unavailable")
	}
}

func TestSupabaseManagerSendsServerOnlyAdminRequests(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		invoke     func(*SupabaseManager) error
		wantMethod string
		wantPath   string
		wantBody   string
	}{
		{
			name:       "deactivate",
			invoke:     func(manager *SupabaseManager) error { return manager.Deactivate(context.Background(), "user-123") },
			wantMethod: http.MethodPut,
			wantPath:   "/auth/v1/admin/users/user-123",
			wantBody:   `{"ban_duration":"876000h"}`,
		},
		{
			name:       "reactivate",
			invoke:     func(manager *SupabaseManager) error { return manager.Reactivate(context.Background(), "user-123") },
			wantMethod: http.MethodPut,
			wantPath:   "/auth/v1/admin/users/user-123",
			wantBody:   `{"ban_duration":"none"}`,
		},
		{
			name:       "delete",
			invoke:     func(manager *SupabaseManager) error { return manager.Delete(context.Background(), "user-123") },
			wantMethod: http.MethodDelete,
			wantPath:   "/auth/v1/admin/users/user-123",
			wantBody:   `{"should_soft_delete":false}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var gotMethod, gotPath, gotBody, gotAPIKey, gotAuthorization string
			client := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
				gotMethod = r.Method
				gotPath = r.URL.Path
				gotAPIKey = r.Header.Get("apikey")
				gotAuthorization = r.Header.Get("Authorization")
				body, err := io.ReadAll(r.Body)
				if err != nil {
					t.Errorf("read body: %v", err)
				}
				gotBody = string(body)
				return &http.Response{
					StatusCode: http.StatusOK,
					Body:       io.NopCloser(strings.NewReader("{}")),
					Header:     make(http.Header),
					Request:    r,
				}, nil
			})}

			manager := NewSupabaseManager("https://example.supabase.co", "sb_secret_test", client)
			if err := tt.invoke(manager); err != nil {
				t.Fatalf("invoke() error = %v", err)
			}

			if gotMethod != tt.wantMethod {
				t.Fatalf("method = %q, want %q", gotMethod, tt.wantMethod)
			}
			if gotPath != tt.wantPath {
				t.Fatalf("path = %q, want %q", gotPath, tt.wantPath)
			}
			if gotBody != tt.wantBody {
				t.Fatalf("body = %q, want %q", gotBody, tt.wantBody)
			}
			if gotAPIKey != "sb_secret_test" {
				t.Fatalf("apikey = %q, want secret key", gotAPIKey)
			}
			if gotAuthorization != "Bearer sb_secret_test" {
				t.Fatalf("authorization = %q, want secret bearer", gotAuthorization)
			}
		})
	}
}

func TestSupabaseManagerMapsNonSuccessResponse(t *testing.T) {
	t.Parallel()

	client := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusForbidden,
			Body:       io.NopCloser(strings.NewReader("{}")),
			Header:     make(http.Header),
			Request:    r,
		}, nil
	})}

	manager := NewSupabaseManager("https://example.supabase.co", "sb_secret_test", client)
	if err := manager.Deactivate(context.Background(), "user-123"); !errors.Is(err, ErrUpstream) {
		t.Fatalf("error = %v, want ErrUpstream", err)
	}
}
