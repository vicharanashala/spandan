# v0.1 — Monorepo Scaffold & Deployment Skeleton

| Field | Value |
|---|---|
| Version | 0.1 |
| Group | 0.1 — Foundation |
| Status | Released |
| Goal | Stand up the two-workspace application — a React single-page frontend, a Node API backend, and a document database — wired so the whole app can be hosted under a configurable sub-path both in local development and behind a production reverse proxy. |

## References & prerequisites
This is the first chunk; it assumes nothing built earlier.

External references the implementing agent should consult: a workspace-capable Node package manager for a two-package repository; a build tool for a React single-page app that supports a configurable public base; a document database and its Node driver; and a reverse-proxy server for production hosting.

## Purpose
Establish the skeleton every later feature builds on: one repository holding a frontend package and a backend package, a database connection, and a single **base-path** setting that decides the URL prefix the entire application lives under. Getting this right up front means deep links, static assets, API calls, and realtime connections all resolve correctly whether the app runs at the domain root in development or under a sub-path in production, with no per-feature URL juggling later.

## Functional requirements
1. **Two-workspace repository** — a single repo contains two installable packages: a frontend single-page application and a backend API service, installable and runnable together from the repository root.
2. **Backend service** — the API package starts an HTTP server, connects to the document database on startup, exposes a health/liveness signal, and refuses to serve if it cannot load its required configuration.
3. **Single base-path setting** — one configuration value names the URL prefix the whole app is served under (empty for local development at the root; a named sub-path such as a product slug in production). The frontend build, the backend's static/SPA serving, the API path prefix, and the realtime path all derive from this one value.
4. **SPA routing under the base path** — the built frontend is served for any route beneath the base path, with unknown deep links falling back to the app's entry document so client-side routing can take over (a hard refresh on a deep link loads the app, not a 404).
5. **Reverse-proxy hosting** — in production a reverse proxy terminates TLS and forwards requests under the base path to the application, including upgrading realtime connections; the application serves the built assets and relays API and realtime traffic to the backend.
6. **Local development proxy** — running locally, the frontend dev server proxies API and realtime requests to the backend so the two packages run side by side on one origin without cross-origin friction.
7. **Auth landing page as the app root** — the application's entry route is the authentication landing page; an unauthenticated visit to the app root lands there.

## Data handled
- **Input:** configuration read at startup — the base path, the database connection location, and the server binding.
- **Output:** the served single-page application and its assets, a health signal, and (via later chunks) the API surface.
- No user or domain data is defined yet; this chunk only stands up the shell.

## Security requirements
- Secrets and connection locations come from configuration, never hard-coded or committed.
- The backend is reached only through the reverse proxy (production) or the dev proxy (local), not exposed as a separate public origin.
- Serving the entry document as a deep-link fallback must not expose the filesystem or serve arbitrary paths outside the built app.

## Performance & scaling requirements
- Built frontend assets are served as static files so the app loads without invoking application logic per asset.
- The base-path indirection must add no per-request rewriting cost beyond a fixed prefix match.
- The skeleton must not preclude running more than one backend instance later; nothing here may assume a single in-process singleton for cross-request state.

## Configuration
- The base path the app is hosted under (empty at the root; a named sub-path in production).
- The database connection location and the server's network binding.
- An optional override for where the frontend reaches the realtime endpoint, for setups where it differs from the app origin plus base path.

## Acceptance criteria
1. Installing from the repository root installs both packages, and one command brings up the frontend and backend together for local development.
2. With an empty base path, the app loads at the local root and its API and realtime calls reach the backend through the dev proxy.
3. With a named base path, the app loads under that sub-path behind the reverse proxy, and a hard refresh on a deep link beneath it loads the app rather than returning a 404.
4. Changing only the base-path setting relocates the whole app's URLs consistently, with no other code changes.
5. Visiting the app root unauthenticated shows the authentication landing page.

## Out of scope (built elsewhere)
- Real authentication, accounts, and sessions — **0.2.1**.
- Roles, authorization, and the admin approval workflow — **0.2.2**.
- Auth pages, protected routing, and the auth state store — **0.2.3**.
- Rooms, dashboards, realtime, and every domain feature — **0.3.x onward**.
