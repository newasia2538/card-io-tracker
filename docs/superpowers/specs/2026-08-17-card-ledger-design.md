# Card Ledger PWA Design

Date: 2026-08-17

## Goal

Build an installable Progressive Web App for card collectors to record and manage buy/sell transactions. Data persists in Supabase and is accessed through a Go API using Supabase GraphQL.

## Product decisions

- No registration or sign-in is required for first use.
- The client silently creates a Supabase anonymous auth session.
- Every record belongs to the authenticated Supabase user ID.
- An optional email/password account-upgrade flow preserves anonymous records for later cross-device access.
- Network is required for list, create, edit, and delete operations in the MVP. The PWA caches its app shell but does not queue offline writes.
- Only THB and USD are supported currencies.
- The currency default is THB when `navigator.language` starts with `th`; otherwise it is USD. Users can always override the default.
- Summary totals and profit/loss use a user-selected display currency and the latest available exchange rate.

## Architecture

```text
React + TypeScript PWA
  ├─ Supabase Auth client: anonymous session and optional account upgrade
  └─ Go API: bearer-token validation and transaction endpoints
       └─ Supabase GraphQL: reads/writes protected by PostgreSQL RLS
```

The browser sends the Supabase access token as a bearer token to the Go API. The API validates the token, derives the user ID from its claims, and never accepts `user_id` from request bodies. The API forwards the user token to Supabase GraphQL so RLS applies to every query and mutation.

Frontend environment values are public Supabase URL/key values. Backend values are supplied through environment variables and are never committed. `.env.example` documents all required values.

## Data model

Supabase SQL migration creates a `transactions` table:

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `action text not null` constrained to `BUY` or `SELL`
- `card_type text not null`
- `custom_card_type text null`
- `price numeric(14, 2) not null` with a positive-value check
- `currency text not null` constrained to `USD` or `THB`
- `transaction_date date not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

When `card_type` is `Others`, `custom_card_type` is required. For other card types it is stored as null. An index on `(user_id, transaction_date desc, created_at desc)` supports latest-first lists. RLS permits authenticated users, including anonymous users, to select, insert, update, and delete only rows where `user_id = auth.uid()`.

## API contract

- `GET /api/transactions`: return current user records sorted by `transaction_date desc`, then `created_at desc`; optional action filter supports `BUY` and `SELL` tabs.
- `POST /api/transactions`: validate and create a record for the token owner.
- `PATCH /api/transactions/:id`: validate and update an owned record.
- `DELETE /api/transactions/:id`: delete an owned record after ownership enforcement.
- `GET /api/exchange-rate?from=USD&to=THB`: return the latest supported pair rate and provider date. Go fetches the free Frankfurter API server-side and caches the response for the provider's daily update window.

Request validation rejects missing fields, unsupported enum values, non-positive prices, invalid dates, and missing custom card type for `Others`. Responses use JSON with stable error messages and appropriate HTTP status codes. API tests cover validation, auth boundaries, and GraphQL mapping.

## UI behavior

The main screen contains a header, transaction form, and transaction list.

Form fields:

- Buy/Sell segmented control.
- Card Type dropdown with Sport card, Pokemon card, One Piece Card, JH Card, and Others.
- Conditional custom card type input for Others.
- Positive price input.
- Currency dropdown with flag and symbol: 🇹🇭 THB ฿, 🇺🇸 USD $.
- Date input defaulting to current local date in `YYYY-MM-DD`.
- `SAVE` and `CLEAR` actions.

Create mode uses `SAVE`. Selecting `EDIT` on a row switches the same form to edit mode with all values populated and changes the primary action to `UPDATE`. `CLEAR` exits edit mode and resets the form. Successful create/update resets the form, refreshes the list, and keeps the active Buy/Sell tab. Delete requires confirmation, then refreshes the relevant list.

Above the list, a summary area shows `BUY`, `SELL`, and `P/L` values. A THB/USD switch changes the summary display currency. For selected currency `C`, calculate:

- `totalBuy = sum(convert(amount, record.currency, C))` for BUY records.
- `totalSell = sum(convert(amount, record.currency, C))` for SELL records.
- `P/L = totalSell - totalBuy`.

Positive P/L is green. Negative P/L includes its negative sign and is red. Zero is neutral. Summary amounts round to two decimal places only for display; aggregation keeps higher precision. A small rate-date label identifies the exchange-rate snapshot used. Individual rows retain their original entered amount and currency.

The list uses Buy/Sell tabs with counts. Each row shows action, card type (custom type when applicable), date, amount, currency, edit, and delete controls. Empty tabs have clear empty states. Layout is single-column on mobile and centered two-column on desktop. Labels, keyboard access, focus states, and status announcements are included.

An account control exposes optional anonymous-account upgrade using email/password. Upgrade errors preserve the existing anonymous session and records.

## Error handling

- Anonymous auth failure: show a recoverable auth error and retry action.
- API/network failure: preserve form values and show retry feedback.
- Exchange-rate failure: use the last successful cached rate and show its date; if no rate is available, keep the transaction list usable and show summary values as unavailable.
- Validation failure: show inline field errors and do not send a request.
- Unauthorized or forbidden mutation: show an error and refresh the list.
- Delete cancellation: make no request.
- Successful mutation: show a concise success status and update visible data.

## PWA behavior

- Web app manifest includes name, icons, theme color, display mode, and start URL.
- Service worker caches the application shell for installability and repeat visits.
- Runtime API requests remain network-only in the MVP.
- Responsive touch targets support mobile use.

## Exchange-rate provider

Use Frankfurter's public API for the USD/THB pair. It requires no API key, supports THB and USD, and has no monthly quota, but publishes daily reference rates and applies abuse-prevention rate limiting. The Go API caches the latest rate and exposes only the app's `/api/exchange-rate` endpoint to the browser. Provider attribution and rate date are shown near the summary.

## Testing and verification

Frontend tests cover locale-based currency default, form validation, conditional Others input, create/edit/clear state transitions, and delete confirmation behavior. API tests cover token/user ownership boundaries, validation, endpoint responses, and GraphQL request mapping. Build verification includes frontend production build, Go tests, and a configured integration check path for Supabase credentials.

## Out of scope

- Social login.
- Offline transaction queue or conflict resolution.
- Attachments, images, or card grading.
- Shared collections or admin accounts.
