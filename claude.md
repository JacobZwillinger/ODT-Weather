# Claude Instructions for ODT Weather Project

## Auto-Push Policy
**CRITICAL**: Always push changes to the remote repository when completing tasks. Don't wait for the user to ask.

After completing work:
1. Run `git add -A`
2. Create a meaningful commit message
3. Push with `git push`

This should happen automatically at the end of each task completion.

## Project Overview
Oregon Desert Trail weather snapshot application with interactive map and weather forecasts.

## Key Technical Details
- **GPS Coordinates**: GPX files are the authoritative source. Never interpolate from mileage.
- **Data Pipeline**: `build-data.py` generates category JSON files from GPX + categorized CSV
- **Map**: Uses PMTiles for vector tiles, MapLibre GL for rendering
- **Layout**: Fullscreen map with compact overlays for info and elevation

## Data Architecture - CRITICAL
**WAYPOINTS are the authoritative source for mile markers, NOT elevation-profile.json.**

The elevation profile was generated from a separate route line GeoJSON and does NOT have accurate mile-to-coordinate mapping. The waypoints.json has 852 points with correct mile markers that match their actual GPS coordinates.

When looking up mile from coordinates:
- Use `state.allWaypoints` to find the nearest waypoint(s)
- Interpolate between adjacent waypoints for positions between them
- NEVER use elevation-profile.json for coordinate → mile lookups

The elevation profile should ONLY be used for:
- Rendering the elevation chart visualization
- Getting elevation data at a given mile marker
- Dense trail geometry for distance-from-trail calculations (perpendicular projection onto track segments)

## Waypoint Categories
Every waypoint belongs to exactly one category, each toggleable on the map:
- **water** (subcategory: reliable/seasonal/unreliable) — `public/water.json`
- **towns** (subcategory: full/limited/none) — `public/towns.json`
- **navigation** (subcategory: junction/gate/road-crossing/other) — `public/navigation.json`
- **toilets** — `public/toilets.json`

Source of truth: `Water Sources Sanitized.csv` with `category` and `subcategory` columns.
`build-data.py` splits the CSV into per-category JSON files.
`waypoints.json` remains the mile-marker backbone (all 852 waypoints for calculations).

## Important Files
- `public/index.html` - Main application
- `build-data.py` - Data processing pipeline (CSV → category JSONs)
- `categorize-csv.py` - One-time script to auto-populate category columns
- `validate-categories.py` - CSV integrity validation
- `public/waypoints.json` - All 852 waypoints for navigation calculations
- `public/water.json` - Water sources (~296)
- `public/towns.json` - Towns/services (~17)
- `public/navigation.json` - Navigation waypoints (~539)
- `public/toilets.json` - Toilets (manually tagged)
- `server.js` - Local Express dev server (serves static files + forecast proxy)
- `api/forecast.js` - Vercel serverless function (returns current + 7-day daily forecasts)
- `api/usage.js` - Vercel serverless function (API usage stats)
- `public/*.pmtiles` - Vector tile files (basemap, overlay, route, contours)

## Local vs Production Differences
Both the local `server.js` and Vercel `api/forecast.js` now return the same response shape:
**current conditions + 7-day daily forecasts + API usage (`_usage`)**.
The weather table works identically in both environments.

## Testing
- **Unit tests:** `npm test` (Vitest, happy-dom)
- **E2E tests:** `npm run test:e2e` (Playwright, Chromium)
- **All tests:** `npm run test:all`
- **Coverage:** `npm run test:coverage`

## Development Guidelines
- Keep design clean and minimal
- Maximize map visibility
- Test on both mobile and desktop
- Always push changes when done
