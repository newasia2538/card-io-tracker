package transactions

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"cardledger/api/internal/rates"
)

type ErrorKind string

const (
	ErrorKindValidation      ErrorKind = "validation"
	ErrorKindUnauthorized    ErrorKind = "unauthorized"
	ErrorKindNotFound        ErrorKind = "not_found"
	ErrorKindConflict        ErrorKind = "conflict"
	ErrorKindRateUnavailable ErrorKind = "rate_unavailable"
	ErrorKindUpstream        ErrorKind = "upstream"
)

type Error struct {
	Kind    ErrorKind
	Message string
	Err     error
}

func (e *Error) Error() string {
	if e == nil {
		return ""
	}
	if e.Message != "" {
		return e.Message
	}
	if e.Err != nil {
		return e.Err.Error()
	}
	return string(e.Kind)
}

func (e *Error) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Err
}

type ExchangeRate struct {
	Base         string `json:"base"`
	Quote        string `json:"quote"`
	Rate         string `json:"rate"`
	ProviderDate string `json:"provider_date"`
	Stale        bool   `json:"stale"`
}

type APIService interface {
	List(context.Context, string, string) ([]Transaction, error)
	Create(context.Context, string, string, TransactionInput) (Transaction, error)
	Update(context.Context, string, string, string, TransactionInput) (Transaction, error)
	Delete(context.Context, string, string) error
	ExchangeRate(context.Context, string, string) (ExchangeRate, error)
}

type Service struct {
	store        TransactionStore
	rateProvider rates.RateProvider
}

type storeKindError interface {
	StoreErrorKind() string
}

func NewService(store TransactionStore, rateProvider rates.RateProvider) *Service {
	return &Service{
		store:        store,
		rateProvider: rateProvider,
	}
}

func (s *Service) List(ctx context.Context, userJWT string, action string) ([]Transaction, error) {
	trimmedAction := strings.TrimSpace(action)
	if trimmedAction != "" && trimmedAction != "BUY" && trimmedAction != "SELL" {
		return nil, &Error{Kind: ErrorKindValidation, Message: "action must be BUY or SELL"}
	}
	records, err := s.store.List(ctx, userJWT, trimmedAction)
	if err != nil {
		return nil, mapStoreError(err)
	}
	return records, nil
}

func (s *Service) Create(ctx context.Context, userJWT string, userID string, input TransactionInput) (Transaction, error) {
	stored, err := s.canonicalize(ctx, userID, input)
	if err != nil {
		return Transaction{}, err
	}

	record, err := s.store.Create(ctx, userJWT, stored)
	if err != nil {
		return Transaction{}, mapStoreError(err)
	}
	return record, nil
}

func (s *Service) Update(ctx context.Context, userJWT string, userID string, id string, input TransactionInput) (Transaction, error) {
	stored, err := s.canonicalize(ctx, userID, input)
	if err != nil {
		return Transaction{}, err
	}

	record, err := s.store.Update(ctx, userJWT, strings.TrimSpace(id), stored)
	if err != nil {
		return Transaction{}, mapStoreError(err)
	}
	return record, nil
}

func (s *Service) Delete(ctx context.Context, userJWT string, id string) error {
	if err := s.store.Delete(ctx, userJWT, strings.TrimSpace(id)); err != nil {
		return mapStoreError(err)
	}
	return nil
}

func (s *Service) ExchangeRate(ctx context.Context, from string, to string) (ExchangeRate, error) {
	if strings.TrimSpace(from) != "USD" || strings.TrimSpace(to) != "THB" {
		return ExchangeRate{}, &Error{Kind: ErrorKindValidation, Message: "only USD to THB is supported"}
	}

	rate, err := s.rateProvider.USDToTHB(ctx)
	if err != nil {
		return ExchangeRate{}, &Error{Kind: ErrorKindUpstream, Message: "usd/thb rate unavailable", Err: err}
	}

	return ExchangeRate{
		Base:         rate.Base,
		Quote:        rate.Quote,
		Rate:         rate.Value,
		ProviderDate: rate.ProviderDate.Format("2006-01-02"),
		Stale:        rate.Stale,
	}, nil
}

func (s *Service) canonicalize(ctx context.Context, userID string, input TransactionInput) (StoredTransaction, error) {
	canonical, err := ValidateAndCanonicalize(ctx, input, s.rateProvider)
	if err != nil {
		return StoredTransaction{}, mapCanonicalizeError(input, err)
	}

	return StoredTransaction{
		UserID:            strings.TrimSpace(userID),
		Action:            canonical.Action,
		CardType:          canonical.CardType,
		CustomCardType:    canonical.CustomCardType,
		Price:             canonical.Price,
		Currency:          canonical.Currency,
		PriceTHB:          canonical.PriceTHB,
		ExchangeRateToTHB: canonical.ExchangeRateToTHB,
		ExchangeRateDate:  canonical.ExchangeRateDate,
		TransactionDate:   canonical.TransactionDate,
	}, nil
}

func mapCanonicalizeError(input TransactionInput, err error) error {
	if err == nil {
		return nil
	}
	if strings.TrimSpace(input.Currency) == "USD" && strings.Contains(err.Error(), "get USD/THB rate:") {
		return &Error{Kind: ErrorKindRateUnavailable, Message: "usd/thb rate unavailable", Err: err}
	}
	if strings.TrimSpace(input.Currency) == "USD" && errors.Is(err, errInvalidUSDRate) {
		return &Error{Kind: ErrorKindUpstream, Message: "usd/thb rate response invalid", Err: err}
	}
	return &Error{Kind: ErrorKindValidation, Message: err.Error(), Err: err}
}

func mapStoreError(err error) error {
	if err == nil {
		return nil
	}

	var kinded storeKindError
	if errors.As(err, &kinded) {
		switch kinded.StoreErrorKind() {
		case "unauthorized":
			return &Error{Kind: ErrorKindUnauthorized, Message: err.Error(), Err: err}
		case "not_found":
			return &Error{Kind: ErrorKindNotFound, Message: err.Error(), Err: err}
		case "conflict":
			return &Error{Kind: ErrorKindConflict, Message: err.Error(), Err: err}
		default:
			return &Error{Kind: ErrorKindUpstream, Message: err.Error(), Err: err}
		}
	}

	var serviceErr *Error
	if errors.As(err, &serviceErr) {
		return serviceErr
	}

	return &Error{Kind: ErrorKindUpstream, Message: fmt.Sprintf("store request failed: %v", err), Err: err}
}
