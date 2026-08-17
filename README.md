# Card Ledger

Card Ledger is a React + Vite PWA with a Go API for tracking card buy/sell activity. The app silently creates a Supabase anonymous session on first use, stores records behind PostgreSQL RLS, and keeps THB as the canonical saved amount while still preserving original THB/USD input history.

## Environment

Frontend variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Backend variables:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `FRANKFURTER_BASE_URL=https://api.frankfurter.dev`
- `PORT=8080`

Use the Supabase publishable key on both sides. Do not expose or bundle a Supabase service-role key in the frontend.

## Local Setup

1. Install frontend dependencies:
   `npm install`
2. Create the frontend env file:
   `cp .env.example .env`
3. Set the frontend values in `.env`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
4. Export the backend variables before starting Go:
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `FRANKFURTER_BASE_URL=https://api.frankfurter.dev`
   - `PORT=8080`

Example backend export block:

```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_PUBLISHABLE_KEY="your-publishable-key"
export FRANKFURTER_BASE_URL="https://api.frankfurter.dev"
export PORT="8080"
```

## Supabase Setup

1. Enable anonymous sign-ins in the Supabase Auth settings so the browser can create a session on first load.
2. Ensure the `pg_graphql` extension is enabled for the project before using the generated GraphQL collections.
3. Apply the latest migration from `supabase/migrations/`.
   - If you use the Supabase CLI, run `supabase db push`.
   - If you use the hosted dashboard only, apply `supabase/migrations/20260816210517_create_transactions.sql` in the SQL editor.
4. Keep the transaction RLS policies in place so every query and mutation stays scoped to `auth.uid()`.
5. Keep using the publishable key on both the frontend and the Go API. The Go API forwards the user JWT with that publishable key to Supabase GraphQL and does not use a service-role key.

## Local Run

1. Start the API from the repository root:
   `go run ./api/cmd/server`
2. Start the frontend dev server in another terminal:
   `npm run dev`
3. Open the Vite URL shown in the terminal and wait for the app to create an anonymous Supabase session automatically.

## Supabase Notes

- The API endpoints expect the browser bearer token on every `/api/` request.
- Exchange rates are fetched server-side from Frankfurter, defaulting to `https://api.frankfurter.dev`.

## Account Linking

1. Start with the anonymous session created on first load. That session already owns the user's rows.
2. Open the `Upgrade account` flow.
3. Enter the email address and submit the verification request.
4. Complete the verification email in the same Supabase account flow.
5. Return to the app, choose `I've verified my email`, then set the password.
6. Confirm the verified session keeps the same Supabase user ID so the existing anonymous rows remain attached.

## PWA + Network Behavior

- The web app manifest and service worker make the app installable and cache only the same-origin app shell/static assets.
- Requests to `/api/` stay network-required and are never queued for offline replay.
- Exchange rates are fetched server-side from Frankfurter, defaulting to `https://api.frankfurter.dev`.

## Verification

- `npm test`
- `npm run build`
- `node scripts/check-pwa.mjs`
- `cd api && GOCACHE=/private/tmp/card-ledger-go-cache go test ./...`
