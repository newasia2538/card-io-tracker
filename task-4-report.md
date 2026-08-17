# Task 4 Report

Date: 2026-08-17

## Scope completed

- Preserved and finished the existing Supabase auth/config work in `api/internal/auth` and `api/internal/config`.
- Implemented the Supabase GraphQL HTTP client using `transactionsCollection`, `insertIntoTransactionsCollection`, `updateTransactionsCollection`, and `deleteFromTransactionsCollection` with publishable `apikey`, bearer JWT forwarding, descending list order, and typed store errors.
- Added transaction domain/service wiring for server-side canonical THB calculation, GraphQL error mapping, USD/THB rate lookup, and exchange-rate responses with provider date and stale flag.
- Added authenticated HTTP routes for:
  - `GET /api/transactions?action=BUY|SELL`
  - `POST /api/transactions`
  - `PATCH /api/transactions/:id`
  - `DELETE /api/transactions/:id`
  - `GET /api/exchange-rate?from=USD&to=THB`
  - `GET /healthz`
- Added stable JSON error responses, bearer-token auth enforcement, request-body validation with `DisallowUnknownFields`, and HTTP status mapping for validation/auth/not-found/conflict/rate/unexpected cases.
- Updated `api/cmd/server/main.go` to build the real dependency graph, configure server/client timeouts, and perform graceful shutdown on `SIGINT`/`SIGTERM`.

## Tests added/updated

- Auth tests validate Supabase `/auth/v1/user` headers and unauthorized mapping.
- GraphQL client tests validate headers, query/mutation shape, canonical field submission, `atMost: 1`, ID filters, and typed conflict errors.
- GraphQL tests were converted from `httptest.Server` to custom `RoundTripper` fixtures so they run in the sandbox without loopback listeners.
- Service tests cover canonical USD conversion, rate-unavailable behavior, not-found mapping, and exchange-rate stale/provider-date output.
- Handler tests cover bearer auth, list/create/update/delete flows, `503` for USD writes without a usable rate, stable error codes, and exchange-rate responses.
- Server tests cover `/healthz` and configured timeout values.

## Verification

Executed successfully:

```bash
cd api && GOCACHE=/private/tmp/card-ledger-go-cache go test ./... -v
```

Passing packages:

- `cardledger/api/cmd/server`
- `cardledger/api/internal/auth`
- `cardledger/api/internal/config`
- `cardledger/api/internal/graphql`
- `cardledger/api/internal/rates`
- `cardledger/api/internal/transactions`

## Notes

- `GET /api/exchange-rate` is authenticated like the transaction routes, matching the server’s bearer-token model.
- The existing unrelated file `task-3-review-fix.md` was not modified or staged.
