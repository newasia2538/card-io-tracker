package config

import "testing"

func TestLoadFromEnvRequiresAllSettings(t *testing.T) {
	t.Setenv("SUPABASE_URL", "")
	t.Setenv("SUPABASE_PUBLISHABLE_KEY", "")
	t.Setenv("FRANKFURTER_BASE_URL", "")
	t.Setenv("PORT", "")

	_, err := LoadFromEnv()
	if err == nil {
		t.Fatal("LoadFromEnv() error = nil, want error")
	}
}

func TestLoadFromEnvReadsSettings(t *testing.T) {
	t.Setenv("SUPABASE_URL", "https://example.supabase.co")
	t.Setenv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test")
	t.Setenv("FRANKFURTER_BASE_URL", "https://api.frankfurter.dev")
	t.Setenv("PORT", "8080")

	cfg, err := LoadFromEnv()
	if err != nil {
		t.Fatalf("LoadFromEnv() error = %v", err)
	}

	if cfg.SupabaseURL != "https://example.supabase.co" {
		t.Fatalf("SupabaseURL = %q, want %q", cfg.SupabaseURL, "https://example.supabase.co")
	}
	if cfg.SupabasePublishableKey != "sb_publishable_test" {
		t.Fatalf("SupabasePublishableKey = %q, want %q", cfg.SupabasePublishableKey, "sb_publishable_test")
	}
	if cfg.FrankfurterBaseURL != "https://api.frankfurter.dev" {
		t.Fatalf("FrankfurterBaseURL = %q, want %q", cfg.FrankfurterBaseURL, "https://api.frankfurter.dev")
	}
	if cfg.Port != "8080" {
		t.Fatalf("Port = %q, want %q", cfg.Port, "8080")
	}
}
