# Card Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build installable React PWA, Go API, Supabase anonymous Auth, Supabase GraphQL/RLS persistence, canonical THB pricing, CRUD transactions, and converted BUY/SELL/P&L summaries.

**Architecture:** React/Vite silently creates a Supabase anonymous session and sends its access token to Go. Go validates the token through Supabase Auth, recalculates canonical THB prices, calls Supabase GraphQL with the user JWT, and fetches/caches USD-to-THB rates from Frankfurter.

**Tech Stack:** React, TypeScript, Vite, Vitest, Testing Library, `@supabase/supabase-js`, `decimal.js`, Go standard library, Supabase PostgreSQL + pg_graphql + RLS, Frankfurter v2 REST API.

## Global Constraints

- Input currencies: `THB` and `USD` only.
- Store original `price`/`currency`; authoritative values: `price_thb`, `exchange_rate_to_thb`, `exchange_rate_date`.
- Go recalculates canonical THB values; client preview never trusted.
- Anonymous Auth users use Postgres `authenticated` role; RLS restricts rows to `auth.uid()`.
- Never expose `service_role` or secret keys to browser.
- GraphQL requests include Supabase API key and user bearer JWT.
- Frankfurter called server-side, cached for daily update window, provider date/attribution shown.
- Network required for data operations; service worker caches app shell only.
- TDD: failing test first, minimal implementation, green verification.
- Monetary values cross API as decimal strings; round to two decimals at storage/display boundaries.

## File Map

- Frontend: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `src/types.ts`, `src/lib/{auth,api,currency}.ts`, `src/components/{TransactionForm,TransactionList,Summary,AccountUpgradeDialog}.tsx`, focused tests, `public/manifest.webmanifest`, `public/sw.js`, `public/icon.svg`.
- Backend: `api/go.mod`, `api/cmd/server/main.go`, `api/internal/{config,auth,graphql,rates,transactions}`.
- Database/docs: `supabase/config.toml`, generated transaction migration, `.env.example`, `.gitignore`, `README.md`, `scripts/check-pwa.mjs`.

---

### Task 1: Scaffold frontend, backend, and test harness

**Files:** Create `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `api/go.mod`, `api/cmd/server/main.go`, `.env.example`, `.gitignore`, `src/test/setup.ts`.

**Produces:** `npm run dev`, `npm run test`, `npm run build`, `go test ./...`, and Vite proxy `/api` to `http://localhost:8080`.

- [ ] **Step 1: Initialize metadata.** Run `node --version`, `npm --version`, `go version`, `npm init -y`, then `cd api && go mod init cardledger/api`. Keep lockfile and installed Go toolchain version.
- [ ] **Step 2: Install pinned dependencies.** Install React, `@supabase/supabase-js`, `decimal.js`; dev dependencies Vite, TypeScript, Vitest, jsdom, Testing Library, and React Vite plugin. Set scripts:
  
```json
{
  "dev": "vite",
  "build": "tsc -b && vite build",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 3: Configure strict TypeScript, React Vite plugin, `/api` proxy, Vitest jsdom, and `src/test/setup.ts` with `@testing-library/jest-dom`.**
- [ ] **Step 4: Add `GET /healthz` returning `200 {"status":"ok"}`; run `go test ./...` and `npm run build`.**
- [ ] **Step 5: Commit:**
  
```bash
git add package.json package-lock.json tsconfig.json vite.config.ts index.html api .env.example .gitignore src/test/setup.ts
git commit -m "build: scaffold card ledger app"
```

---

### Task 2: Add Supabase schema, grants, and RLS

**Files:** Create `supabase/config.toml` through `supabase init`; create migration through `supabase migration new create_transactions`.

**Produces:** `public.transactions` and pg_graphql CRUD entrypoints.

- [ ] **Step 1: Generate migration.** Run `supabase init` and `supabase migration new create_transactions`; edit generated migration file, never invent timestamp.
- [ ] **Step 2: Add schema and policies:**

```sql
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('BUY', 'SELL')),
  card_type text not null,
  custom_card_type text,
  price numeric(14, 2) not null check (price > 0),
  currency text not null check (currency in ('THB', 'USD')),
  price_thb numeric(14, 2) not null check (price_thb > 0),
  exchange_rate_to_thb numeric(18, 8) not null check (exchange_rate_to_thb > 0),
  exchange_rate_date date not null,
  transaction_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((card_type = 'Others' and nullif(trim(custom_card_type), '') is not null)
    or (card_type <> 'Others' and custom_card_type is null))
);

create index transactions_user_date_idx
  on public.transactions (user_id, transaction_date desc, created_at desc);

alter table public.transactions enable row level security;
grant select, insert, update, delete on public.transactions to authenticated;

create policy transactions_select_own on public.transactions
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy transactions_insert_own on public.transactions
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy transactions_update_own on public.transactions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy transactions_delete_own on public.transactions
  for delete to authenticated
  using ((select auth.uid()) = user_id);
```

Do not use `auth.role()` or `SECURITY DEFINER`.
- [ ] **Step 3: Verify.** Run `supabase db reset` when local Supabase is available. Confirm RLS, grants, primary key, and generated `transactionsCollection`, `insertIntoTransactionsCollection`, `updateTransactionsCollection`, `deleteFromTransactionsCollection`. Use GraphiQL/schema introspection only during development.
- [ ] **Step 4: Commit:**
  
```bash
git add supabase
git commit -m "feat(db): add user-owned transaction schema"
```

---

### Task 3: Implement Go validation, canonical THB conversion, and rate cache

**Files:** Create `api/internal/rates/service.go`, `api/internal/rates/frankfurter.go`, `api/internal/transactions/model.go`, `api/internal/transactions/validation.go`, and matching tests.

**Interfaces:**

```go
type Rate struct {
    Base, Quote, Value string
    ProviderDate, FetchedAt time.Time
    Stale bool
}
type RateProvider interface {
    USDToTHB(context.Context) (Rate, error)
}
type TransactionInput struct {
    Action, CardType, Price, Currency, TransactionDate string
    CustomCardType *string `json:"custom_card_type"`
}
```

- [ ] **Step 1: Write failing tests.** Cover invalid/zero/negative prices, invalid dates, unsupported currencies/actions, `Others` custom type, THB rate `1`, USD conversion, provider JSON parsing, fresh-cache reuse, stale fallback, and no-cache failure. Use `httptest.Server`; assert exact `"3550.00"` for `100.00 USD * 35.50`. Run `cd api && go test ./internal/transactions ./internal/rates -v`; expected failure is missing functions.
- [ ] **Step 2: Implement decimal-safe domain.** Use standard-library `math/big.Rat`. Validate fields, calculate `price_thb`, round canonical value to two decimals, use rate `1` for THB, retain provider rate for USD. Client cannot submit canonical fields.
- [ ] **Step 3: Implement Frankfurter/cache.** Fetch `GET https://api.frankfurter.dev/v2/rate/USD/THB` or `FRANKFURTER_BASE_URL + /v2/rate/USD/THB`; parse `date`, `base`, `quote`, `rate`; cache 24 hours; return `Stale=true` on failed refresh with prior success; error if no prior success.
- [ ] **Step 4: Run and commit:**
  
```bash
cd api && go test ./internal/rates ./internal/transactions -v
git add api/internal/rates api/internal/transactions
git commit -m "feat(api): add money validation and rate cache"
```

---

### Task 4: Implement Go Auth, GraphQL client, transaction service, and HTTP API

**Files:** Create `api/internal/config/config.go`, `api/internal/auth/supabase.go`, `api/internal/graphql/client.go`, `api/internal/graphql/queries.go`, `api/internal/transactions/service.go`, `api/internal/transactions/handler.go`; modify `api/cmd/server/main.go`; add tests.

**Interfaces:**

```go
type Authenticator interface {
    Authenticate(context.Context, string) (User, error)
}
type User struct {
    ID string
    IsAnonymous bool
}
type TransactionStore interface {
    List(context.Context, string, string) ([]Transaction, error)
    Create(context.Context, string, StoredTransaction) (Transaction, error)
    Update(context.Context, string, string, StoredTransaction) (Transaction, error)
    Delete(context.Context, string, string) error
}
```

Routes: `GET /api/transactions?action=BUY|SELL`, `POST /api/transactions`, `PATCH /api/transactions/:id`, `DELETE /api/transactions/:id`, `GET /api/exchange-rate?from=USD&to=THB`, `GET /healthz`.

- [ ] **Step 1: Write failing Auth tests.** Fake Supabase Auth with `httptest.Server`; assert `GET /auth/v1/user` receives `apikey` and bearer token, returns user ID, and maps invalid token to `401`.
- [ ] **Step 2: Implement config/Auth.** Load `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `FRANKFURTER_BASE_URL`, `PORT`; call Supabase Auth `/auth/v1/user`; never use service-role key.
- [ ] **Step 3: Write failing GraphQL tests.** Assert `apiKey`, user `Authorization`, descending `transaction_date`/ `created_at`, create user ID/canonical fields, `atMost: 1`, ID filters, and typed GraphQL error handling.
- [ ] **Step 4: Implement GraphQL client.** Use documented collection operations above; verify exact generated field/input names against migration GraphiQL before freezing query strings. Pass user JWT on every request so RLS applies.
- [ ] **Step 5: Write failing handler/service tests.** Cover server-side THB calculation, `503` for USD with no rate, bearer auth, update recalculation, delete by ID, rate date/stale response, stable errors, and per-user isolation.
- [ ] **Step 6: Implement handlers/server.** Validate original input, fetch rate for USD input or USD summary, compute canonical fields, return `400` validation, `401` auth, `404` missing row, `409` GraphQL conflict, `502` provider failure, `500` unexpected. Use `http.ServeMux`, timeouts, JSON content type, graceful shutdown.
- [ ] **Step 7: Verify and commit:**
  
```bash
cd api && go test ./... -v
git add api
git commit -m "feat(api): add authenticated transaction endpoints"
```

---

### Task 5: Implement frontend Auth, API client, currency math, and summary model

**Files:** Create `src/types.ts`, `src/lib/auth.ts`, `src/lib/api.ts`, `src/lib/currency.ts`, and matching tests.

- [ ] **Step 1: Write failing currency/summary tests.** Assert `getDefaultCurrency("th-TH") === "THB"`, `getDefaultCurrency("en-US") === "USD"`, `toThb("100.00", "USD", "35.50") === "3550.00"`, THB totals sum `priceThb`, USD totals divide by current rate, and positive/negative/zero P/L statuses.
- [ ] **Step 2: Implement decimal utilities.** Use `decimal.js` for conversion, aggregation, formatting, symbols, and locale default. Summary: `totalBuyTHB`, `totalSellTHB`, `profitLossTHB = totalSellTHB - totalBuyTHB`; convert aggregates to USD by division.
- [ ] **Step 3: Write failing Auth/API tests.** Test existing session reuse, `signInAnonymously` only when missing, bearer token, draft serialization, record/rate parsing, and structured errors.
- [ ] **Step 4: Implement client layer.** Create Supabase client from `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; implement `listTransactions`, `createTransaction`, `updateTransaction`, `deleteTransaction`, `getExchangeRate` against `/api`.
- [ ] **Step 5: Run and commit:**
  
```bash
npm test -- src/lib
git add src/types.ts src/lib package.json package-lock.json
git commit -m "feat(web): add auth api and currency model"
```

---

### Task 6: Build form, summary, list, CRUD, and account upgrade UI

**Files:** Create `src/components/TransactionForm.tsx`, `src/components/Summary.tsx`, `src/components/TransactionList.tsx`, `src/components/AccountUpgradeDialog.tsx`; modify `src/App.tsx`, `src/main.tsx`, `src/styles.css`; add component/App tests.

- [ ] **Step 1: Write failing form tests.** Test Buy/Sell defaults, labels, Card Type options `Sport card`, `Pokemon card`, `One Piece Card`, `JH Card`, and `Others`, conditional Others input, THB/USD options, local `YYYY-MM-DD` default, USD rate preview lines, validation, Save/Clear, and edit-mode `UPDATE`.
- [ ] **Step 2: Implement form.** Fetch `/api/exchange-rate?from=USD&to=THB` when USD selected and filled price changes. Show `1 USD = ฿X.XX THB`, `≈ ฿Y.YY THB`, provider date, stale label. Submit original input only; Go calculates canonical THB.
- [ ] **Step 3: Write failing summary/list tests.** Test BUY/SELL/P&L above list, THB/USD switch, green positive P/L, red negative P/L/minus sign, neutral zero, rate date/attribution, tab counts/filtering, latest-first order, and empty states.
- [ ] **Step 4: Implement Summary/List.** Use semantic buttons; format after decimal calculation; rows show original amount/currency, edit, delete.
- [ ] **Step 5: Write failing CRUD tests.** Test save refresh/reset, edit fills same form, update refreshes, delete confirmation, canceled delete no request, successful delete removes row.
- [ ] **Step 6: Implement App state.** Load after Auth; keep tab/display currency; refresh after mutations; clear after success; keep active tab; announce errors/statuses with `aria-live`.
- [ ] **Step 7: Implement account upgrade.** Show only for anonymous users; call `updateUser({ email })`, show verification pending, refresh after verification, then allow `updateUser({ password })`; preserve same user ID/rows; show existing-email conflict.
- [ ] **Step 8: Add responsive/accessibility styles and commit.** Mobile-first, desktop two-column, focus states, touch targets, disabled/loading, and P/L color plus text semantics. Run tests, then:
  
```bash
git add src/App.tsx src/main.tsx src/styles.css src/components
git commit -m "feat(web): add transaction ledger interface"
```

---

### Task 7: Add PWA shell, environment docs, and build check

**Files:** Create `public/manifest.webmanifest`, `public/sw.js`, `public/icon.svg`, `scripts/check-pwa.mjs`; modify `src/main.tsx`, `index.html`, `.env.example`, `README.md`.

- [ ] **Step 1: Write failing PWA check.** Assert `dist/manifest.webmanifest` exists, `display: standalone`, THB/USD branding, and `dist/sw.js`; run before assets exist to confirm intended failure.
- [ ] **Step 2: Implement manifest/service worker.** Standalone display, `/` start URL, theme/background, valid SVG icon entries, production-only registration, same-origin static caching, explicit bypass for `/api/` and external URLs.
- [ ] **Step 3: Document configuration.** Document `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `FRANKFURTER_BASE_URL=https://api.frankfurter.dev`, `PORT=8080`; document anonymous sign-ins, manual linking, email verification, migration application, and no service-role key in frontend.
- [ ] **Step 4: Build/check/commit:**
  
```bash
npm run build
node scripts/check-pwa.mjs
git add public src/main.tsx index.html scripts/check-pwa.mjs .env.example README.md
git commit -m "feat(web): add installable pwa shell"
```

---

### Task 8: Full verification and handoff

**Files:** Modify only files required by verification failures; update `README.md` with exact run/setup steps.

- [ ] **Step 1: Run automated checks.**
  
```bash
npm test
npm run build
cd api && go test ./...
```

All tests pass; TypeScript build and Go tests succeed without warnings.
- [ ] **Step 2: Run integration check with credentials.** Start Go API and Vite preview; create anonymous session, THB BUY, USD SELL; verify USD preview/rate date, returned canonical `price_thb`, edit, delete, and second-user isolation. Without credentials, report integration skipped while unit/build checks stay green.
- [ ] **Step 3: Verify keyboard/mobile/PWA behavior.** Test form, tabs, edit/delete, confirmation, upgrade, focus, status announcements, P/L color/text semantics, responsive layout, and production service-worker registration.
- [ ] **Step 4: Review security.** Confirm no service key in browser bundle, bearer auth on routes, user JWT on GraphQL, ownership in every RLS policy, `WITH CHECK` on update, and server authority over `user_id`/`price_thb`.
- [ ] **Step 5: Commit verification fixes.**
  
```bash
git add .
git commit -m "test: verify card ledger workflow"
```


