# CardIO Account Authentication and Cross-Device Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users keep full anonymous ledger access, upgrade the current anonymous session to an email/password account without losing rows, and sign in on another device to load that account's rows.

**Architecture:** Keep Supabase Auth as the identity provider and keep the existing Go API, transaction schema, GraphQL store, and RLS policies unchanged. Expand the frontend auth contract with email/password sign-in and sign-out, add a sign-in dialog, and make `App` reload ledger data after auth transitions. Anonymous upgrade continues using the same Supabase user ID.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, `@supabase/supabase-js`, Go API, Supabase Auth, Supabase GraphQL, PostgreSQL RLS.

**Spec:** `docs/superpowers/specs/2026-08-20-account-auth-cross-device-design.md`

## Global Constraints

- Anonymous users retain full viewing, creating, editing, and deleting access.
- Upgrade preserves the same Supabase user ID and therefore preserves existing transaction ownership.
- Existing-email upgrade conflicts stop the upgrade and suggest sign-in; no automatic merge is added.
- Sign-in uses email/password through Supabase `signInWithPassword`.
- Password reset and recovery remain out of scope.
- No transaction schema, RLS policy, Go API endpoint, or GraphQL contract changes.
- Browser code uses only the Supabase publishable key; never expose a service-role key.
- Keep English and Thai translations, accessible labels, status messages, and responsive styling.
- Use Supabase current documentation and changelog before implementation because Auth APIs can change.

## File Map

- Modify `src/types.ts`: add registered email to `AuthSession`.
- Modify `src/lib/auth.ts`: centralize Supabase session shapes, conversion, and expanded auth-client contracts.
- Modify `src/lib/auth.test.ts`: cover email mapping and the expanded session contract.
- Modify `src/components/AccountUpgradeDialog.tsx`: consume shared auth types and session conversion.
- Modify `src/components/AccountUpgradeDialog.test.tsx`: update auth doubles for the shared contract.
- Create `src/components/AccountSignInDialog.tsx`: warning, email/password sign-in form, errors, and close behavior.
- Create `src/components/AccountSignInDialog.test.tsx`: focused sign-in dialog tests.
- Modify `src/App.tsx`: render account actions, coordinate sign-in/sign-out, preserve anonymous access, and reload transactions after session changes.
- Modify `src/App.test.tsx`: cover anonymous, registered, sign-in, sign-out, and reload behavior.
- Modify `src/lib/i18n.ts`: add English and Thai account labels and messages.
- Modify `src/styles.css`: style account controls, account identity, sign-in warning, and responsive dialog content.
- Modify `README.md`: document email/password account setup and two-device acceptance checks.

No migration or Go API file changes are expected.

### Task 1: Expand Auth Session Contracts and Mapping

**Files:**
- Modify: `src/types.ts`
- Modify: `src/lib/auth.ts`
- Test: `src/lib/auth.test.ts`

**Interfaces:**
- Produces `AuthSession.email: string | null`.
- Produces exported `SessionLike`, `AuthResponseLike`, `AccountAuthClient`, `SupabaseAuthClientLike`, and `toAuthSession` from `src/lib/auth.ts`.
- `AccountAuthClient.signInWithPassword(credentials)` accepts `{ email: string; password: string }` and returns `{ data: { session: SessionLike | null }; error: Error | null }`.
- `AccountAuthClient.signOut()` returns `{ error: Error | null }`.
- Existing `ensureAuthSession` continues returning anonymous or registered sessions.

- [ ] **Step 1: Write failing session mapping tests**

Add tests to `src/lib/auth.test.ts` that assert a registered Supabase session maps to:

```ts
expect(toAuthSession({
  access_token: 'registered-token',
  user: {
    id: 'user-123',
    email: 'collector@example.com',
    is_anonymous: false,
  },
})).toEqual({
  accessToken: 'registered-token',
  userId: 'user-123',
  email: 'collector@example.com',
  isAnonymous: false,
})
```

Add an anonymous-session assertion with `email: null`. Keep existing concurrency and retry tests unchanged except for the new `email` property in expected `AuthSession` values.

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
npm test -- src/lib/auth.test.ts
```

Expected: FAIL because `AuthSession` has no `email` field and `toAuthSession` is not yet exported or does not map email.

- [ ] **Step 3: Implement shared auth shapes and mapping**

In `src/types.ts`, change the session type to:

```ts
export interface AuthSession {
  accessToken: string
  userId: string
  email: string | null
  isAnonymous: boolean
}
```

In `src/lib/auth.ts`:

- Export `SessionLike` with `access_token`, `user.id`, `user.email`, and `user.is_anonymous`.
- Export `AuthResponseLike` for `{ data: { session: SessionLike | null }; error: Error | null }`.
- Export `AccountAuthClient` with `getSession`, `updateUser`, `signInWithPassword`, and `signOut`.
- Keep `signInAnonymously` in the Supabase client shape used by `ensureAuthSession`.
- Export `toAuthSession` and map missing user email to `null`.
- Make `ensureAuthSession` use the shared mapper.

Use the existing `getSupabaseClient` publishable-key checks. Do not add auth state to local storage or create another token cache.

- [ ] **Step 4: Run focused tests and verify pass**

Run:

```bash
npm test -- src/lib/auth.test.ts
```

Expected: all auth tests pass.

- [ ] **Step 5: Commit the auth contract**

```bash
git add src/types.ts src/lib/auth.ts src/lib/auth.test.ts
git commit -m "feat(auth): map registered sessions"
```

### Task 2: Refactor Upgrade Dialog and Add Sign-In Dialog

**Files:**
- Modify: `src/components/AccountUpgradeDialog.tsx`
- Modify: `src/components/AccountUpgradeDialog.test.tsx`
- Create: `src/components/AccountSignInDialog.tsx`
- Create: `src/components/AccountSignInDialog.test.tsx`

**Interfaces:**
- `AccountUpgradeDialog` consumes shared `AccountAuthClient` and `toAuthSession`.
- `AccountSignInDialogProps` is:

```ts
interface AccountSignInDialogProps {
  authClient: AccountAuthClient
  hasAnonymousTransactions: boolean
  language?: Language
  onClose?: () => void
  onSignedIn: (session: AuthSession) => void
}
```

- `AccountSignInDialog` calls `authClient.signInWithPassword({ email, password })` only after the warning is accepted when `hasAnonymousTransactions` is true.

- [ ] **Step 1: Update upgrade tests for shared session email**

Add `email: 'collector@example.com'` to registered test sessions and `email: null` to anonymous sessions. Add no sign-in behavior to the upgrade tests; they must continue proving that email verification and password setup keep the current user ID. Because `AccountUpgradeDialog` consumes the shared `AccountAuthClient`, add unused `signInWithPassword` and `signOut` mocks to its component-test auth doubles.

- [ ] **Step 2: Refactor upgrade dialog to shared types**

Remove the duplicate `SessionLike` type and local session conversion from `AccountUpgradeDialog.tsx`. Import `AccountAuthClient`, `SessionLike`, and `toAuthSession` from `src/lib/auth.ts`. Preserve these behaviors:

- Email submission calls `updateUser({ email: trimmedEmail })`.
- Verification refresh stays in the pending phase when the session is still anonymous.
- Password submission calls `updateUser({ password })`.
- Missing final session remains an error.
- Existing-email errors use the translated conflict message.

- [ ] **Step 3: Write failing sign-in dialog tests**

Create `src/components/AccountSignInDialog.test.tsx` with tests for:

1. Registered device with no anonymous rows submits email/password and calls `onSignedIn` with the mapped registered session.
2. Anonymous rows show a warning before the form and do not call `signInWithPassword` until the user clicks the warning confirmation.
3. Invalid credentials render a `role="alert"` and do not call `onSignedIn`.
4. Close invokes `onClose` without calling Supabase.

Core success assertion:

```ts
await user.type(screen.getByLabelText('Email'), 'collector@example.com')
await user.type(screen.getByLabelText('Password'), 'new-password-123')
await user.click(screen.getByRole('button', { name: 'SIGN IN' }))

expect(signInWithPassword).toHaveBeenCalledWith({
  email: 'collector@example.com',
  password: 'new-password-123',
})
expect(onSignedIn).toHaveBeenCalledWith({
  accessToken: 'registered-token',
  userId: 'user-123',
  email: 'collector@example.com',
  isAnonymous: false,
})
```

- [ ] **Step 4: Run the new dialog tests and verify failure**

Run:

```bash
npm test -- src/components/AccountSignInDialog.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 5: Implement the sign-in dialog**

Create a panel with accessible name `Sign in`. Use local phase state `'warning' | 'form'`; initialize to `'warning'` only when `hasAnonymousTransactions` is true. Warning copy must state that current anonymous rows remain anonymous if the session changes. Provide `Continue to sign in` and `Close` actions.

The form must:

- Use `type="email"` and `type="password"` inputs.
- Trim email before calling Supabase.
- Disable controls while submitting.
- Render translated status text after a successful response only if needed before `onSignedIn`.
- Render Supabase errors in `role="alert"`.
- Reject a response without a usable session with the translated sign-in error.

Use `toAuthSession` for the returned session and require `isAnonymous === false` before calling `onSignedIn`.

- [ ] **Step 6: Run focused dialog tests and verify pass**

Run:

```bash
npm test -- src/components/AccountUpgradeDialog.test.tsx src/components/AccountSignInDialog.test.tsx
```

Expected: all upgrade and sign-in dialog tests pass.

- [ ] **Step 7: Commit auth dialogs**

```bash
git add src/components/AccountUpgradeDialog.tsx src/components/AccountUpgradeDialog.test.tsx src/components/AccountSignInDialog.tsx src/components/AccountSignInDialog.test.tsx
git commit -m "feat(auth): add email sign-in dialog"
```

### Task 3: Add Account Actions and Session Transitions to App

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- `App` receives the expanded `AccountAuthClient` through `authClient`.
- App-level `handleSignedIn(session)` clears stale ledger display, loads transactions with the new session, and reports success or retryable failure.
- App-level `handleSignOut()` clears registered rows, signs out, and triggers the existing anonymous bootstrap path.

- [ ] **Step 1: Extend App test doubles and session fixtures**

Add `email: null` to `anonymousSession` and `email: 'collector@example.com'` to `authenticatedSession`. Extend `createAuthClientDouble()` with:

```ts
signInWithPassword: vi.fn().mockResolvedValue({
  data: { session: null },
  error: null,
}),
signOut: vi.fn().mockResolvedValue({ error: null }),
```

Update existing upgrade-specific inline auth clients with the same no-op methods so they satisfy `App`'s prop contract.

- [ ] **Step 2: Write failing App tests for account actions**

Add tests to `src/App.test.tsx` for:

1. Anonymous app shows `Create account` and `Sign in`, while registered app shows email and `Sign out`.
2. Sign-in dialog calls `signInWithPassword`, updates registered account state, and causes a fresh BUY/SELL load.
3. Sign-in error keeps anonymous controls and ledger rows visible.
4. Sign-out calls `signOut`, invokes the anonymous `authLoader` path, and shows anonymous account actions again.
5. Anonymous rows cause the sign-in warning to appear before credential submission.

Use an `authLoader` implementation that returns `authenticatedSession` first and `anonymousSession` after sign-out. Assert list calls happen after the successful auth action, not before it.

- [ ] **Step 3: Run focused App tests and verify failure**

Run:

```bash
npm test -- src/App.test.tsx
```

Expected: FAIL because account action controls, sign-in handling, and sign-out handling do not exist.

- [ ] **Step 4: Implement account action state and rendering**

In `App.tsx`:

- Add `isSignInOpen` and `isSigningOut` state.
- Render anonymous actions in the header: `Create account` toggles the existing upgrade dialog; `Sign in` opens `AccountSignInDialog`.
- Render registered email and `Sign out` for non-anonymous sessions.
- Pass `allTransactions.length > 0` to `AccountSignInDialog.hasAnonymousTransactions`.
- Place the sign-in panel above `TransactionForm`, matching the existing upgrade panel placement.

Keep anonymous CRUD paths unchanged. Do not hide the form, summary, or transaction list based on account state.

- [ ] **Step 5: Implement safe registered-session reload**

Add an App helper that:

1. Clears `buyTransactions`, `sellTransactions`, and `exchangeRate` before changing visible account data.
2. Sets loading status.
3. Stores the new registered session.
4. Calls `refreshAndApplyTransactions`.
5. Closes the sign-in dialog and reports `signedIn` or `accountUpgraded` only after the reload succeeds.
6. On reload failure, keeps the new session, leaves rows cleared rather than showing stale account data, and exposes the existing retry action.

Use the same helper for `handleUpgraded`, after preserving the current anonymous-user-ID equality check. The upgrade path must still reject a changed user ID and keep the anonymous session.

- [ ] **Step 6: Implement sign-out and anonymous bootstrap**

`handleSignOut` must:

1. Disable the sign-out control.
2. Call `authClient.signOut()`.
3. If Supabase returns an error, keep the registered session and show an alert.
4. If successful, clear visible registered rows, set loading status, and increment `bootstrapAttempt` so `ensureAuthSession` creates a fresh anonymous session.
5. Re-enable the control after the bootstrap attempt.

Do not delete transactions or call any new API endpoint.

- [ ] **Step 7: Run App tests and verify pass**

Run:

```bash
npm test -- src/App.test.tsx
```

Expected: all App tests pass, including existing CRUD, upgrade, theme, language, and responsive-related assertions.

- [ ] **Step 8: Commit App auth transitions**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat(auth): load ledger after sign-in"
```

### Task 4: Add Translations, Responsive Styles, and README Guidance

**Files:**
- Modify: `src/lib/i18n.ts`
- Modify: `src/styles.css`
- Modify: `src/styles.test.mjs`
- Modify: `README.md`

**Interfaces:**
- New translation keys are available in both `english` and `thai` objects.
- Sign-in and account controls use translation keys only; no user-visible English strings are hard-coded in components.

- [ ] **Step 1: Add translation keys and failing translation assertions**

Add keys for:

```ts
createAccount: string
signIn: string
signInTitle: string
signInButton: string
signInWarning: string
continueToSignIn: string
signedIn: string
signOut: string
signedOut: string
signInError: string
signOutError: string
accountEmail: string
```

Use English values such as `Create account`, `Sign in`, `SIGN IN`, `Continue to sign in`, and `Sign out`; provide Thai translations alongside them. Add tests or component assertions that switching to Thai changes account action labels and sign-in form labels.

- [ ] **Step 2: Implement translation values**

Add the same key set to both translation objects. Preserve existing `upgradeAccount` wording for the upgrade panel and existing email-verification messages.

- [ ] **Step 3: Add responsive account and dialog styles**

Add styles for account controls and sign-in warning using existing CSS variables:

- Keep account controls compact in the hero side area.
- Allow email text to wrap or truncate without widening the page.
- Keep dialog inputs at `width: 100%`.
- Make action buttons wrap below 560px.
- Keep panels within the mobile viewport with no horizontal page overflow.
- Preserve day/night color variables and readable focus states.

Extend `src/styles.test.mjs` with assertions for account action wrapping and sign-in panel width behavior.

- [ ] **Step 4: Update README setup and acceptance checklist**

Change requirements from anonymous-only setup to:

- Anonymous sign-ins enabled.
- Email provider/signups enabled.
- Email confirmation and local redirect URLs configured according to the active Supabase environment.

Document that upgrading preserves the same Supabase user ID and that sign-in on another device loads rows through existing RLS. Add manual checks for anonymous CRUD, upgrade preservation, second-device sign-in, cross-device row visibility, sign-out returning to anonymous mode, and existing-email upgrade conflict. State that password reset is not included.

- [ ] **Step 5: Run focused frontend tests**

Run:

```bash
npm test -- src/components/AccountSignInDialog.test.tsx src/App.test.tsx src/styles.test.mjs
```

Expected: all focused tests pass.

- [ ] **Step 6: Commit UI and documentation changes**

```bash
git add src/lib/i18n.ts src/styles.css src/styles.test.mjs README.md
git commit -m "docs(ui): document account access"
```

### Task 5: Run Full Verification and Manual Cross-Device Test

**Files:**
- Verify: all modified source, test, and documentation files.
- No new source files unless a test exposes a concrete defect in the planned flow.

- [ ] **Step 1: Verify Supabase version and current Auth guidance**

Before relying on implementation details, check the installed Supabase CLI and current Auth documentation/changelog:

```bash
supabase --version
```

Fetch the current Supabase changelog and the email/password Auth reference. Confirm `signInWithPassword`, anonymous-user upgrade with `updateUser`, email confirmation redirects, and local email testing behavior. If current guidance conflicts with the plan, stop and update the design/plan before code changes.

- [ ] **Step 2: Run all frontend tests**

```bash
npm test
```

Expected: every Vitest file passes, including new auth tests.

- [ ] **Step 3: Build production frontend**

```bash
npm run build
```

Expected: TypeScript and Vite build exit with status 0.

- [ ] **Step 4: Run PWA and formatting checks**

```bash
node scripts/check-pwa.mjs
git diff --check
```

Expected: PWA checks pass and diff check prints no whitespace errors.

- [ ] **Step 5: Run Go API tests unchanged**

```bash
cd api
GOCACHE=/private/tmp/cardio-go-cache go test ./...
```

Expected: all Go packages pass. No API source changes should be required.

- [ ] **Step 6: Run manual two-session acceptance**

Use two browser profiles or devices against the same Supabase project:

1. In profile A, use CardIO anonymously and create one BUY and one SELL row.
2. Upgrade from `Create account`, verify email, and set password.
3. Confirm both rows remain visible and the UI shows registered email plus `Sign out`.
4. In profile B, open CardIO and choose `Sign in`.
5. Enter the same email/password and confirm both rows load.
6. Create a third row in profile B, reload profile A, and confirm the third row appears.
7. Sign out in profile B and confirm anonymous controls and CRUD return.
8. In a fresh anonymous session, attempt upgrade with an already registered email. Confirm conflict feedback, unchanged anonymous session, and unchanged anonymous rows.

- [ ] **Step 7: Review final diff and status**

```bash
git status --short --branch
git log -6 --oneline
git diff origin/main...HEAD --stat
```

Confirm only planned auth, UI, test, and README files changed; no service-role key, migration, or API contract change appears.

- [ ] **Step 8: Commit final verified changes**

```bash
git add src/types.ts src/lib/auth.ts src/lib/auth.test.ts src/components/AccountUpgradeDialog.tsx src/components/AccountUpgradeDialog.test.tsx src/components/AccountSignInDialog.tsx src/components/AccountSignInDialog.test.tsx src/App.tsx src/App.test.tsx src/lib/i18n.ts src/styles.css src/styles.test.mjs README.md
git commit -m "feat(auth): support account sign-in"
```
