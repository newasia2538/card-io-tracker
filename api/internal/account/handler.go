package account

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"cardledger/api/internal/auth"
)

const maxDeleteBodyBytes int64 = 8 * 1024

var errDeleteConfirmationRequired = errors.New("delete confirmation must be DELETE")

type Handler struct {
	authenticator auth.Authenticator
	manager       Manager
}

type deleteAccountRequest struct {
	Confirmation string `json:"confirmation"`
}

func NewHandler(authenticator auth.Authenticator, manager Manager) http.Handler {
	handler := &Handler{
		authenticator: authenticator,
		manager:       manager,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/account/deactivate", handler.deactivate)
	mux.HandleFunc("POST /api/account/reactivate", handler.reactivate)
	mux.HandleFunc("DELETE /api/account", handler.delete)
	return mux
}

func (h *Handler) deactivate(w http.ResponseWriter, r *http.Request) {
	user, ok := h.requireRegisteredUser(w, r)
	if !ok {
		return
	}
	if err := h.manager.Deactivate(r.Context(), user.ID); err != nil {
		writeManagerError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) reactivate(w http.ResponseWriter, r *http.Request) {
	user, ok := h.requireRegisteredUser(w, r)
	if !ok {
		return
	}
	if err := h.manager.Reactivate(r.Context(), user.ID); err != nil {
		writeManagerError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	user, ok := h.requireRegisteredUser(w, r)
	if !ok {
		return
	}

	if err := decodeDeleteConfirmation(w, r); err != nil {
		writeAccountError(w, http.StatusBadRequest, "confirmation_required", err.Error())
		return
	}
	if err := h.manager.Delete(r.Context(), user.ID); err != nil {
		writeManagerError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) requireRegisteredUser(w http.ResponseWriter, r *http.Request) (auth.User, bool) {
	token := bearerToken(r.Header.Get("Authorization"))
	if token == "" {
		writeAccountError(w, http.StatusUnauthorized, "unauthorized", "missing bearer token")
		return auth.User{}, false
	}

	user, err := h.authenticator.Authenticate(r.Context(), token)
	if err != nil {
		if errors.Is(err, auth.ErrUnauthorized) {
			writeAccountError(w, http.StatusUnauthorized, "unauthorized", "unauthorized")
			return auth.User{}, false
		}
		writeAccountError(w, http.StatusInternalServerError, "internal_error", "authentication failed")
		return auth.User{}, false
	}
	if user.IsAnonymous {
		writeAccountError(w, http.StatusForbidden, "registered_account_required", "registered account required")
		return auth.User{}, false
	}
	return user, true
}

func decodeDeleteConfirmation(w http.ResponseWriter, r *http.Request) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxDeleteBodyBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()

	var input deleteAccountRequest
	if err := decoder.Decode(&input); err != nil {
		if errors.Is(err, io.EOF) {
			return errDeleteConfirmationRequired
		}
		if strings.Contains(err.Error(), "request body too large") {
			return errors.New("request body too large")
		}
		return errors.New("invalid delete confirmation")
	}
	var extra json.RawMessage
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return errors.New("request body must contain a single JSON object")
	}
	if input.Confirmation != "DELETE" {
		return errDeleteConfirmationRequired
	}
	return nil
}

func writeManagerError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrNotConfigured):
		writeAccountError(w, http.StatusServiceUnavailable, "account_management_unavailable", "account management is not configured")
	case errors.Is(err, ErrUpstream):
		writeAccountError(w, http.StatusBadGateway, "account_upstream_unavailable", "account service unavailable")
	default:
		writeAccountError(w, http.StatusInternalServerError, "internal_error", "internal server error")
	}
}

func bearerToken(header string) string {
	const prefix = "Bearer "
	if !strings.HasPrefix(header, prefix) {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(header, prefix))
}

func writeAccountError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"code":  code,
		"error": message,
	})
}
