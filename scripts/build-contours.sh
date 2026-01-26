#!/bin/bash
# Generate 25-foot contour lines for the trail corridor
# Uses SRTM elevation data and GDAL for contour generation

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/build"
DATA_DIR="$PROJECT_ROOT/data"
DIST_DIR="$PROJECT_ROOT/dist"
BBOX_FILE="$BUILD_DIR/route_bbox.json"
CORRIDOR_FILE="$BUILD_DIR/corridor.geojson"
NARROW_BUFFER_FILE="$BUILD_DIR/narrow_buffer.geojson"
DEM_FILE="$DATA_DIR/corridor_dem.tif"
CONTOURS_GEOJSON="$BUILD_DIR/contours.geojson"
CONTOURS_CLIPPED_GEOJSON="$BUILD_DIR/contours_clipped.geojson"
CONTOURS_PMTILES="$DIST_DIR/contours.pmtiles"

# Ensure directories exist
mkdir -p "$BUILD_DIR"
mkdir -p "$DATA_DIR"
mkdir -p "$DIST_DIR"

echo "Building 25-foot contour lines..."
echo ""

# Check dependencies
command -v gdal_contour >/dev/null 2>&1 || { echo "Error: gdal_contour not found. Install with: brew install gdal"; exit 1; }
command -v tippecanoe >/dev/null 2>&1 || { echo "Error: tippecanoe not found. Install with: brew install tippecanoe"; exit 1; }
command -v gdalwarp >/dev/null 2>&1 || { echo "Error: gdalwarp not found. Install with: brew install gdal"; exit 1; }

# Read bounding box from JSON
if [ ! -f "$BBOX_FILE" ]; then
  echo "Error: Bounding box file not found: $BBOX_FILE"
  echo "Run: node scripts/build-corridor.js"
  exit 1
fi

WEST=$(node -pe "JSON.parse(require('fs').readFileSync('$BBOX_FILE', 'utf8')).west")
SOUTH=$(node -pe "JSON.parse(require('fs').readFileSync('$BBOX_FILE', 'utf8')).south")
EAST=$(node -pe "JSON.parse(require('fs').readFileSync('$BBOX_FILE', 'utf8')).east")
NORTH=$(node -pe "JSON.parse(require('fs').readFileSync('$BBOX_FILE', 'utf8')).north")

echo "Bounding box: [$WEST, $SOUTH, $EAST, $NORTH]"
echo ""

# Download SRTM elevation data from OpenTopography
# Using SRTM GL1 (30m resolution, global coverage)
if [ ! -f "$DEM_FILE" ]; then
  echo "Downloading SRTM elevation data from OpenTopography..."
  echo "This may take a few minutes..."

  # OpenTopography API endpoint for SRTM GL1
  API_URL="https://portal.opentopography.org/API/globaldem"

  # Create download URL with parameters
  DOWNLOAD_URL="${API_URL}?demtype=SRTMGL1&south=${SOUTH}&north=${NORTH}&west=${WEST}&east=${EAST}&outputFormat=GTiff&API_Key=demoapikeyot2022"

  echo "  URL: $DOWNLOAD_URL"
  echo ""

  # Download DEM
  curl -L -o "$DEM_FILE" "$DOWNLOAD_URL"

  if [ ! -f "$DEM_FILE" ] || [ ! -s "$DEM_FILE" ]; then
    echo ""
    echo "Error: Failed to download DEM from OpenTopography"
    echo ""
    echo "Alternative: Download SRTM tiles manually from:"
    echo "  https://dwtkns.com/srtm30m/"
    echo ""
    echo "The trail corridor spans approximately:"
    echo "  West:  $WEST"
    echo "  South: $SOUTH"
    echo "  East:  $EAST"
    echo "  North: $NORTH"
    echo ""
    echo "Download all tiles covering this area and merge them with:"
    echo "  gdalwarp -te $WEST $SOUTH $EAST $NORTH tile1.hgt tile2.hgt ... $DEM_FILE"
    exit 1
  fi

  echo "✓ DEM downloaded"
  DEM_SIZE=$(du -h "$DEM_FILE" | cut -f1)
  echo "  Size: $DEM_SIZE"
  echo ""
else
  echo "Using existing DEM: $DEM_FILE"
  echo ""
fi

# Get DEM info
echo "DEM Information:"
gdalinfo "$DEM_FILE" | grep -E "(Size|Origin|Pixel|Upper Left|Lower Right|Band 1)"
echo ""

# Check if narrow buffer exists
if [ ! -f "$NARROW_BUFFER_FILE" ]; then
  echo "Creating narrow buffer (500 feet around route)..."
  node "$PROJECT_ROOT/scripts/create-narrow-buffer.js"
  echo ""
fi

# Generate contour lines
# 50 feet = 15.24 meters
CONTOUR_INTERVAL=15.24

echo "Generating contour lines..."
echo "  Interval: 50 feet (${CONTOUR_INTERVAL}m)"
echo "  Output: $CONTOURS_GEOJSON"
echo ""

# Use gdal_contour to generate contours in GeoJSON format
# -a ELEVATION: attribute name for elevation values
# -i: contour interval
# -f: output format
gdal_contour -a ELEVATION -i "$CONTOUR_INTERVAL" -f GeoJSON "$DEM_FILE" "$CONTOURS_GEOJSON"

if [ ! -f "$CONTOURS_GEOJSON" ]; then
  echo "Error: Failed to generate contours"
  exit 1
fi

echo "✓ Contours generated"
GEOJSON_SIZE=$(du -h "$CONTOURS_GEOJSON" | cut -f1)
echo "  GeoJSON size: $GEOJSON_SIZE"
echo ""

# Clip contours to narrow buffer (500 feet around route)
echo "Clipping contours to narrow buffer (500ft around route)..."
echo "  Input: $CONTOURS_GEOJSON"
echo "  Clip: $NARROW_BUFFER_FILE"
echo "  Output: $CONTOURS_CLIPPED_GEOJSON"
echo ""

ogr2ogr -clipsrc "$NARROW_BUFFER_FILE" "$CONTOURS_CLIPPED_GEOJSON" "$CONTOURS_GEOJSON"

if [ ! -f "$CONTOURS_CLIPPED_GEOJSON" ]; then
  echo "Error: Failed to clip contours"
  exit 1
fi

echo "✓ Contours clipped"
CLIPPED_SIZE=$(du -h "$CONTOURS_CLIPPED_GEOJSON" | cut -f1)
echo "  Clipped size: $CLIPPED_SIZE (was $GEOJSON_SIZE)"
echo ""

# Convert to PMTiles using tippecanoe
echo "Converting to PMTiles..."
echo "  Zoom levels: 12-14"
echo "  Output: $CONTOURS_PMTILES"
echo ""

# Tippecanoe options:
# -o: output file
# -Z/-z: min/max zoom levels (12-14 for detailed view only)
# -l: layer name
# -f: force overwrite
# -r1: Allow dropping 50% of features at max zoom if needed
# --drop-densest-as-needed: simplify if too dense
# --simplification=10: More aggressive simplification
# -B: Buffer around tiles to ensure smooth lines
tippecanoe \
  -o "$CONTOURS_PMTILES" \
  -Z12 \
  -z14 \
  -l contours \
  -f \
  -r1 \
  --drop-densest-as-needed \
  --simplification=10 \
  -B4 \
  "$CONTOURS_CLIPPED_GEOJSON"

if [ ! -f "$CONTOURS_PMTILES" ]; then
  echo "Error: Failed to create PMTiles"
  exit 1
fi

echo ""
echo "✓ Contours PMTiles created!"
PMTILES_SIZE=$(du -h "$CONTOURS_PMTILES" | cut -f1)
echo "  Output: $CONTOURS_PMTILES"
echo "  Size: $PMTILES_SIZE"
echo ""

# Copy to public directory for Vercel
cp "$CONTOURS_PMTILES" "$PROJECT_ROOT/public/contours.pmtiles"
echo "✓ Copied to public/contours.pmtiles"
echo ""
echo "Done!"
