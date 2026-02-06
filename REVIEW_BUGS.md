# Bug Review Report

**Reviewer:** Agent 1 — Bug Hunter [BUGS]
**Date:** 2026-02-06
**Files Reviewed:** 12

## Findings

| File | Line(s) | Severity | Description | Fixed? |
|------|---------|----------|-------------|--------|
| `public/js/elevation.js` | 139 | **High** | `canvas.height` used for label Y-position after DPR scaling. On HiDPI displays (dpr=2), `canvas.height` is 2x the visual height, placing the "Distance (miles)" label far off-screen. Should use `displayHeight`. | Yes |
| `public/js/utils.js` | 16-17 | **Medium** | `loadElevationProfile()` does not check `response.ok` before calling `response.json()`. A 404 or 500 response would attempt to parse an error page as JSON, throwing an unhelpful error instead of a clear HTTP status message. | Yes |
| `public/js/weather.js` | 82-88 | **Medium** | `document.getElementById('apiUsage')` result not null-checked before setting `.textContent`. If the element is missing or renamed, this throws a runtime error. Added null guard. | Yes |
| `public/js/map.js` | 611-614 | **Medium** | `document.querySelector('.maplibregl-ctrl-bottom-left')` can return null (e.g., if MapLibre hasn't rendered controls yet). Calling `.appendChild()` on null throws. Added null check. | Yes |
| `public/js/modals.js` | 155-157, 176-178 | **Medium** | XSS vulnerability in `showSourcesList()`: `source.details`, `source.distToNext`, `town.name`, `town.services`, and `town.offTrail` are interpolated directly into `innerHTML` without escaping. If any data source contains HTML/script tags, they would execute. Added `escapeHtml()` helper. | Yes |
| `public/js/gps.js` | 9-10 | **Low** | `locationMarker` and `accuracyCircle` variables declared but never used. `map.js` manages its own `userLocationMarker` and `userAccuracyCircle`. Dead code that obscures intent. | Yes |
| `public/js/map.js` | 119-127 | **Low** | `loadIcon()` never calls `reject()` — if `img.onerror` fires (e.g., invalid SVG), the promise hangs forever, stalling `Promise.all()`. No `onerror` handler on the Image element. | No |
| `public/js/map.js` | 317-331 | **Low** | `showWaterDetail()` return value assigned to `const source` (line 324) but the variable shadows the MapLibre concept of "source". More importantly, if `showWaterDetail` returns `null`, the subsequent `source.mile` check on line 328 is fine due to the `&&` guard, but the function name collision with MapLibre `map.getSource()` on nearby lines could confuse maintainers. | No |
| `public/js/app.js` | 41 | **Low** | `showMapInfo(0)` is called inside the `try` block after data loads, but `showMapInfo` calls `findNearestWaypoint` and `findNextWater` which depend on `state.allWaypoints` and `state.waterSources`. If data loaded empty arrays (valid JSON but no items), `findNearestWaypoint` returns null and `showMapInfo` would proceed to access `nearest.waypoint.name` throwing a TypeError. The current guard (`if (nearest)`) prevents the crash, so this is safe but fragile. | No |
| `public/js/weather.js` | 25-51 | **Low** | `renderWeatherTable` builds the entire table as an HTML string with `point.name` embedded directly. While section points are hardcoded in `config.js` (not user-controlled), this is inconsistent with the XSS-safe patterns used in `modals.js`. | No |
| `server.js` | 17-19 | **Low** | Global `Cache-Control: public, max-age=60` middleware applies to ALL routes including `/api/forecast`. The API route returns dynamic weather data that may be stale after 60s. The Vercel `api/forecast.js` correctly uses 12-hour cache, but the local dev server's global middleware overrides intent for API responses. | No |
| `public/js/gps.js` | 36-59 | **Low** | `handlePositionSuccess` is async but the geolocation API does not await it. If `findMileFromCoords` or `showMapInfo` throws, the error becomes an unhandled promise rejection rather than being caught by the geolocation error handler. | No |

## Summary

- **Critical:** 0
- **High:** 1 (elevation chart label mispositioned on HiDPI screens)
- **Medium:** 4 (missing response check, null reference risks, XSS)
- **Low:** 7 (dead code, missing error handlers, minor hazards)
- **Total Fixed:** 6
- **Total Observations (unfixed):** 6
