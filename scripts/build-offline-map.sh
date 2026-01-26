#!/bin/bash
# Master script to build complete offline map
# This orchestrates all steps: corridor, OSM download, extraction, and basemap generation

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "================================================"
echo "ODT Offline Map Build Pipeline"
echo "================================================"
echo ""

# Step 1: Build corridor polygon
echo "Step 1/6: Building corridor polygon..."
node "$SCRIPT_DIR/build-corridor.js"
echo ""

# Step 2: Build overlay tiles (route + waypoints)
echo "Step 2/6: Building overlay tiles..."
node "$SCRIPT_DIR/build-tiles.js"
echo ""

# Step 3: Download OSM extract (skip if already exists)
if [ -f "$PROJECT_ROOT/build/region.osm.pbf" ]; then
  echo "Step 3/6: OSM extract already downloaded, skipping..."
  echo ""
else
  echo "Step 3/6: Downloading OSM extract..."
  "$SCRIPT_DIR/download-osm.sh"
  echo ""
fi

# Step 4: Extract corridor from OSM
echo "Step 4/6: Extracting corridor from OSM..."
"$SCRIPT_DIR/extract-corridor-osm.sh"
echo ""

# Step 5: Build basemap with Planetiler
echo "Step 5/6: Building basemap with Planetiler..."
"$SCRIPT_DIR/build-basemap.sh"
echo ""

# Step 6: Summary
echo "Step 6/6: Build Summary"
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
