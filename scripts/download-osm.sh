#!/bin/bash
# Download OSM extract from Geofabrik for the trail's home state.
# Defaults to ODT (Oregon). Pass --trail nnml for New Mexico.

set -e

TRAIL="odt"
while [ $# -gt 0 ]; do
  case "$1" in
    --trail) TRAIL="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

case "$TRAIL" in
  odt)
    REGION_NAME="Oregon"
    OSM_URL="https://download.geofabrik.de/north-america/us/oregon-latest.osm.pbf"
    ;;
  nnml)
    REGION_NAME="New Mexico"
    OSM_URL="https://download.geofabrik.de/north-america/us/new-mexico-latest.osm.pbf"
    ;;
  *)
    echo "Unknown trail: $TRAIL"
    exit 1
    ;;
esac

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/build"
if [ "$TRAIL" = "odt" ]; then
  OSM_FILE="$BUILD_DIR/region.osm.pbf"
else
  OSM_FILE="$BUILD_DIR/$TRAIL/region.osm.pbf"
fi

mkdir -p "$(dirname "$OSM_FILE")"

echo "Downloading OSM extract for $REGION_NAME (trail: $TRAIL)..."
echo ""

echo "Source: $OSM_URL"
echo "Target: $OSM_FILE"
echo ""

# Download with progress
curl -L --progress-bar -o "$OSM_FILE" "$OSM_URL"

# Check file size
FILE_SIZE=$(du -h "$OSM_FILE" | cut -f1)
echo ""
echo "✓ Download complete!"
echo "  File: $OSM_FILE"
echo "  Size: $FILE_SIZE"
echo ""
echo "Done!"
