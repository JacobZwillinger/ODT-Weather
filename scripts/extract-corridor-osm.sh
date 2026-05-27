#!/bin/bash
# Extract OSM data within the trail's corridor polygon.
# Defaults to ODT; pass --trail nnml for the NNML corridor.

set -e

TRAIL="odt"
while [ $# -gt 0 ]; do
  case "$1" in
    --trail) TRAIL="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/build"
if [ "$TRAIL" = "odt" ]; then
  TRAIL_BUILD_DIR="$BUILD_DIR"
else
  TRAIL_BUILD_DIR="$BUILD_DIR/$TRAIL"
fi

CORRIDOR_GEOJSON="$TRAIL_BUILD_DIR/corridor.geojson"
REGION_OSM="$TRAIL_BUILD_DIR/region.osm.pbf"
CORRIDOR_OSM="$TRAIL_BUILD_DIR/corridor.osm.pbf"

echo "Extracting OSM data for corridor..."
echo ""

# Check if required files exist
if [ ! -f "$CORRIDOR_GEOJSON" ]; then
  echo "Error: Corridor GeoJSON not found: $CORRIDOR_GEOJSON"
  echo "Run: node scripts/build-corridor.js"
  exit 1
fi

if [ ! -f "$REGION_OSM" ]; then
  echo "Error: Region OSM file not found: $REGION_OSM"
  echo "Run: ./scripts/download-osm.sh"
  exit 1
fi

# Get file sizes before
REGION_SIZE=$(du -h "$REGION_OSM" | cut -f1)
echo "Input: $REGION_OSM ($REGION_SIZE)"
echo "Polygon: $CORRIDOR_GEOJSON"
echo ""

echo "Running osmium extract..."
osmium extract \
  --strategy=complete_ways \
  --polygon="$CORRIDOR_GEOJSON" \
  "$REGION_OSM" \
  -o "$CORRIDOR_OSM" \
  --overwrite

# Get file size after
CORRIDOR_SIZE=$(du -h "$CORRIDOR_OSM" | cut -f1)
echo ""
echo "✓ Extraction complete!"
echo "  Output: $CORRIDOR_OSM"
echo "  Size: $CORRIDOR_SIZE (reduced from $REGION_SIZE)"
echo ""
echo "Done!"
