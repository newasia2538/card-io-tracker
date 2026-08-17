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

## Local Run

1. Copy `.env.example` to `.env` for the frontend and export the backend variables before starting Go.
2. Install frontend dependencies with `npm install`.
3. Start the API with `go run ./api/cmd/server`.
4. Start the frontend with `npm run dev`.

## Supabase Notes

- Enable anonymous sign-ins so the browser can create a session automatically on first load.
- Apply the latest migration in `supabase/migrations/` before exercising the API.
- Ensure `pg_graphql` is enabled before using the generated GraphQL collections.
- Keep the transaction RLS policies in place so every query/mutation stays scoped to `auth.uid()`.
- The Go API forwards the user JWT with the publishable key to Supabase GraphQL; it does not use a service-role key.

## Account Linking

- The initial session is anonymous and already owns the user's rows.
- Upgrading is manual: open the account upgrade flow, add the email address, complete the verification email, then finish setting the password.
- The verified session should keep the same Supabase user ID so the anonymous records stay attached.

## PWA + Network Behavior

- The web app manifest and service worker make the app installable and cache only the same-origin app shell/static assets.
- Requests to `/api/` stay network-required and are never queued for offline replay.
- Exchange rates are fetched server-side from Frankfurter, defaulting to `https://api.frankfurter.dev`.

## Verification

- `npm run build`
- `node scripts/check-pwa.mjs`
