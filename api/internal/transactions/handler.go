package transactions

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"cardledger/api/internal/auth"
)

type Handler struct {
	authenticator auth.Authenticator
	service       APIService
}

func NewHandler(authenticator auth.Authenticator, service APIService) http.Handler {
	handler := &Handler{
		authenticator: authenticator,
		service:       service,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/transactions", handler.listTransactions)
	mux.HandleFunc("POST /api/transactions", handler.createTransaction)
	mux.HandleFunc("PATCH /api/transactions/{id}", handler.updateTransaction)
	mux.HandleFunc("DELETE /api/transactions/{id}", handler.deleteTransaction)
	mux.HandleFunc("GET /api/exchange-rate", handler.getExchangeRate)
	return mux
}

func (h *Handler) listTransactions(w http.ResponseWriter, r *http.Request) {
	_, token, ok := h.authenticateRequest(w, r)
	if !ok {
		return
	}

	records, err := h.service.List(r.Context(), token, r.URL.Query().Get("action"))
	if err != nil {
		writeServiceError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"transactions": records,
	})
}

func (h *Handler) createTransaction(w http.ResponseWriter, r *http.Request) {
	user, token, ok := h.authenticateRequest(w, r)
	if !ok {
		return
	}

	var input TransactionInput
	if err := decodeJSONBody(r.Context(), r, &input); err != nil {
		writeServiceError(w, &Error{Kind: ErrorKindValidation, Message: err.Error(), Err: err})
		return
	}

	record, err := h.service.Create(r.Context(), token, user.ID, input)
	if err != nil {
		writeServiceError(w, err)
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"transaction": record,
	})
}

func (h *Handler) updateTransaction(w http.ResponseWriter, r *http.Request) {
	user, token, ok := h.authenticateRequest(w, r)
	if !ok {
		return
	}

	var input TransactionInput
	if err := decodeJSONBody(r.Context(), r, &input); err != nil {
		writeServiceError(w, &Error{Kind: ErrorKindValidation, Message: err.Error(), Err: err})
		return
	}

	record, err := h.service.Update(r.Context(), token, user.ID, r.PathValue("id"), input)
	if err != nil {
		writeServiceError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"transaction": record,
	})
}

func (h *Handler) deleteTransaction(w http.ResponseWriter, r *http.Request) {
	_, token, ok := h.authenticateRequest(w, r)
	if !ok {
		return
	}

	if err := h.service.Delete(r.Context(), token, r.PathValue("id")); err != nil {
		writeServiceError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) getExchangeRate(w http.ResponseWriter, r *http.Request) {
	_, _, ok := h.authenticateRequest(w, r)
	if !ok {
		return
	}

	rate, err := h.service.ExchangeRate(r.Context(), r.URL.Query().Get("from"), r.URL.Query().Get("to"))
	if err != nil {
		writeServiceError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, rate)
}

func (h *Handler) authenticateRequest(w http.ResponseWriter, r *http.Request) (auth.User, string, bool) {
	token := bearerToken(r.Header.Get("Authorization"))
	if token == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing bearer token")
		return auth.User{}, "", false
	}

	user, err := h.authenticator.Authenticate(r.Context(), token)
	if err != nil {
		if errors.Is(err, auth.ErrUnauthorized) {
			writeError(w, http.StatusUnauthorized, "unauthorized", "unauthorized")
			return auth.User{}, "", false
		}
		writeError(w, http.StatusInternalServerError, "internal_error", "authentication failed")
		return auth.User{}, "", false
	}
	return user, token, true
}

func decodeJSONBody(ctx context.Context, r *http.Request, out any) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(out); err != nil {
		return err
	}
	var extra json.RawMessage
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return errors.New("request body must contain a single JSON object")
	}
	return nil
}

func bearerToken(header string) string {
	const prefix = "Bearer "
	if !strings.HasPrefix(header, prefix) {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(header, prefix))
}

func writeServiceError(w http.ResponseWriter, err error) {
	var serviceErr *Error
	if errors.As(err, &serviceErr) {
		switch serviceErr.Kind {
		case ErrorKindValidation:
			writeError(w, http.StatusBadRequest, "validation_failed", serviceErr.Error())
		case ErrorKindUnauthorized:
			writeError(w, http.StatusUnauthorized, "unauthorized", serviceErr.Error())
		case ErrorKindNotFound:
			writeError(w, http.StatusNotFound, "not_found", serviceErr.Error())
		case ErrorKindConflict:
			writeError(w, http.StatusConflict, "conflict", serviceErr.Error())
		case ErrorKindRateUnavailable:
			writeError(w, http.StatusServiceUnavailable, "rate_unavailable", serviceErr.Error())
		case ErrorKindUpstream:
			writeError(w, http.StatusBadGateway, "upstream_unavailable", serviceErr.Error())
		default:
			writeError(w, http.StatusInternalServerError, "internal_error", "internal server error")
		}
		return
	}

	writeError(w, http.StatusInternalServerError, "internal_error", "internal server error")
}

func writeError(w http.ResponseWriter, status int, code string, message string) {
	writeJSON(w, status, map[string]string{
		"code":  code,
		"error": message,
	})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
