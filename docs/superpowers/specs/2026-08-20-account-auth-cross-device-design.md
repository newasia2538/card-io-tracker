# CardIO Account Authentication and Cross-Device Ledger Design

## Goal

Allow CardIO users to use every ledger feature anonymously, upgrade the current anonymous session to an email/password account without losing existing transactions, and sign in on another device to access the same transactions.

Password reset is explicitly out of scope for this change.

## User flows

### Anonymous use

The application continues creating an anonymous Supabase session when no session exists. Anonymous users retain full access to viewing, creating, editing, and deleting transactions. Existing anonymous UI and API behavior remains available without registration.

The header exposes account actions appropriate to the current session:

- `Create account` for anonymous users.
- `Sign in` for users who want to access an existing registered account.

### Upgrade current anonymous account

The existing upgrade flow remains the registration path:

1. User enters an email address.
2. CardIO calls Supabase `updateUser({ email })` on the current anonymous session.
3. User verifies the email.
4. CardIO refreshes the session and asks for a password.
5. CardIO calls Supabase `updateUser({ password })`.
6. CardIO refreshes the session and marks the user as registered.

Supabase keeps the same user ID during this upgrade. Therefore all transactions created before registration remain owned by the registered account without a database migration or row copy.

If the email already belongs to another account, the upgrade stops and the UI tells the user to sign in. CardIO does not merge anonymous rows into an unrelated account.

### Sign in on another device

The sign-in dialog accepts email and password and calls Supabase `signInWithPassword`. On success:

1. CardIO stores the returned registered session.
2. CardIO sends the new bearer token on subsequent API calls.
3. CardIO reloads transactions and exchange rate.
4. The existing account ledger becomes visible.

If the device currently has anonymous rows, CardIO warns before replacing that anonymous session. No automatic merge is performed. This avoids silently moving records between accounts without an explicit, separately designed merge operation.

### Sign out

Registered users can sign out. CardIO then creates a fresh anonymous session so anonymous use remains available. The registered account data is not deleted and can be loaded again by signing in.

## Architecture

Supabase Auth remains the only identity provider. The Go API and transaction schema do not gain a second authentication system.

The frontend auth abstraction expands to support:

- Reading the current session.
- Creating an anonymous session.
- Sending an upgrade email.
- Setting an account password.
- Signing in with email/password.
- Signing out.

`AuthSession` carries the access token, user ID, anonymous flag, and registered email when available. App session transitions are explicit and reload ledger data after sign-in, upgrade, and sign-out.

The existing API client continues obtaining the current Supabase session before each request. No transaction endpoint contract changes.

## Data ownership and security

The `transactions.user_id` column and existing row-level security policies remain unchanged:

- Select, insert, update, and delete require ownership through `auth.uid() = user_id`.
- The browser uses only the Supabase publishable key.
- No service-role key is exposed to the browser.
- No security-definer merge function or account-transfer endpoint is added.

The same anonymous user ID is preserved during upgrade. A new-device sign-in receives the registered account's user ID, so existing account rows are returned naturally by the current RLS and API flow.

## UI behavior

Add a compact account action area consistent with the current header controls:

- Anonymous: `Create account`, `Sign in`.
- Registered: account email, `Sign out`.

Keep the existing upgrade dialog. Add a sign-in dialog with email, password, submit, and close controls. Dialogs use existing English/Thai translations and expose accessible labels, status messages, and alerts.

When sign-in would replace an anonymous session that has local rows, show a confirmation warning. If the user cancels, retain the anonymous session and ledger unchanged.

## Error handling

- Invalid credentials: show the Supabase error and retain the current session.
- Existing email during upgrade: show the translated email-conflict message and suggest sign-in.
- Email not verified: retain the verification phase and provide a refresh action.
- Session refresh failure: keep current ledger state and show retryable error feedback.
- Sign-in success: reload transactions before reporting the account as ready.
- Sign-out failure: retain registered session and show the error.

## Testing and acceptance

Frontend unit tests cover:

- Supabase sign-in mapping to a registered `AuthSession`.
- Sign-out and anonymous-session recreation.
- Upgrade preserving the same user ID.
- Sign-in dialog success, invalid credentials, and close behavior.
- App reload after successful sign-in.
- Anonymous CRUD remaining available.
- Registered account state and sign-out controls.

Existing API, Go, build, and PWA checks must continue passing.

Manual acceptance uses two browser profiles or devices:

1. Use CardIO anonymously and create at least one BUY and one SELL row.
2. Upgrade that session with a new email and password.
3. Confirm rows remain visible after upgrade.
4. Open CardIO in a second profile/device and sign in with the registered credentials.
5. Confirm both rows appear.
6. Create another row on device two and confirm it appears after reload on device one.
7. Sign out and confirm anonymous features still work.
8. Try upgrading with an already registered email and confirm the upgrade is blocked without changing session or rows.

## Scope exclusions

- Password reset and recovery.
- Social login.
- Automatic merging of anonymous rows into an already registered account.
- Account deletion.
- Changes to transaction schema, RLS policy, or Go API endpoints.
