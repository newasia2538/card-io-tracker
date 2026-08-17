package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"cardledger/api/internal/auth"
	"cardledger/api/internal/config"
	"cardledger/api/internal/graphql"
	"cardledger/api/internal/rates"
	"cardledger/api/internal/transactions"
)

const (
	upstreamTimeout    = 10 * time.Second
	readHeaderTimeout  = 5 * time.Second
	readTimeout        = 15 * time.Second
	writeTimeout       = 15 * time.Second
	idleTimeout        = 60 * time.Second
	shutdownTimeout    = 10 * time.Second
)

func newHandler(apiHandler http.Handler) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", healthz)
	if apiHandler != nil {
		mux.Handle("/", apiHandler)
	}
	return mux
}

func healthz(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	if err := run(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "server error: %v\n", err)
		os.Exit(1)
	}
}

func run(ctx context.Context) error {
	cfg, err := config.LoadFromEnv()
	if err != nil {
		return err
	}

	httpClient := &http.Client{Timeout: upstreamTimeout}
	authenticator := auth.NewSupabaseAuthenticator(cfg.SupabaseURL, cfg.SupabasePublishableKey, httpClient)
	store := graphql.NewClient(cfg.SupabaseURL, cfg.SupabasePublishableKey, httpClient)
	rateProvider := rates.NewFrankfurterProvider(httpClient)
	service := transactions.NewService(store, rateProvider)
	handler := newHandler(transactions.NewHandler(authenticator, service))
	server := newServer(cfg, handler)

	errCh := make(chan error, 1)
	go func() {
		errCh <- server.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			return err
		}
		return nil
	}
}

func newServer(cfg config.Config, handler http.Handler) *http.Server {
	return &http.Server{
		Addr:              cfg.ListenAddress(),
		Handler:           handler,
		ReadHeaderTimeout: readHeaderTimeout,
		ReadTimeout:       readTimeout,
		WriteTimeout:      writeTimeout,
		IdleTimeout:       idleTimeout,
	}
}
