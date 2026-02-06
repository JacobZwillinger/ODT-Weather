# Test Audit Report

**Auditor:** Agent 2 (Test Auditor)
**Date:** 2026-02-06
**Scope:** All unit tests (`tests/unit/`), E2E tests (`tests/e2e/`), and source files (`public/js/`, `server.js`, `api/`)

---

## 1. Coverage Gap Analysis

### Files with ZERO unit test coverage before this audit

| File | Exported Functions / Key Logic | Priority |
|---|---|---|
| `public/js/weather.js` | `renderWeatherTable`, `loadForecasts`, `getIcon` (internal) | HIGH — contains DOM rendering, fetch error handling, API usage display |
| `public/js/modals.js` | `showWaypointDetail`, `showWaterDetail`, `showSourcesList`, `initModals`, `setupModal`, `findWaypoint` | HIGH — complex lookup logic, XSS sanitization, modal open/close lifecycle |
| `public/js/gps.js` | `startGps`, `stopGps`, `toggleGps`, `isGpsEnabled`, `shouldAllowMapClicks`, `getDistanceMeters`, `handlePositionError` | HIGH — state machine with multiple error paths, browser API dependency |
| `public/js/map.js` | `showMapInfo`, `initMap`, `updateUserLocationMarker`, `createCircleGeoJSON` | MEDIUM — heavily coupled to MapLibre GL (hard to unit test), but `showMapInfo` and `createCircleGeoJSON` are testable |
| `public/js/elevation.js` | `renderElevationChart` | MEDIUM — canvas rendering is hard to test in unit tests but filter/scale logic is testable |
| `public/js/app.js` | `init`, `safeFetch` | LOW — entry point, excluded from vitest coverage config; tested via E2E |
| `api/forecast.js` | Vercel serverless handler | HIGH — parameter validation, upstream error handling, response shaping |
| `api/usage.js` | Vercel serverless handler | MEDIUM — simple proxy, but error handling untested |
| `server.js` | Express routes | LOW — local dev only; similar logic exists in `api/forecast.js` |

### Functions tested but with missing edge cases

| File | Function | Missing Coverage |
|---|---|---|
| `public/js/utils.js` | `loadElevationProfile` | Fetch failure path, caching behavior |
| `public/js/utils.js` | `findMileFromCoords` | Elevation profile integration path (code has two branches: with/without elevation profile loaded) |
| `public/js/utils.js` | `findNextWater` / `findNextTown` | Empty arrays, epsilon boundary values |
| `public/js/utils.js` | `getWaypointName` | Empty details field, case-insensitive "Reliable:" prefix |
| `public/js/utils.js` | `getWaypointShortName` | Empty fields, multiple parentheticals |
| `public/js/utils.js` | `findNearestWaypoint` | Single-waypoint array, equidistant waypoints |

---

## 2. Suspicious Existing Tests

### 2a. Tautological or always-passing tests

| File | Test | Issue |
|---|---|---|
| `tests/unit/config.test.js` | `OFF_TRAIL_THRESHOLD is set to 0.5 miles` (in utils.test.js) | Tests that a constant equals a constant. If someone changes the constant, the test breaks but that may be intentional. This is testing implementation, not behavior. |
| `tests/unit/config.test.js` | `WATER_WARNING_MILES is 20` | Same issue: testing a magic number constant rather than behavior that depends on it. |
| `tests/unit/config.test.js` | `MILE_EPSILON is a small positive number` | Overly loose assertion. The value 0.01 could change to 0.99 and still pass. |
| `tests/unit/config.test.js` | `SCROLL_DELAY_MS is reasonable` / `MAP_INIT_DELAY_MS is reasonable` | Range assertions (50-500) are so loose they are nearly tautological. These test nothing meaningful. |

### 2b. Tests that may be brittle or test implementation details

| File | Test | Issue |
|---|---|---|
| `tests/unit/config.test.js` | `sectionPoints has 25 sections` | Hardcoded count. If a section is added or removed, this test breaks. Consider testing structural invariants instead (e.g., ascending miles, valid coords) which ARE already tested and are more robust. |
| `tests/unit/config.test.js` | `starts at mile 0` / `ends near mile 725` | Tests specific mile values which are data, not logic. Acceptable for data integrity checks but will break on data updates. |
| `tests/e2e/app.spec.js` | `clicking on waypoint icon opens waypoint modal` | This test contains ~100 lines of complex debug/diagnostic code embedded in `page.evaluate()`. The actual assertion is only 1 line at the end. If waypoint icons don't render, the test falls through to clicking the map center and may open a modal anyway (route-line click), making it pass for the wrong reason. |
| `tests/e2e/app.spec.js` | `waypoint click shows consistent mile in modal and info panel` | Contains `if (!result.success) { return; }` which silently skips the test if no waypoints are found. This means the core assertion may never execute, and the test always "passes." |
| `tests/e2e/app.spec.js` | `map tiles load correctly` | Mostly diagnostic logging. Assertions only check canvas exists and pmtiles were requested -- does not validate actual tile rendering. |
| `tests/e2e/app.spec.js` | `zoom level updates when zooming` | Asserts the new zoom matches format `/^z\d+$/` but does NOT assert the zoom actually changed from the initial value. The assertion would pass even if zooming had no effect. |

### 2c. Tests with missing assertions or overly loose checks

| File | Test | Issue |
|---|---|---|
| `tests/unit/utils.test.js` | `findMileFromCoords > interpolates mile when between adjacent waypoints` | The test comment says "Should interpolate to approximately 10.5" but the actual source code does NOT interpolate — it returns the closest waypoint's mile. With the test's specific coordinates (43.005, equidistant between 43.0 and 43.01), the function returns mile 10 (first found), which fails the assertion `> 10.2`. **This test likely fails.** |
| `tests/e2e/app.spec.js` | `displays 25 section rows` | Hardcoded to expect exactly 25 rows. Coupled to data, not logic. |

---

## 3. Summary of New Tests Added

### `tests/unit/utils.test.js` — 15 new test cases added

| Test | What it covers |
|---|---|
| `findMileFromCoords > uses elevation profile for distanceFromTrail when loaded` | Branch where `state.elevationProfile` is non-null — was previously untested |
| `findMileFromCoords > works with only one waypoint` | Single-element array edge case |
| `getWaypointName - edge cases > returns details without "reliable:" prefix` | Details string without the expected prefix |
| `getWaypointName - edge cases > handles case-insensitive "Reliable:" prefix` | Upper-case prefix variant |
| `getWaypointName - edge cases > returns empty string when both fields empty` | All-empty input edge case |
| `getWaypointShortName - edge cases > returns full landmark when no parens or slashes` | No-split-needed path |
| `getWaypointShortName - edge cases > handles landmark with multiple parentheticals` | Multiple `(` characters |
| `getWaypointShortName - edge cases > returns empty string when both fields empty` | All-empty edge case |
| `findNextWater - edge cases > returns null when empty` | Empty water sources array |
| `findNextWater - edge cases > finds source just beyond epsilon boundary` | Epsilon boundary: source at mile + epsilon + delta |
| `findNextWater - edge cases > skips source within epsilon boundary` | Epsilon boundary: source within epsilon range |
| `findNextTown - edge cases > returns null when empty, skips exact mile, negative mile` | Three edge cases for town lookup |
| `getDayHeaders - additional > all 7 headers match format` | Validates every header, not just first |
| `getDayHeaders - additional > headers are 7 consecutive days` | Verifies sequential day/date correctness |
| `loadElevationProfile > cached / fetch error / fetch success` | Three tests covering caching, network failure, and success paths |
| `findNearestWaypoint - edge cases > single waypoint, equidistant` | Boundary behavior with minimal data |

### `tests/unit/weather.test.js` — 9 new test cases (NEW FILE)

| Test | What it covers |
|---|---|
| `renderWeatherTable > renders a table with section rows` | Happy path: table structure with valid data |
| `renderWeatherTable > renders "--" for missing forecast data` | Null forecast entries produce fallback cells |
| `renderWeatherTable > uses cloudy icon as fallback` | Unknown icon name falls back to cloudy SVG |
| `renderWeatherTable > renders "--" for undefined temperatures` | Missing high/low in day object |
| `renderWeatherTable > displays elevation with locale formatting` | Verifies comma formatting and foot mark symbol |
| `loadForecasts > handles fetch errors gracefully` | Network errors produce table with "--" cells |
| `loadForecasts > displays API usage when present` | _usage object rendered to apiUsage element |
| `loadForecasts > does not display usage when calls is null` | Null _usage.calls leaves element empty |
| `loadForecasts > handles non-ok HTTP responses` | 500 responses treated as null forecasts |

### `tests/unit/modals.test.js` — 16 new test cases (NEW FILE)

| Test | What it covers |
|---|---|
| `showWaypointDetail > opens modal with correct data by name` | Name-based lookup, modal visibility, title, detail content |
| `showWaypointDetail > returns null for non-existent name` | Failed lookup returns null |
| `showWaypointDetail > finds waypoint by coordinates (legacy)` | Coordinate-based fallback lookup |
| `showWaypointDetail > shows "No description" for empty landmark` | Empty landmark field displays fallback |
| `showWaypointDetail > returns null when no waypoints loaded` | Empty allWaypoints array |
| `showWaterDetail > opens modal with water source data` | Full happy path with distToNext |
| `showWaterDetail > shows off-trail distance` | Off-trail source displays distance info |
| `showWaterDetail > does not show next water when "-"` | distToNext = "-" suppresses next water line |
| `showWaterDetail > returns null for non-existent name` | Missing source name |
| `showWaterDetail > returns null when name is null` | Null input edge case |
| `showSourcesList > renders water sources with highlighting` | Highlight logic for nearby sources |
| `showSourcesList > renders towns with services and off-trail` | Town list content verification |
| `showSourcesList > shows "Past" label` | Sources behind current mile |
| `showSourcesList > shows "mi ahead" label` | Sources ahead of current mile |
| `initModals > sets up close button handlers` | Click handler wiring for close buttons |
| `initModals > closes modal on backdrop click` | Backdrop click dismisses modal |
| `initModals > does not close on content click` | Content click does NOT dismiss modal |

### `tests/unit/gps.test.js` — 11 new test cases (NEW FILE)

| Test | What it covers |
|---|---|
| `startGps > activates geolocation watching` | watchPosition called, isGpsEnabled returns true |
| `startGps > idempotent when already active` | Second call does not re-register watch |
| `stopGps > clears watch and resets state` | clearWatch called, state reset |
| `stopGps > safe when not active` | No-op when GPS already stopped |
| `toggleGps > switches between on and off` | State machine toggle behavior |
| `shouldAllowMapClicks > false when GPS active` | Map click suppression during GPS mode |
| `shouldAllowMapClicks > true when GPS inactive` | Map clicks enabled when GPS off |
| `button > updates aria-pressed on toggle` | Accessibility attribute management |
| `status > updates on start` | "Acquiring..." text shown |
| `status > clears on stop` | Status text emptied |
| `stopGps > notifies callback with null` | Marker removal notification |

### `tests/unit/forecast-api.test.js` — 7 new test cases (NEW FILE)

| Test | What it covers |
|---|---|
| `returns 500 when API key missing` | Missing env var error path |
| `returns 400 when lat/lon missing` | Parameter validation |
| `returns 400 when lat is NaN` | Non-numeric parameter rejection |
| `returns shaped forecast data on success` | Response structure, daily array, _usage extraction |
| `returns error when upstream API returns non-ok` | Upstream 429/500 passthrough |
| `returns 500 when fetch throws` | Network error handling |
| `sets Cache-Control header` | Response caching header |

---

## 4. Files Still Lacking Unit Tests (out of scope or impractical)

| File | Reason |
|---|---|
| `public/js/map.js` | Tightly coupled to MapLibre GL JS. `initMap` is ~600 lines of map configuration. Testing `showMapInfo` and `createCircleGeoJSON` would require heavy DOM mocking. Best covered by E2E tests. |
| `public/js/elevation.js` | Canvas 2D rendering. Would need canvas mocking or snapshot testing. The filter/scale logic could be extracted and tested, but that requires source changes. |
| `public/js/app.js` | Entry point. Excluded from vitest coverage config. Adequately covered by E2E tests. |
| `api/usage.js` | Very similar structure to `api/forecast.js`. Lower priority since it's a simple pass-through. |
| `server.js` | Local development server. Same route logic as `api/forecast.js` (Vercel version). |

---

## 5. Recommendations

1. **Fix the failing `findMileFromCoords` interpolation test.** The source code does NOT interpolate between waypoints (it returns the closest waypoint's mile), but the test asserts interpolated values. Either the test expectation or the source code is wrong. Given the comment "The waypoints are dense enough (~0.9 mi apart) for good accuracy," the source code behavior appears intentional, and the test should be updated to match.

2. **Replace constant-value tests in config.test.js with behavioral tests.** Testing that `WATER_WARNING_MILES === 20` has low value. Instead, test that the warning class is applied when water distance exceeds the threshold, wherever that logic lives.

3. **Fix the silent skip in E2E waypoint consistency test.** The `if (!result.success) { return; }` pattern means the test can pass without executing its main assertion. Use `test.skip` or `expect(result.success).toBe(true)` to make failures visible.

4. **Fix the E2E zoom update test.** Assert that the new zoom value differs from the initial value, not just that it matches the format pattern.

5. **Extract testable logic from map.js.** `createCircleGeoJSON` and the distance/direction logic in `showMapInfo` could be pure functions tested independently.

6. **Consider adding integration tests** for the data loading pipeline (`safeFetch` in app.js loading waypoints/water/towns and populating `state`).
