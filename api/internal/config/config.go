package config

import (
	"errors"
	"fmt"
	"os"
	"strings"
)

type Config struct {
	SupabaseURL            string
	SupabasePublishableKey string
	FrankfurterBaseURL     string
	Port                   string
}

func LoadFromEnv() (Config, error) {
	cfg := Config{
		SupabaseURL:            strings.TrimSpace(os.Getenv("SUPABASE_URL")),
		SupabasePublishableKey: strings.TrimSpace(os.Getenv("SUPABASE_PUBLISHABLE_KEY")),
		FrankfurterBaseURL:     strings.TrimSpace(os.Getenv("FRANKFURTER_BASE_URL")),
		Port:                   strings.TrimSpace(os.Getenv("PORT")),
	}

	if cfg.SupabaseURL == "" {
		return Config{}, errors.New("SUPABASE_URL is required")
	}
	if cfg.SupabasePublishableKey == "" {
		return Config{}, errors.New("SUPABASE_PUBLISHABLE_KEY is required")
	}
	if cfg.FrankfurterBaseURL == "" {
		return Config{}, errors.New("FRANKFURTER_BASE_URL is required")
	}
	if cfg.Port == "" {
		return Config{}, errors.New("PORT is required")
	}

	return cfg, nil
}

func (c Config) ListenAddress() string {
	return fmt.Sprintf(":%s", c.Port)
}
