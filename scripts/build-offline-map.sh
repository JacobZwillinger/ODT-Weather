#!/bin/bash
# Master script to build complete offline map for a trail.
# Pass --trail nnml (or odt, the default) to pick the trail.

set -e

TRAIL="odt"
while [ $# -gt 0 ]; do
  case "$1" in
    --trail) TRAIL="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
if [ "$TRAIL" = "odt" ]; then
  TRAIL_BUILD_DIR="$PROJECT_ROOT/build"
else
  TRAIL_BUILD_DIR="$PROJECT_ROOT/build/$TRAIL"
fi

echo "================================================"
echo "Offline Map Build Pipeline  (trail: $TRAIL)"
echo "================================================"
echo ""

# Step 1: Build corridor polygon
echo "Step 1/7: Building corridor polygon..."
node "$SCRIPT_DIR/build-corridor.js" --trail "$TRAIL"
echo ""

# Step 2: Build overlay tiles (route + waypoints) — currently ODT-only.
if [ "$TRAIL" = "odt" ]; then
    echo "Step 2/7: Building overlay tiles..."
  node "$SCRIPT_DIR/build-tiles.js"
  echo ""
else
    echo "Step 2/7: Skipping overlay build for $TRAIL (uses GeoJSON sources at runtime)."
  echo ""
fi

# Step 3: Download OSM extract (skip if already exists)
if [ -f "$TRAIL_BUILD_DIR/region.osm.pbf" ]; then
  echo "Step 3/7: OSM extract already downloaded, skipping..."
  echo ""
else
  echo "Step 3/7: Downloading OSM extract..."
  "$SCRIPT_DIR/download-osm.sh" --trail "$TRAIL"
  echo ""
fi

# Step 4: Extract corridor from OSM
echo "Step 4/7: Extracting corridor from OSM..."
"$SCRIPT_DIR/extract-corridor-osm.sh" --trail "$TRAIL"
echo ""

# Step 5: Build basemap with Planetiler
echo "Step 5/7: Building basemap with Planetiler..."
"$SCRIPT_DIR/build-basemap.sh" --trail "$TRAIL"
echo ""

# Step 6: Build contours
echo "Step 6/7: Building contour tiles..."
"$SCRIPT_DIR/build-contours.sh" --trail "$TRAIL"
echo ""

# Step 7: Summary
echo "Step 7/7: Build Summary"
echo "================================================"
echo ""
echo "Output files:"
ls -lh "$PROJECT_ROOT/dist"/*.pmtiles 2>/dev/null || echo "  No PMTiles found in dist/"
echo ""
echo "✓ Offline map build complete!"
echo ""
echo "Next steps:"
echo "  1. Test locally: python3 -m http.server 8000"
echo "  2. Deploy dist/ folder to your hosting"
echo ""
