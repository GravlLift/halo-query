<div align="center">
	<h1>Halo Query</h1>
	<p><strong>Explore Halo Infinite player data, matches, leaderboards, and telemetry with a fast Next.js 15 app.</strong></p>
	<p>
		Built with Next.js App Router, TypeScript, Chakra UI, Application Insights, OpenTelemetry, and the <code>halo-infinite-api</code> & internal helper libraries.
	</p>
</div>

## Overview

Halo Query is a standalone Next.js application that provides an interactive UI for:

- Looking up player profiles and match history.
- Viewing detailed match pages (per‑match breakdowns, participants, outcomes).
- Browsing ranked leaderboards using cached + live data.
- Performing OAuth2 flows for authenticated calls to Halo / Xbox Live.
- Proxying specific Halo Waypoint & Xbox Live profile endpoints (with required headers) safely from the server side.
- Surfacing news / FAQ content and experimental features.
- Collecting performance & usage telemetry via Azure Monitor / Application Insights instrumentation.

This repository contains everything needed to run the web app on its own. It depends on the public `halo-infinite-api` package and companion GravlLift helper libraries.

## Key Features

- **Player Search & Profile**: Navigate to `/players/[gamertag]` to view profile details and gamerpic.
- **Match Browser**: `/matches` lists recent matches; drill into `/matches/[matchId]` for full match analysis.
- **Leaderboard**: `/leaderboard` shows ranked entries using helper cache + queue mechanisms.
- **OAuth2 Flow**: `/oauth2/callback` and `/oauth2/logout` implement access token acquisition and session clearing.
- **Proxy Endpoints**: Under `/proxy/` a structured set of routes wraps external Halo/XBL services (e.g. Waypoint profile, Xbox Live batch settings, XSTS authorization) with proper request shaping.
- **Telemetry & Monitoring**: `instrumentation.ts` conditionally registers server-side Application Insights + OpenTelemetry exporters when running in the Node.js runtime.
- **Custom Middleware**: `middleware.ts` injects a required User-Agent header for the Spartan token endpoint.
- **Theme & UI**: Chakra UI + Framer Motion + Lucide icons, dark/light theme via `next-themes`.
- **Client Data Caching**: IndexedDB (`dexie`) + Redis/Upstash + Vercel KV for hybrid caching strategies.
- **Query Builder (Experimental)**: Uses `@react-awesome-query-builder` to enable advanced filters (future expansion).

## Tech Stack

| Layer         | Tools                                                                                  |
| ------------- | -------------------------------------------------------------------------------------- |
| Framework     | Next.js 15 (App Router), React 18                                                      |
| Styling/UI    | Chakra UI, Emotion, Framer Motion, CSS Modules                                         |
| Data / API    | `halo-infinite-api`, GravlLift helper libraries, `@upstash/redis`, `@vercel/kv`        |
| Observability | Azure Monitor OpenTelemetry, Application Insights Web & React SDK                      |
| Auth          | MSAL (browser) + custom OAuth2 token acquisition via Halo endpoints + XSTS proxy flows |
| Charts        | Chart.js + react-chartjs-2 + zoom/annotation plugins                                   |
| Utilities     | Lodash, Luxon, Immutable.js, Dexie                                                     |

## Project structure

```
app/                      # App Router pages/routes (players, matches, leaderboard, oauth2, proxy, etc.)
components/               # Reusable UI components (loading, menus, modals, icons, etc.)
lib/                      # Client/server utilities (auth contexts, caching, application insights setup)
public/                   # Static assets (icons, images)
instrumentation.ts        # OpenTelemetry / Application Insights registration
middleware.ts             # Header adjustments for specific proxy endpoints
next.config.js            # Next.js configuration
package.json              # Scripts and dependencies
```

## Getting Started

### Prerequisites

- Node.js 18+ (align with Next.js 15 requirements) & npm 9+.
- (Optional) Azure Application Insights resource for telemetry.
- (Optional) Upstash / Vercel KV keys if you enable those cache paths.

### Install

From this repository’s root:

```bash
npm install
```

### Development

Run the dev server:

```bash
npm run dev
```

Then open: http://localhost:3000

### Build & Start

```bash
npm run build
npm run start
```

## Environment Variables

Use the provided `.env.template` in this repo as the source of truth. Copy it to `.env` (for local dev) or configure the same keys in your hosting provider.

Required/optional variables:

| Variable                                            | Required                                                                             | Purpose                                                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_CLIENT_ID`                             | Yes                                                                                  | MSAL Public Client ID used for the Live login OIDC flow in the browser.                                                 |
| `NEXT_PUBLIC_APPLICATIONINSIGHTS_CONNECTION_STRING` | Yes                                                                                  | Application Insights connection string used by both server and client telemetry.                                        |
| `UPSTASH_REDIS_REST_URL`                            |
| Yes                                                 | Upstash Redis REST URL used for server-side caching (gamertags, user lookups, etc.). |
| `UPSTASH_REDIS_REST_TOKEN`                          | Yes                                                                                  | Upstash Redis REST token paired with the URL above.                                                                     |
| `AZURE_STORAGE_CONNECTION_STRING`                   | Optional                                                                             | Azure Blob Storage connection used by the XSTS blacklist route to fetch `blacklist.json` (feature is skipped if unset). |
| `AZURE_STORAGE_CONTAINER_NAME`                      | Optional                                                                             | Blob container name that holds `blacklist.json`.                                                                        |

Notes

- Vercel KV compatibility: the code also accepts `KV_REST_API_URL` and `KV_REST_API_TOKEN` as fallbacks for the Upstash variables. If you deploy on Vercel with KV, you can set either the Upstash names or the KV names.

## Contributing

1. Fork / clone the repo.
2. Create a feature branch.
3. Run lint & tests locally.
4. Update this README if adding new env vars or routes.
5. Open a PR describing changes + screenshots for UI updates.

## License

MIT © GravlLift
