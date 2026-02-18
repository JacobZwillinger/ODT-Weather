# Oregon Desert Trail Weather (ODT)

Lightweight frontend + backend for quick weather snapshots along the Oregon Desert Trail.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file based on `.env.example` and add your PirateWeather API key.

3. Start the server:

   ```bash
   npm start
   ```

4. Open `http://localhost:3000`.

## Secure API key setup (local + Vercel)

- **Local development**: put your key in `.env` (already gitignored) so it never lands in Git history.
- **Vercel**: add `PIRATEWEATHER_API_KEY` in your project’s Environment Variables, then redeploy.
  The serverless `/api/forecast` route reads it from the environment at runtime.
  If your Vercel deployment shows a 404, ensure `vercel.json` is present so the
  fallback rewrite serves `index.html` from `/public`.

## Troubleshooting npm install

If `npm install` fails with a `403 Forbidden` error, it usually means npm is
being blocked by a proxy or a restrictive registry. Try the following:

1. Ensure npm is using the public registry:

   ```bash
   npm config set registry https://registry.npmjs.org/
   ```

2. Clear any proxy settings that may be injected by your environment:

   ```bash
   npm config delete proxy
   npm config delete https-proxy
   ```

3. Retry the install:

   ```bash
   npm install
   ```

## Testing

<!-- [DOCS] Updated: added missing testing instructions -->

Run unit tests:

```bash
npm test
```

Run end-to-end tests (requires Playwright browsers installed):

```bash
npx playwright install chromium
npm run test:e2e
```

Run all tests:

```bash
npm run test:all
```

## API

The frontend calls `/api/forecast?lat=<lat>&lon=<lon>`. The backend proxies the request to PirateWeather and returns a trimmed response with current conditions and 7-day daily forecasts.

There is also an `/api/usage` endpoint that returns current PirateWeather API call counts.

**Note:** The local Express server (`server.js`) returns only current conditions. The Vercel serverless function (`api/forecast.js`) returns both current conditions and 7-day daily forecasts. The frontend weather table relies on the daily forecast data, so the weather table will show `--` when running locally.

## Data Pipeline

<!-- [DOCS] Updated: added data pipeline docs -->

Water sources and town data are generated from GPX + CSV files:

```bash
python3 build-water-sources.py
```

This outputs `public/water-sources.json` and `public/towns.json`.

Offline map tiles are built separately. See `OFFLINE_MAP_BUILD.md` for details.

---

## Methodology

### Elevation Profile

The elevation chart is built from 28,598 points spaced roughly every 137 feet along the trail — about 4× denser than the previous dataset.

**How the data is built:**

1. **Geometry from KML track files.** The trail is divided into 25 named segments spread across 4 CalTopo KML files. The script parses these, sorts them in order, and stitches them into one continuous 743-mile line. This gives us the geographic shape of the trail but no elevation — CalTopo exports coordinates without DEM data attached.

2. **Elevations from USGS 3DEP.** Each point's elevation is looked up via the [USGS 3D Elevation Program (3DEP)](https://www.usgs.gov/3d-elevation-program) point query API, which samples from a 1/3 arc-second (~10 meter) DEM. This is the same elevation dataset used by most topo maps in the US. The script runs 20 queries concurrently and processes all 28,598 points in about 10 minutes.

**Why denser data gives more accurate gain/loss:**

Elevation gain is calculated by summing every uphill step between adjacent points. At coarse spacing (528 ft between points), a gentle ridgeline might be reduced to just a few samples — missing intermediate dips and rises. Denser spacing captures more of the actual terrain shape.

More subtly, sparse sampling also *inflates* gain/loss through noise. Every elevation lookup has a small measurement error — maybe ±5–10 feet. At 528 ft spacing with 7,500 points, those random errors tend to cancel poorly and accumulate into thousands of feet of phantom gain/loss. At 137 ft spacing with the same quality instrument, adjacent points query nearby cells in the same DEM tile, so errors are spatially correlated and mostly cancel out. The result is *less* spurious up-and-down in flat sections.

The new dataset gives **81,062 ft gain / 81,807 ft loss**, compared to 90k/93k previously — a ~10% reduction that almost entirely reflects removal of noise, not real terrain.

---

### Weather Forecasts

Weather is fetched for each location in the app from the [PirateWeather API](https://pirateweather.net), which provides forecasts powered by NOAA's High-Resolution Rapid Refresh (HRRR) and other National Weather Service models. It's a drop-in replacement for the Dark Sky API (which shut down in 2023), with an identical response format.

**What's fetched per location:**

- **Current conditions** — temperature, feels-like, wind speed and gust, humidity, icon
- **7-day daily forecast** — high/low temps, precipitation probability, weather icon and summary
- **48-hour hourly forecast** — temperature, precipitation probability and intensity, wind speed, icon

**How the weather table works:**

The app groups the 48 hourly readings into day and night periods:
- **Day** = 6 AM to 9 PM
- **Night** = 10 PM to 5 AM

For each period it picks the most representative weather icon (most frequently occurring), the high temperature (day) or low temperature (night), and the peak precipitation probability. This gives a compact 3-day/night view that fits on a phone screen while still being based on granular hourly data.

Tapping any forecast cell expands an hourly filmstrip showing the full hour-by-hour breakdown for that period.

**Caching:** Forecasts are cached for 12 hours at the CDN layer, so the app doesn't hammer the API on every page load. Weather along a desert trail doesn't change that quickly.
