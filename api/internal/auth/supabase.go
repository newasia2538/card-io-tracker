package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
)

var ErrUnauthorized = errors.New("unauthorized")

type User struct {
	ID          string
	IsAnonymous bool
}

type Authenticator interface {
	Authenticate(context.Context, string) (User, error)
}

type SupabaseAuthenticator struct {
	baseURL string
	apiKey  string
	client  *http.Client
}

type userResponse struct {
	ID          string `json:"id"`
	IsAnonymous bool   `json:"is_anonymous"`
}

func NewSupabaseAuthenticator(baseURL, apiKey string, client *http.Client) *SupabaseAuthenticator {
	if client == nil {
		client = http.DefaultClient
	}

	return &SupabaseAuthenticator{
		baseURL: strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		apiKey:  strings.TrimSpace(apiKey),
		client:  client,
	}
}

func (a *SupabaseAuthenticator) Authenticate(ctx context.Context, token string) (User, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, a.baseURL+"/auth/v1/user", nil)
	if err != nil {
		return User{}, fmt.Errorf("build auth request: %w", err)
	}

	req.Header.Set("apikey", a.apiKey)
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(token))

	res, err := a.client.Do(req)
	if err != nil {
		return User{}, fmt.Errorf("authenticate with supabase: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode == http.StatusUnauthorized {
		return User{}, ErrUnauthorized
	}
	if res.StatusCode != http.StatusOK {
		return User{}, fmt.Errorf("authenticate with supabase: unexpected status %d", res.StatusCode)
	}

	var payload userResponse
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return User{}, fmt.Errorf("decode auth response: %w", err)
	}
	if payload.ID == "" {
		return User{}, errors.New("auth response missing id")
	}

	return User{
		ID:          payload.ID,
		IsAnonymous: payload.IsAnonymous,
	}, nil
}
