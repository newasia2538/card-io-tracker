package account

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

var (
	ErrNotConfigured = errors.New("account admin is not configured")
	ErrUpstream      = errors.New("account admin upstream failed")
)

type Manager interface {
	Deactivate(context.Context, string) error
	Reactivate(context.Context, string) error
	Delete(context.Context, string) error
}

type SupabaseManager struct {
	baseURL   string
	secretKey string
	client    *http.Client
}

func NewSupabaseManager(baseURL, secretKey string, client *http.Client) *SupabaseManager {
	if client == nil {
		client = http.DefaultClient
	}

	return &SupabaseManager{
		baseURL:   strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		secretKey: strings.TrimSpace(secretKey),
		client:    client,
	}
}

func (m *SupabaseManager) Deactivate(ctx context.Context, userID string) error {
	return m.updateBan(ctx, userID, "876000h")
}

func (m *SupabaseManager) Reactivate(ctx context.Context, userID string) error {
	return m.updateBan(ctx, userID, "none")
}

func (m *SupabaseManager) Delete(ctx context.Context, userID string) error {
	return m.do(ctx, http.MethodDelete, userID, map[string]bool{
		"should_soft_delete": false,
	})
}

func (m *SupabaseManager) updateBan(ctx context.Context, userID, duration string) error {
	return m.do(ctx, http.MethodPut, userID, map[string]string{
		"ban_duration": duration,
	})
}

func (m *SupabaseManager) do(ctx context.Context, method, userID string, payload any) error {
	if m.baseURL == "" || m.secretKey == "" {
		return ErrNotConfigured
	}
	if strings.TrimSpace(userID) == "" {
		return fmt.Errorf("%w: missing user id", ErrUpstream)
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("%w: encode request", ErrUpstream)
	}

	endpoint := m.baseURL + "/auth/v1/admin/users/" + url.PathEscape(userID)
	req, err := http.NewRequestWithContext(ctx, method, endpoint, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("%w: build request", ErrUpstream)
	}
	req.Header.Set("apikey", m.secretKey)
	req.Header.Set("Authorization", "Bearer "+m.secretKey)
	req.Header.Set("Content-Type", "application/json")

	res, err := m.client.Do(req)
	if err != nil {
		return fmt.Errorf("%w: send request", ErrUpstream)
	}
	defer res.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 4*1024))

	if res.StatusCode < http.StatusOK || res.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf("%w: supabase admin returned status %d", ErrUpstream, res.StatusCode)
	}

	return nil
}
