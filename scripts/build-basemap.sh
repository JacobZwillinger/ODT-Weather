#!/bin/bash
# Build basemap PMTiles using Planetiler
# Optimized for low fidelity and small file size

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/build"
DIST_DIR="$PROJECT_ROOT/dist"
CORRIDOR_OSM="$BUILD_DIR/corridor.osm.pbf"
# Use /tmp to avoid space issues in path
TEMP_BUILD="/tmp/odt-basemap-build"
BASEMAP_PMTILES_TEMP="$TEMP_BUILD/basemap.pmtiles"
BASEMAP_PMTILES="$DIST_DIR/basemap.pmtiles"
PLANETILER_JAR="$BUILD_DIR/planetiler.jar"
PLANETILER_TMP="$TEMP_BUILD/planetiler-tmp"

# Ensure directories exist
mkdir -p "$BUILD_DIR"
mkdir -p "$DIST_DIR"
mkdir -p "$TEMP_BUILD"

echo "Building basemap with Planetiler..."
echo ""

# Check if corridor OSM exists
if [ ! -f "$CORRIDOR_OSM" ]; then
  echo "Error: Corridor OSM file not found: $CORRIDOR_OSM"
  echo "Run: ./scripts/extract-corridor-osm.sh"
  exit 1
fi

# Download Planetiler if not present
if [ ! -f "$PLANETILER_JAR" ]; then
  echo "Downloading Planetiler (latest)..."
  PLANETILER_URL="https://github.com/onthegomap/planetiler/releases/latest/download/planetiler.jar"
  curl -L -o "$PLANETILER_JAR" "$PLANETILER_URL"
  echo "✓ Planetiler downloaded"
  echo ""
fi

# Get input file size
INPUT_SIZE=$(du -h "$CORRIDOR_OSM" | cut -f1)
echo "Input: $CORRIDOR_OSM ($INPUT_SIZE)"
echo "Output (temp): $BASEMAP_PMTILES_TEMP"
echo "Output (final): $BASEMAP_PMTILES"
echo ""

# Run Planetiler with low-fidelity configuration
echo "Running Planetiler..."
echo "Configuration: maxzoom=13, minimal features, sparsearray nodemap"
echo ""

# Use Java 21 if available (required for newer Planetiler versions)
JAVA_CMD="java"
if [ -f "/opt/homebrew/opt/openjdk@21/bin/java" ]; then
  JAVA_CMD="/opt/homebrew/opt/openjdk@21/bin/java"
fi

$JAVA_CMD -Xmx4g -jar "$PLANETILER_JAR" \
  --osm-path "$CORRIDOR_OSM" \
  --output "$BASEMAP_PMTILES_TEMP" \
  --download \
  --force \
  --maxzoom=13 \
  --tmpdir "$PLANETILER_TMP" \
  --nodemap-type=sparsearray \
  --storage=mmap

# Clean up temp directory
rm -rf "$PLANETILER_TMP"

# Move to final location
echo ""
echo "Moving to final location..."
mv "$BASEMAP_PMTILES_TEMP" "$BASEMAP_PMTILES"

# Get output file size
OUTPUT_SIZE=$(du -h "$BASEMAP_PMTILES" | cut -f1)
echo ""
echo "✓ Basemap created!"
echo "  Output: $BASEMAP_PMTILES"
echo "  Size: $OUTPUT_SIZE"
echo ""
echo "Done!"
