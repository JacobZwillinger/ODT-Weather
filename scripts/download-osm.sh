#!/bin/bash
# Download OSM extract for Oregon
# Source: Geofabrik (updates daily)

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/build"
OSM_FILE="$BUILD_DIR/region.osm.pbf"

# Ensure build directory exists
mkdir -p "$BUILD_DIR"

echo "Downloading OSM extract for Oregon..."
echo ""

# Geofabrik Oregon extract
OSM_URL="https://download.geofabrik.de/north-america/us/oregon-latest.osm.pbf"

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
