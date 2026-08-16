package rates

import (
	"context"
	"time"
)

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
