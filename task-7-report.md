# Task 7 Report

## Files

- `.env.example`
  - Documents the frontend publishable Supabase variables and the backend environment needed for the Go API and Frankfurter exchange-rate service.
- `index.html`
  - Adds PWA-oriented metadata, manifest linkage, icon reference, and install-friendly app shell settings.
- `src/main.tsx`
  - Registers the service worker in production after page load and then mounts the React app.
- `README.md`
  - Explains the PWA setup, environment variables, local run steps, Supabase notes, account-linking flow, and verification commands.
- `public/manifest.webmanifest`
  - Defines the standalone installable web app manifest with branding, icon, and theme metadata.
- `public/sw.js`
  - Provides the service worker cache strategy for the same-origin app shell and static assets while excluding `/api/` requests.
- `public/icon.svg`
  - Supplies the install icon asset used by the manifest and document head.
- `scripts/check-pwa.mjs`
  - Verifies the built PWA output includes the manifest link, theme color, icon metadata, manifest icon assets, and refactor-tolerant service worker request guards.

## Docs

- `README.md` is the primary handoff document for the task.
- `.env.example` documents the environment contract needed to run the app locally.
- `task-7-report.md` serves as the final narrow handoff note for Task 7.

## Verification

- `npm run build` passed on the checked-out worktree on Monday, August 17, 2026.
- `node scripts/check-pwa.mjs` passed against the freshly built `dist/index.html`, `dist/manifest.webmanifest`, and `dist/sw.js` on Monday, August 17, 2026.
- The requested PWA shell files are present in the worktree and ready for handoff.
