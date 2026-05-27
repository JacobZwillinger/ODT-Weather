# Code Review Context

## Project Overview
Oregon Desert Trail (ODT) Weather — a lightweight web app providing weather forecasts and interactive map navigation for the 750-mile Oregon Desert Trail. Deployed on Vercel with a Node.js/Express backend locally.

## Tech Stack
- **Frontend:** Vanilla JS (ES modules), HTML, CSS. No framework (no React/Vue/etc.)
- **Backend:** Node.js + Express (local), Vercel Serverless Functions (production)
- **Map:** MapLibre GL JS + PMTiles vector tiles + Protomaps fonts
- **Weather API:** PirateWeather API (proxied through `/api/forecast`)
- **Build/Data:** Python (`build-water-sources.py`) for data pipeline, various Node.js scripts in `/scripts/`
- **Testing:** Vitest (unit, happy-dom environment), Playwright (E2E, Chromium)
- **Deployment:** Vercel (`vercel.json` for rewrites/headers)

## Directory Structure
```
├── server.js                    # Express server (local dev)
├── api/
│   ├── forecast.js              # Vercel serverless: weather forecast proxy
│   └── usage.js                 # Vercel serverless: API usage check
├── public/
│   ├── index.html               # Main SPA entry
│   ├── css/styles.css           # All styles
│   ├── js/
│   │   ├── app.js               # App entry point, init logic
│   │   ├── config.js            # Section points, weather icons, constants
│   │   ├── utils.js             # Shared state, waypoint/mile calculations
│   │   ├── map.js               # MapLibre map initialization + interactions
│   │   ├── weather.js           # Weather table rendering + API calls
│   │   ├── elevation.js         # Canvas-based elevation chart
│   │   ├── gps.js               # GPS tracking module (geolocation API)
│   │   └── modals.js            # Modal dialogs (waypoint detail, water/town lists)
│   ├── waypoints.json           # 852 waypoints (authoritative mile markers)
│   ├── water-sources.json       # 325 water sources
│   ├── towns.json               # 17 towns/resupply
│   ├── elevation-profile.json   # Elevation data for chart
│   └── *.pmtiles                # Vector tile files (basemap, overlay, route, contours)
├── tests/
│   ├── unit/
│   │   ├── utils.test.js        # Unit tests for utils.js
│   │   └── config.test.js       # Unit tests for config.js
│   └── e2e/
│       └── app.spec.js          # Playwright E2E tests
├── scripts/                     # Data processing & tile building scripts
├── build/                       # Build artifacts (GeoJSON, PMTiles, etc.)
├── data/                        # Source data (GPX, GeoJSON, DEM)
├── vitest.config.js
├── playwright.config.js
├── package.json
├── vercel.json
├── .env.example
├── CLAUDE.md                    # AI coding instructions
└── README.md
```

## Key Architectural Decisions
1. **Waypoints are authoritative** for mile markers — NOT elevation-profile.json
2. **Elevation profile** is ONLY for chart rendering and elevation lookups
3. **GPS coordinates** from GPX files — never interpolated from mileage
4. **No bundler** — vanilla ES modules served directly
5. **PMTiles** for offline-capable vector tiles

## Entry Points
- **Local dev:** `node server.js` → Express serves `/public` + `/api/forecast`
- **Production:** Vercel serves `/public` as static, `/api/*` as serverless functions
- **Frontend:** `public/js/app.js` (ES module entry)

## Test Framework
- **Unit:** `vitest run` — tests in `tests/unit/`, happy-dom environment
- **E2E:** `playwright test` — tests in `tests/e2e/`, Chromium, starts server
- **Coverage:** `vitest run --coverage` (v8 provider)

## Environment
- `.env` with `PIRATEWEATHER_API_KEY` and optional `PORT`
- No TypeScript, no React, no build step for frontend code
- External CDN deps: maplibre-gl@4.1.2, pmtiles@3.0.6

## Known Constraints
- No TypeScript — all vanilla JS
- No component framework — direct DOM manipulation
- Shared mutable state in `utils.js` (`state` object)
- Map interactions are complex with multiple click handlers and race condition guards
- GPS module uses browser Geolocation API
- Modal system reuses a single waypoint modal for both waypoints and water sources
