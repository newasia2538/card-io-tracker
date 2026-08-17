package rates

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"
)

const (
	defaultFrankfurterBaseURL = "https://api.frankfurter.dev"
	cacheTTL                  = 24 * time.Hour
)

var decimalPattern = regexp.MustCompile(`^[+-]?\d+(?:\.\d+)?$`)

type FrankfurterProvider struct {
	client  *http.Client
	baseURL string
	now     func() time.Time

	mu             sync.Mutex
	cond           *sync.Cond
	cached         Rate
	hasRate        bool
	refreshing     bool
	refreshSeq     uint64
	lastRefreshErr error
}

type FrankfurterOption func(*FrankfurterProvider)

func WithBaseURL(baseURL string) FrankfurterOption {
	return func(provider *FrankfurterProvider) {
		trimmed := strings.TrimRight(strings.TrimSpace(baseURL), "/")
		if trimmed != "" {
			provider.baseURL = trimmed
		}
	}
}

func NewFrankfurterProvider(client *http.Client, options ...FrankfurterOption) *FrankfurterProvider {
	if client == nil {
		client = http.DefaultClient
	}

	baseURL := strings.TrimRight(strings.TrimSpace(os.Getenv("FRANKFURTER_BASE_URL")), "/")
	if baseURL == "" {
		baseURL = defaultFrankfurterBaseURL
	}

	provider := &FrankfurterProvider{
		client:  client,
		baseURL: baseURL,
		now:     time.Now,
	}
	for _, option := range options {
		if option != nil {
			option(provider)
		}
	}
	provider.cond = sync.NewCond(&provider.mu)
	return provider
}

func (p *FrankfurterProvider) USDToTHB(ctx context.Context) (Rate, error) {
	p.mu.Lock()
	p.ensureCondLocked()
	for {
		if p.hasRate && p.now().Sub(p.cached.FetchedAt) < cacheTTL {
			rate := p.cached
			p.mu.Unlock()
			return rate, nil
		}

		observedSeq := p.refreshSeq
		if p.refreshing {
			p.cond.Wait()
			if p.refreshSeq != observedSeq {
				if p.hasRate && p.now().Sub(p.cached.FetchedAt) < cacheTTL {
					rate := p.cached
					p.mu.Unlock()
					return rate, nil
				}
				if p.hasRate {
					stale := p.cached
					stale.Stale = true
					p.mu.Unlock()
					return stale, nil
				}

				err := p.lastRefreshErr
				p.mu.Unlock()
				return Rate{}, err
			}
			continue
		}

		p.refreshing = true
		p.mu.Unlock()

		rate, err := p.fetch(ctx)

		p.mu.Lock()
		p.refreshing = false
		p.refreshSeq++
		p.lastRefreshErr = err
		if err == nil {
			p.cached = rate
			p.hasRate = true
		}
		p.cond.Broadcast()

		if err == nil {
			p.mu.Unlock()
			return rate, nil
		}
		if p.hasRate {
			stale := p.cached
			stale.Stale = true
			p.mu.Unlock()
			return stale, nil
		}

		p.mu.Unlock()
		return Rate{}, err
	}
}

type frankfurterResponse struct {
	Date  string      `json:"date"`
	Base  string      `json:"base"`
	Quote string      `json:"quote"`
	Rate  json.Number `json:"rate"`
}

func (p *FrankfurterProvider) fetch(ctx context.Context) (Rate, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.baseURL+"/v2/rate/USD/THB", nil)
	if err != nil {
		return Rate{}, fmt.Errorf("build Frankfurter request: %w", err)
	}

	res, err := p.client.Do(req)
	if err != nil {
		return Rate{}, fmt.Errorf("fetch USD/THB rate: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return Rate{}, fmt.Errorf("fetch USD/THB rate: unexpected status %d", res.StatusCode)
	}

	var payload frankfurterResponse
	decoder := json.NewDecoder(res.Body)
	decoder.UseNumber()
	if err := decoder.Decode(&payload); err != nil {
		return Rate{}, fmt.Errorf("decode Frankfurter response: %w", err)
	}

	providerDate, err := time.Parse("2006-01-02", payload.Date)
	if err != nil {
		return Rate{}, errors.New("provider date must be YYYY-MM-DD")
	}
	if payload.Base != "USD" || payload.Quote != "THB" {
		return Rate{}, fmt.Errorf("unexpected currency pair %s/%s", payload.Base, payload.Quote)
	}
	if err := validatePositiveDecimal(payload.Rate.String()); err != nil {
		return Rate{}, fmt.Errorf("invalid provider rate: %w", err)
	}

	return Rate{
		Base:         payload.Base,
		Quote:        payload.Quote,
		Value:        payload.Rate.String(),
		ProviderDate: providerDate,
		FetchedAt:    p.now(),
	}, nil
}

func validatePositiveDecimal(value string) error {
	if !decimalPattern.MatchString(value) {
		return errors.New("must be a decimal")
	}

	rat, ok := new(big.Rat).SetString(value)
	if !ok {
		return errors.New("must be a decimal")
	}
	if rat.Sign() <= 0 {
		return errors.New("must be positive")
	}
	return nil
}

func (p *FrankfurterProvider) ensureCondLocked() {
	if p.cond == nil {
		p.cond = sync.NewCond(&p.mu)
	}
}
