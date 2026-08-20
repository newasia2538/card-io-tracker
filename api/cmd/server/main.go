package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"cardledger/api/internal/auth"
	"cardledger/api/internal/config"
	"cardledger/api/internal/graphql"
	"cardledger/api/internal/ratelimit"
	"cardledger/api/internal/rates"
	"cardledger/api/internal/transactions"
)

const (
	upstreamTimeout   = 10 * time.Second
	readHeaderTimeout = 5 * time.Second
	readTimeout       = 15 * time.Second
	writeTimeout      = 15 * time.Second
	idleTimeout       = 60 * time.Second
	shutdownTimeout   = 10 * time.Second
	apiRateLimit      = 60
	apiRateWindow     = time.Minute
)

func newHandler(apiHandler http.Handler) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", healthz)
	if apiHandler != nil {
		mux.Handle("/", rateLimit(apiHandler, ratelimit.New(apiRateLimit, apiRateWindow)))
	}
	return securityHeaders(mux)
}

func healthz(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		w.Header().Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'")
		next.ServeHTTP(w, r)
	})
}

func rateLimit(next http.Handler, limiter *ratelimit.Limiter) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		allowed, retryAfter := limiter.Allow(requestClientKey(r))
		if !allowed {
			retrySeconds := int(math.Ceil(retryAfter.Seconds()))
			if retrySeconds < 1 {
				retrySeconds = 1
			}
			w.Header().Set("Retry-After", strconv.Itoa(retrySeconds))
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusTooManyRequests)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"code":  "rate_limited",
				"error": "too many requests",
			})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func requestClientKey(r *http.Request) string {
	if forwardedIP := strings.TrimSpace(r.Header.Get("CF-Connecting-IP")); forwardedIP != "" {
		return forwardedIP
	}

	remoteAddr := strings.TrimSpace(r.RemoteAddr)
	if host, _, err := net.SplitHostPort(remoteAddr); err == nil {
		return host
	}
	return remoteAddr
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
	rateProvider := rates.NewFrankfurterProvider(httpClient, rates.WithBaseURL(cfg.FrankfurterBaseURL))
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
