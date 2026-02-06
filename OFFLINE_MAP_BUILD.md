# Offline Map Build Guide

This document explains how to build the offline basemap for the ODT Weather app.

## Overview

<!-- [DOCS] Updated: added missing contours.pmtiles to overview -->
The offline map system consists of three PMTiles files:

1. **basemap.pmtiles** - OpenStreetMap basemap for the 5km corridor around the trail (~10-30 MB)
2. **overlay.pmtiles** - Trail route, waypoints, and section markers (~300 KB)
3. **contours.pmtiles** - Elevation contour lines for the corridor

## Prerequisites

### System Requirements
- Node.js 18+
- Java (for Planetiler)
- osmium-tool
- tippecanoe

### Install Dependencies

```bash
# macOS
brew install osmium-tool tippecanoe

# Node dependencies
npm install
```

## Quick Start

Run the complete build pipeline:

```bash
./scripts/build-offline-map.sh
```

This will:
1. Build 5km corridor polygon around the route
2. Build overlay tiles (route + waypoints)
3. Download Oregon OSM extract (~200 MB)
4. Extract corridor data from OSM
5. Build basemap with Planetiler
6. Output files to `dist/` directory

## Build Steps (Manual)

### 1. Build Corridor Polygon

```bash
node scripts/build-corridor.js
```

Creates `build/corridor.geojson` with a 5km buffer around the route.

### 2. Build Overlay Tiles

```bash
node scripts/build-tiles.js
```

Creates `dist/overlay.pmtiles` from route and waypoint data.

### 3. Download OSM Extract

```bash
./scripts/download-osm.sh
```

Downloads Oregon OSM data (~200 MB) to `build/region.osm.pbf`.

### 4. Extract Corridor

```bash
./scripts/extract-corridor-osm.sh
```

Extracts only the corridor area, reducing file size significantly.

### 5. Build Basemap

```bash
./scripts/build-basemap.sh
```

Runs Planetiler to generate `dist/basemap.pmtiles` with:
- Max zoom: 13
- Roads and tracks
- Water features
- Place labels
- Minimal buildings/POIs

## Configuration

### Basemap Detail Level

Edit `scripts/build-basemap.sh` to adjust Planetiler settings:

- `--maxzoom=13` - Maximum zoom level (lower = smaller file)
- `--simplify-tolerance-at-max-zoom=0.1` - Geometry simplification
- `--building-merge-z13=false` - Disable building merging

### Corridor Width

Edit `scripts/build-corridor.js`:

```javascript
const bufferDistance = 5; // kilometers (5km = ~3 miles each side)
```

## Output Files

### Development
- `public/route.pmtiles` - Overlay for local testing
- `build/` - Intermediate files (corridor, OSM extracts)

### Production
- `dist/basemap.pmtiles` - Basemap for deployment
- `dist/overlay.pmtiles` - Overlay for deployment

## File Sizes

Typical sizes (5km corridor, maxzoom=13):

- `region.osm.pbf` - ~200 MB (Oregon)
- `corridor.osm.pbf` - ~10-20 MB (corridor only)
- `basemap.pmtiles` - ~10-30 MB (final basemap)
- `overlay.pmtiles` - ~300 KB (route data)

## Troubleshooting

### Planetiler Out of Memory

Increase Java heap size in `build-basemap.sh`:

```bash
java -Xmx8g -jar planetiler.jar ...  # Default is 4g
```

### Basemap Too Large

Reduce detail in `build-basemap.sh`:
- Lower `--maxzoom` (try 12 or 11)
- Increase `--simplify-tolerance-at-max-zoom` (try 0.2 or 0.3)

### Missing Features

Check Planetiler logs for excluded layers. Add specific layers:

```bash
--include-tags=highway=*,natural=water
```

## Development

### Testing Locally

```bash
python3 -m http.server 8000
```

Visit http://localhost:8000 and check the Map tab.

### Rebuilding After Changes

If you modify the route (KML files):

```bash
node scripts/parse-kml-tracks.js
./scripts/build-offline-map.sh
```

## Deployment

Deploy the `dist/` folder to your hosting provider (Vercel, Netlify, etc.):

```bash
git add dist/*.pmtiles
git commit -m "Update offline map tiles"
git push
```

## Notes

- The basemap is optimized for hiking/trail use
- Buildings and detailed POIs are excluded to save space
- The corridor extends 5km (3 miles) on each side of the trail
- OSM data is from Geofabrik (updated daily)
