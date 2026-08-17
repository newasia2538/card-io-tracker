# Task 5 Report

Date: 2026-08-17

## Scope completed

- Serialized the full per-client Supabase auth bootstrap in `src/lib/auth.ts` with a shared in-flight promise that starts before `getSession()`, so overlapping callers share one session check and one `signInAnonymously()` fallback, and the lock clears after either resolve or reject.
- Reconciled displayed USD profit/loss math in `src/lib/currency.ts` by deriving `profitLossUSD` from the already rounded/displayed `totalSellUSD - totalBuyUSD`, which keeps summary totals internally consistent even for non-terminating conversions.
- Hardened JSON API error parsing in `src/lib/api.ts` so malformed or empty `application/json` error bodies always fall back to a stable `ApiError` `status`/`code`/`message` instead of leaking a raw `SyntaxError`.

## Tests added/updated

- Added auth regressions in `src/lib/auth.test.ts` covering concurrent callers sharing a single sign-in, a staggered-overlap bootstrap race resolving through exactly one shared `getSession()`/`signInAnonymously()` path, and retry behavior after a rejected in-flight sign-in clears.
- Added a currency regression in `src/lib/currency.test.ts` covering a non-terminating `THB -> USD` division case where independently rounded displayed totals must still reconcile with displayed USD profit/loss.
- Added API regressions in `src/lib/api.test.ts` covering malformed and empty `application/json` error responses returning fallback `ApiError` values.

## Verification

Executed successfully:

```bash
npm test -- src/lib
npm run build
```

## Notes

- `task-5-review.md` was not present in this worktree or the main repo checkout, so the implementation/report was completed from the three explicit review findings in the task request.
- The existing untracked file `task-3-review-fix.md` was left untouched and will not be included in the commit.
