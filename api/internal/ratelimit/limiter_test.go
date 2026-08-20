package ratelimit

import (
	"testing"
	"time"
)

func TestLimiterBlocksAfterLimitUntilWindowResets(t *testing.T) {
	current := time.Unix(100, 0)
	limiter := New(2, time.Minute)
	limiter.now = func() time.Time { return current }

	if allowed, _ := limiter.Allow("client-1"); !allowed {
		t.Fatal("first request blocked")
	}
	if allowed, _ := limiter.Allow("client-1"); !allowed {
		t.Fatal("second request blocked")
	}
	allowed, retryAfter := limiter.Allow("client-1")
	if allowed {
		t.Fatal("third request allowed")
	}
	if retryAfter <= 0 || retryAfter > time.Minute {
		t.Fatalf("retryAfter = %s, want positive duration at most 1m", retryAfter)
	}

	current = current.Add(time.Minute)
	if allowed, _ := limiter.Allow("client-1"); !allowed {
		t.Fatal("request stayed blocked after window reset")
	}
}

func TestLimiterSeparatesClientKeys(t *testing.T) {
	limiter := New(1, time.Minute)

	if allowed, _ := limiter.Allow("client-1"); !allowed {
		t.Fatal("client-1 request blocked")
	}
	if allowed, _ := limiter.Allow("client-2"); !allowed {
		t.Fatal("client-2 request blocked")
	}
}
