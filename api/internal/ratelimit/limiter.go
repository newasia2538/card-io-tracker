package ratelimit

import (
	"sync"
	"time"
)

const maxTrackedClients = 10_000

type Limiter struct {
	mu      sync.Mutex
	limit   int
	window  time.Duration
	now     func() time.Time
	clients map[string]clientWindow
}

type clientWindow struct {
	count    int
	resetAt  time.Time
	lastSeen time.Time
}

func New(limit int, window time.Duration) *Limiter {
	if limit < 1 {
		panic("rate limit must be positive")
	}
	if window <= 0 {
		panic("rate-limit window must be positive")
	}

	return &Limiter{
		limit:   limit,
		window:  window,
		now:     time.Now,
		clients: make(map[string]clientWindow),
	}
}

func (l *Limiter) Allow(key string) (bool, time.Duration) {
	now := l.now()

	l.mu.Lock()
	defer l.mu.Unlock()

	window, ok := l.clients[key]
	if ok && now.Before(window.resetAt) {
		window.lastSeen = now
		if window.count >= l.limit {
			return false, window.resetAt.Sub(now)
		}
		window.count++
		l.clients[key] = window
		return true, 0
	}

	if !ok {
		l.ensureCapacity()
	}
	l.clients[key] = clientWindow{
		count:    1,
		resetAt:  now.Add(l.window),
		lastSeen: now,
	}
	return true, 0
}

func (l *Limiter) ensureCapacity() {
	if len(l.clients) < maxTrackedClients {
		return
	}

	var oldestKey string
	var oldestSeen time.Time
	for key, window := range l.clients {
		if oldestKey == "" || window.lastSeen.Before(oldestSeen) {
			oldestKey = key
			oldestSeen = window.lastSeen
		}
	}
	delete(l.clients, oldestKey)
}
