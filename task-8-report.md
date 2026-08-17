# Task 8 Report

## Summary

- Task 8 verification completed on Monday, August 17, 2026 in the isolated `card-ledger` worktree.
- Final review blockers were resolved in product code, local Supabase config, and handoff docs.
- All requested automated checks passed after the stale exchange-rate regressions, local auth-linking config, and startup docs were updated.
- Live Supabase integration verification was skipped because the required frontend and backend env values were not present in the worktree or process environment.
- No standalone reviewer-note files such as `final-review.md`, `task-3-review-fix.md`, or `task-7-review-final.md` were present in this worktree during the final blocker pass.

## Automated Verification

Commands run from the worktree:

```bash
npm test
npm run build
node scripts/check-pwa.mjs
cd api && GOCACHE=/private/tmp/card-ledger-go-cache go test ./...
```

Results:

- `npm test` passed with `9` test files and `44` tests passing.
- `npm run build` passed and produced the production bundle in `dist/`.
- `node scripts/check-pwa.mjs` passed against the built `dist/index.html`, `dist/manifest.webmanifest`, and `dist/sw.js`.
- `cd api && GOCACHE=/private/tmp/card-ledger-go-cache go test ./...` passed for:
  - `cardledger/api/cmd/server`
  - `cardledger/api/internal/auth`
  - `cardledger/api/internal/config`
  - `cardledger/api/internal/graphql`
  - `cardledger/api/internal/rates`
  - `cardledger/api/internal/transactions`

## Credentials And Integration

Environment inspection was performed without printing values. These required variables were all missing from the shell environment:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `FRANKFURTER_BASE_URL`
- `PORT`

File presence check:

- Frontend `.env`: missing
- `api/.env`: missing

Because the required Supabase project URL and publishable credentials were absent, the live integration pass was skipped. That means the following were not exercised against a real project during Task 8:

- anonymous session creation against Supabase
- THB BUY and USD SELL round-trip through the running UI and API
- live edit/delete behavior against persisted rows
- real second-user isolation across two Supabase identities
- live account-upgrade verification email flow

## Keyboard, Mobile, And PWA Notes

Verified through automated tests and code inspection:

- Keyboard-triggered form and list actions are standard semantic buttons, radios, selects, and inputs in `src/App.tsx` and the component tree.
- Status and error announcements use `role="status"`, `aria-live="polite"`, and `role="alert"` in [`src/App.tsx`](/Users/11356979/vibe-code-projects/jo-car-d-web-app/.worktrees/card-ledger/src/App.tsx:184).
- Focus-visible styling is defined for buttons, inputs, and selects in [`src/styles.css`](/Users/11356979/vibe-code-projects/jo-car-d-web-app/.worktrees/card-ledger/src/styles.css:33).
- Mobile-first layout is the default, with the two-column desktop layout gated behind `@media (min-width: 900px)` in [`src/styles.css`](/Users/11356979/vibe-code-projects/jo-car-d-web-app/.worktrees/card-ledger/src/styles.css:335).
- PWA registration is production-only in [`src/main.tsx`](/Users/11356979/vibe-code-projects/jo-car-d-web-app/.worktrees/card-ledger/src/main.tsx:6).

Limitations:

- No manual browser session was run because the missing Supabase credentials blocked a meaningful end-to-end pass.
- No real mobile device or browser responsive emulation session was exercised during Task 8.
- No manual keyboard-only navigation pass was performed beyond the existing component and app tests.

## Security Evidence

No service-role key exposure:

- Frontend code reads only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in [`src/lib/auth.ts`](/Users/11356979/vibe-code-projects/jo-car-d-web-app/.worktrees/card-ledger/src/lib/auth.ts:40).
- Backend config reads only `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in [`api/internal/config/config.go`](/Users/11356979/vibe-code-projects/jo-car-d-web-app/.worktrees/card-ledger/api/internal/config/config.go:17).
- Repository search found no service-role credential values in `src/` or `dist/`. The string `service_role` only appeared in Supabase comments/docs and bundled dependency internals, not as an application credential.

Bearer and JWT propagation:

- Browser API requests attach `Authorization: Bearer <session access token>` in [`src/lib/api.ts`](/Users/11356979/vibe-code-projects/jo-car-d-web-app/.worktrees/card-ledger/src/lib/api.ts:154).
- API routes reject missing bearer tokens and authenticate through Supabase Auth in [`api/internal/transactions/handler.go`](/Users/11356979/vibe-code-projects/jo-car-d-web-app/.worktrees/card-ledger/api/internal/transactions/handler.go:126).
- Supabase Auth verification sends both `apikey` and the user bearer token in [`api/internal/auth/supabase.go`](/Users/11356979/vibe-code-projects/jo-car-d-web-app/.worktrees/card-ledger/api/internal/auth/supabase.go:46).
- Supabase GraphQL requests also send both `apikey` and the same user bearer token in [`api/internal/graphql/client.go`](/Users/11356979/vibe-code-projects/jo-car-d-web-app/.worktrees/card-ledger/api/internal/graphql/client.go:188).

User-owned RLS and `WITH CHECK`:

- The migration enables RLS and grants only `authenticated` access in [`supabase/migrations/20260816210517_create_transactions.sql`](/Users/11356979/vibe-code-projects/jo-car-d-web-app/.worktrees/card-ledger/supabase/migrations/20260816210517_create_transactions.sql:43).
- `SELECT`, `INSERT`, `UPDATE`, and `DELETE` policies all scope ownership to `auth.uid() = user_id`.
- The update policy includes `with check ((select auth.uid()) = user_id)` in [`supabase/migrations/20260816210517_create_transactions.sql`](/Users/11356979/vibe-code-projects/jo-car-d-web-app/.worktrees/card-ledger/supabase/migrations/20260816210517_create_transactions.sql:60).

Server-authoritative `user_id` and `price_thb`:

- The request payload type accepts only original user input fields and does not accept `user_id`, `price_thb`, or exchange-rate fields in [`api/internal/transactions/model.go`](/Users/11356979/vibe-code-projects/jo-car-d-web-app/.worktrees/card-ledger/api/internal/transactions/model.go:5).
- The handler injects the authenticated Supabase user ID into create/update requests in [`api/internal/transactions/handler.go`](/Users/11356979/vibe-code-projects/jo-car-d-web-app/.worktrees/card-ledger/api/internal/transactions/handler.go:51).
- The service recomputes canonical storage fields through `canonicalize` before persisting in [`api/internal/transactions/service.go`](/Users/11356979/vibe-code-projects/jo-car-d-web-app/.worktrees/card-ledger/api/internal/transactions/service.go:93).
- Canonical THB amounts are recalculated from validated input and server-fetched USD/THB rates in [`api/internal/transactions/validation.go`](/Users/11356979/vibe-code-projects/jo-car-d-web-app/.worktrees/card-ledger/api/internal/transactions/validation.go:26).

PWA registration and caching bypass:

- Service worker registration is limited to production in [`src/main.tsx`](/Users/11356979/vibe-code-projects/jo-car-d-web-app/.worktrees/card-ledger/src/main.tsx:6).
- The service worker explicitly bypasses `/api/` requests and non-GET/external requests in [`public/sw.js`](/Users/11356979/vibe-code-projects/jo-car-d-web-app/.worktrees/card-ledger/public/sw.js:45).
- The PWA checker asserts that built `dist/sw.js` bypasses same-origin `/api/` GET requests, bypasses POST requests, and bypasses external-origin requests in [`scripts/check-pwa.mjs`](/Users/11356979/vibe-code-projects/jo-car-d-web-app/.worktrees/card-ledger/scripts/check-pwa.mjs:85).

## Fixes Applied

- Enabled local Supabase manual account linking and aligned the allowed auth return URLs with the Vite dev server in [`supabase/config.toml`](/Users/11356979/vibe-code-projects/jo-car-d-web-app/.worktrees/card-ledger/supabase/config.toml:159).
- Updated [`README.md`](/Users/11356979/vibe-code-projects/jo-car-d-web-app/.worktrees/card-ledger/README.md:21) so the local Supabase setup, Go startup command, and account-upgrade return flow match the working dev environment.
- Cleared cached exchange-rate state before each ledger refresh and preserved a `null` rate when a refresh-rate reload fails in [`src/App.tsx`](/Users/11356979/vibe-code-projects/jo-car-d-web-app/.worktrees/card-ledger/src/App.tsx:72).
- Cleared cached USD preview state before each rate lookup and on lookup failure in [`src/components/TransactionForm.tsx`](/Users/11356979/vibe-code-projects/jo-car-d-web-app/.worktrees/card-ledger/src/components/TransactionForm.tsx:55).
- Added regressions that prove stale USD preview and summary rate data are removed on refresh attempts and remain unavailable after refresh failures in [`src/App.test.tsx`](/Users/11356979/vibe-code-projects/jo-car-d-web-app/.worktrees/card-ledger/src/App.test.tsx:402) and [`src/components/TransactionForm.test.tsx`](/Users/11356979/vibe-code-projects/jo-car-d-web-app/.worktrees/card-ledger/src/components/TransactionForm.test.tsx:81).

## Final State

- Product code, tests, local Supabase auth config, and handoff docs were updated to clear the final review blockers.
- Automated verification is green.
- Live integration remains pending until valid Supabase project credentials are supplied.
