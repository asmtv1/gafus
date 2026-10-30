# GAFUS Refactor — Admin Vite

The 18 legacy `/main-panel/*` routes are mounted in the shared Web Vite app on
`127.0.0.1:5173`. The Web entrypoint lazy-loads `mountInWeb.tsx` and embeds the
Admin React root in Shadow DOM so the Web UI and Admin CSS remain isolated.
The standalone Admin Vite config remains available for isolated development,
but **do not start both on port 5173 simultaneously**.

## Non-production development

Use only the Refactor project directory `/Users/asmtv1/Desktop/gafus-refactor`
and the approved `vite` branch. After confirming the existing Hono API is
running in **isolated development mode** at `127.0.0.1:3001`, start the Web
frontend with:

```bash
GAFUS_WEB_DEV_API_MODE=local-hono pnpm --filter @gafus/web-vite dev
```

Open `http://127.0.0.1:5173/main-panel`. Deep links under `/main-panel/*`
resolve to the same Admin root. The API proxy preserves browser Origin and
HttpOnly cookies. In the **default `mock` mode**, Web Vite does **not** connect
the Admin to Hono; use explicit `local-hono` for real read/authorized testing.
Never disable CSRF/Origin/cookies or point the proxy to production.

## Checks

```bash
pnpm --filter @gafus/admin-panel typecheck
pnpm --filter @gafus/admin-panel test:vite
pnpm --filter @gafus/admin-panel build:vite
pnpm --filter @gafus/web-vite typecheck
pnpm --filter @gafus/web-vite build
pnpm --filter @gafus/admin-panel test:browser:admin-shell
# After the Web build, verify the production preview's static Admin route:
pnpm --filter @gafus/admin-panel test:browser:admin-preview
```

The final browser test starts **its own** short-lived Web Vite + locally
installed Chromium only if port 5173 is free, checks the existing Hono health
endpoint, intercepts admin GETs with in-memory **synthetic fixtures** and
blocks all provider/foreign-origin/mutation requests. It terminates only its
own processes. Successful fixture/browser navigation is **not** proof of
real authenticated ADMIN, PostgreSQL mutation, provider, payment, NPD, mail,
notification or CDN flows. Those require separately approved isolated test
actors and fixtures, with their own exact cleanup.

The detailed section status, caveats and test receipts are in
`docs/refactor/ADMIN_PARITY_LATEST_20261025.md`.
