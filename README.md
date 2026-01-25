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
  If your Vercel deployment shows a 404, make sure `vercel.json` is present so the
  static frontend routes to `/public/index.html`.

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

## API

The frontend calls `/api/forecast?lat=<lat>&lon=<lon>`. The backend proxies the request to PirateWeather and returns a trimmed response for faster payloads.

## Placeholder trail points

The current UI uses five placeholder points. Swap these with real GPX locations once available.
