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
