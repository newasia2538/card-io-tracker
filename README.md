# CardIO

Your card transaction tracker.

CardIO is a responsive React and Vite PWA backed by a small Go API. It records card buy and sell transactions, keeps THB as the canonical saved amount, and preserves the original THB/USD input history.

## Features

- Plain, responsive dashboard with compact controls and a simple transaction table.
- Day and night themes controlled by the switch at the top right.
- English and Thai translations controlled by the language switch.
- All transactions shown by default, sorted newest first, with BUY and SELL filters.
- Add, edit, and delete transaction records.
- THB and USD input with server-side exchange-rate lookup through Frankfurter.
- Anonymous Supabase sessions for first-use access, with optional email/password account upgrade and sign-in.
- Supabase GraphQL access protected by PostgreSQL row-level security.
- Installable PWA with a same-origin app shell cache.

## Tech stack

- React 19, TypeScript, Vite, and Vitest
- Go 1.25.1 API
- Supabase Auth, GraphQL, and PostgreSQL RLS
- Frankfurter exchange-rate API

## Requirements

- Node.js and npm
- Go 1.25.1 or newer compatible with `api/go.mod`
- A Supabase project with anonymous sign-ins and email/password authentication enabled
- The Supabase `pg_graphql` extension enabled

## Project structure

```text
src/                 React application, translations, API client, and tests
api/                 Go HTTP API and API tests
supabase/migrations/ Database schema and RLS policies
public/              PWA manifest, service worker, and icon
scripts/             Build and PWA verification scripts
```

## Setup

Install the frontend dependencies and create the local environment file:

```bash
npm install
cp .env.example .env
```

Set these frontend values in `.env`:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

The Go API reads its own values from the process environment. Export them before starting the API:

```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_PUBLISHABLE_KEY="your-publishable-key"
export FRANKFURTER_BASE_URL="https://api.frankfurter.dev"
export PORT="8080"
```

Use the Supabase publishable key on both sides. Never put a Supabase service-role key in `.env`, the frontend bundle, or source control.

## Supabase setup

1. Enable anonymous sign-ins in Supabase Auth.
2. Enable the email provider and email/password signups. Enable manual identity linking so anonymous users can upgrade without changing their user ID.
3. Configure email confirmations and the email delivery provider for the active environment. Local Supabase development captures messages in Mailpit.
4. Enable `pg_graphql` for the project.
5. Apply the migration in `supabase/migrations/20260816210517_create_transactions.sql`.

   With the Supabase CLI:

   ```bash
   supabase db push
   ```

   With the hosted dashboard, paste the migration into the SQL editor and run it.

6. Keep the transaction RLS policies enabled. They scope reads and writes to `auth.uid()`.
7. For account upgrades, add both local development URLs to Supabase Auth redirect URLs:
   - `http://localhost:5173`
   - `http://127.0.0.1:5173`

## Run locally

Start the API in one terminal. This command loads the backend values from the root `.env` file:

```bash
npm run api
```

Start the frontend in a second terminal from the repository root:

```bash
npm run dev -- --host 127.0.0.1
```

Open the URL printed by Vite. The frontend proxies `/api` requests to `http://localhost:8080`.

## Manual test checklist

After the app loads:

1. Confirm the header says `CardIO` and `Your card transaction tracker`.
2. Confirm the default theme follows local time: DAY from 06:00 through 17:59:59, NIGHT from 18:00 through 05:59:59. Switch between DAY and NIGHT and check that all text and controls remain readable.
3. Switch between EN and ไทย. Check that the page content, tabs, form labels, and status text translate.
4. Confirm the All tab is selected initially and transactions are newest first.
5. Select BUY and SELL to filter the transaction table.
6. Add a transaction, edit it, and delete it.
7. Refresh the page and confirm the saved transaction remains available.
8. Confirm anonymous users can use every ledger feature without registering.
9. Open `Create account` only when you have configured Supabase email authentication. Verify the email, set a password, and confirm existing rows remain.
10. Open `Sign in` in a second browser profile or device and confirm the registered account rows load.
11. Create a row on the second device, reload the first device, and confirm it appears there.
12. Sign out and confirm CardIO returns to anonymous mode without deleting the registered account rows.
13. Try upgrading an anonymous session with an already registered email. Confirm the upgrade stops, suggests sign-in, and leaves anonymous rows unchanged.

## Account upgrade flow

CardIO starts with an anonymous Supabase session. That session owns the initial transaction rows. To preserve those rows while adding a login:

1. Open `Create account`.
2. Submit an email address and complete the verification email.
3. Return to the app and choose `I've verified my email`.
4. Set the account password.

The upgrade should keep the same Supabase user ID, so existing anonymous rows remain attached to the account.

## Sign-in flow

On another device, open `Sign in` and enter the registered email and password. CardIO receives the registered Supabase session, sends its bearer token to the existing API, and reloads rows allowed by the current `auth.uid()` RLS policies.

If the current device has anonymous rows, CardIO warns that those rows remain with the anonymous session. CardIO does not automatically merge rows into an already registered account. Password reset and recovery are not included in this release.

## PWA and network behavior

The manifest and service worker make CardIO installable and cache the same-origin app shell and static assets. API calls remain network-required and are not queued for offline replay. Exchange rates are fetched server-side from Frankfurter.

## Verification

Run the frontend checks from the repository root:

```bash
npm test
npm run build
node scripts/check-pwa.mjs
```

Run the Go API tests:

```bash
cd api
GOCACHE=/private/tmp/cardio-go-cache go test ./...
```

## License

This repository does not currently declare a public license.
