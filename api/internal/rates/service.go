package rates

import (
	"context"
	"errors"
	"fmt"
	"time"
)

var ErrMalformedResponse = errors.New("malformed rate provider response")

type MalformedResponseError struct {
	Err error
}

func (e *MalformedResponseError) Error() string {
	if e == nil || e.Err == nil {
		return ErrMalformedResponse.Error()
	}
	return fmt.Sprintf("%s: %v", ErrMalformedResponse, e.Err)
}

func (e *MalformedResponseError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Err
}

func (e *MalformedResponseError) Is(target error) bool {
	return target == ErrMalformedResponse
}

func WrapMalformedResponse(err error) error {
	if err == nil {
		return nil
	}
	return &MalformedResponseError{Err: err}
}

type Rate struct {
	Base         string
	Quote        string
	Value        string
	ProviderDate time.Time
	FetchedAt    time.Time
	Stale        bool
}

type RateProvider interface {
	USDToTHB(context.Context) (Rate, error)
}
