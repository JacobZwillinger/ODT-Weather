#!/bin/bash
# Generate 20-foot contour lines for a 10-mile corridor around the trail
# Uses SRTM elevation data and GDAL for contour generation

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Per-trail layout: --trail nnml uses build/nnml/ + contours-nnml.pmtiles.
# Default (odt) uses the existing build/ + contours.pmtiles paths.
TRAIL="odt"
while [ $# -gt 0 ]; do
  case "$1" in
    --trail) TRAIL="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [ "$TRAIL" = "odt" ]; then
  TRAIL_BUILD_DIR="$PROJECT_ROOT/build"
  PMTILES_NAME="contours.pmtiles"
  DEM_NAME="corridor_dem.tif"
else
  TRAIL_BUILD_DIR="$PROJECT_ROOT/build/$TRAIL"
  PMTILES_NAME="contours-${TRAIL}.pmtiles"
  DEM_NAME="${TRAIL}_corridor_dem.tif"
fi

BUILD_DIR="$PROJECT_ROOT/build"
DATA_DIR="$PROJECT_ROOT/data"
DIST_DIR="$PROJECT_ROOT/dist"
BBOX_FILE="$TRAIL_BUILD_DIR/route_bbox.json"
CORRIDOR_FILE="$TRAIL_BUILD_DIR/corridor.geojson"
NARROW_BUFFER_FILE="$TRAIL_BUILD_DIR/narrow_buffer.geojson"
DEM_FILE="$DATA_DIR/$DEM_NAME"
CONTOURS_GEOJSON="$TRAIL_BUILD_DIR/contours.geojson"
CONTOURS_CLIPPED_GEOJSON="$TRAIL_BUILD_DIR/contours_clipped.geojson"
CONTOURS_PMTILES="$DIST_DIR/$PMTILES_NAME"

mkdir -p "$TRAIL_BUILD_DIR"

# Ensure directories exist
mkdir -p "$BUILD_DIR"
mkdir -p "$DATA_DIR"
mkdir -p "$DIST_DIR"

echo "Building 20-foot contour lines (10-mile corridor)..."
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
API_URL="https://portal.opentopography.org/API/globaldem"
API_KEY="demoapikeyot2022"
DEM_CHUNK_GRID="${DEM_CHUNK_GRID:-4}"

download_dem_single_shot() {
  local out="$1"
  local url="${API_URL}?demtype=SRTMGL1&south=${SOUTH}&north=${NORTH}&west=${WEST}&east=${EAST}&outputFormat=GTiff&API_Key=${API_KEY}"
  echo "  URL: $url"
  # --fail returns non-zero on HTTP errors (the API hands back text errors otherwise)
  # --max-time 300 caps the request at 5 minutes so we can fall back to chunking on stall
  curl -L --fail --max-time 300 -o "$out" "$url"
}

download_dem_chunked() {
  # Split the bbox into a grid, download each tile, then merge with gdalwarp.
  # Override DEM_CHUNK_GRID for larger/smaller requests, e.g. DEM_CHUNK_GRID=6.
  local out="$1"
  local grid="$DEM_CHUNK_GRID"

  local tmp_dir
  tmp_dir=$(mktemp -d)
  echo "  Splitting bbox into ${grid}x${grid} tiles, output dir: $tmp_dir"

  local i=0
  local total=$((grid * grid))
  local row col
  for ((row = 0; row < grid; row++)); do
    for ((col = 0; col < grid; col++)); do
      i=$((i + 1))
      local w s e n
      w=$(node -pe "Number(${WEST}) + (Number(${EAST}) - Number(${WEST})) * ${col} / ${grid}")
      e=$(node -pe "Number(${WEST}) + (Number(${EAST}) - Number(${WEST})) * (${col} + 1) / ${grid}")
      s=$(node -pe "Number(${SOUTH}) + (Number(${NORTH}) - Number(${SOUTH})) * ${row} / ${grid}")
      n=$(node -pe "Number(${SOUTH}) + (Number(${NORTH}) - Number(${SOUTH})) * (${row} + 1) / ${grid}")
      local tile_url="${API_URL}?demtype=SRTMGL1&south=${s}&north=${n}&west=${w}&east=${e}&outputFormat=GTiff&API_Key=${API_KEY}"
      local tile_file="$tmp_dir/tile_${i}.tif"
      echo "  [$i/$total] $w $s $e $n"
      curl -L --fail --max-time 300 -o "$tile_file" "$tile_url" || return 1
    done
  done

  echo "  Merging $total tiles into $out"
  gdalwarp -overwrite "$tmp_dir"/tile_*.tif "$out" || return 1
  rm -rf "$tmp_dir"
}

if [ ! -f "$DEM_FILE" ]; then
  echo "Downloading SRTM elevation data from OpenTopography..."
  echo "This may take a few minutes..."
  echo ""

  if ! download_dem_single_shot "$DEM_FILE" || [ ! -s "$DEM_FILE" ]; then
    echo ""
    echo "Single-shot download failed or stalled; falling back to ${DEM_CHUNK_GRID}x${DEM_CHUNK_GRID} chunked download..."
    rm -f "$DEM_FILE"
    if ! download_dem_chunked "$DEM_FILE" || [ ! -s "$DEM_FILE" ]; then
      echo ""
      echo "Error: chunked DEM download also failed."
      echo "Manual fallback: download SRTM tiles from https://dwtkns.com/srtm30m/"
      echo "  and merge with: gdalwarp -te $WEST $SOUTH $EAST $NORTH tile1.hgt ... $DEM_FILE"
      exit 1
    fi
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

# Always recreate buffer (in case distance changed)
echo "Creating 10-mile buffer around route..."
node "$PROJECT_ROOT/scripts/create-narrow-buffer.js" --trail "$TRAIL"
echo ""

# Generate contour lines
# 20 feet = 6.096 meters
CONTOUR_INTERVAL=6.096

echo "Generating contour lines..."
echo "  Interval: 20 feet (${CONTOUR_INTERVAL}m)"
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

# Clip contours to buffer (10 miles around route)
echo "Clipping contours to 10-mile buffer around route..."
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
echo "  Zoom levels: 9-14"
echo "  Output: $CONTOURS_PMTILES"
echo ""

# Tippecanoe options:
# -o: output file
# -Z/-z: min/max zoom levels (9-14 for wide zoom range)
# -l: layer name
# -f: force overwrite
# -r1: Allow dropping 50% of features at max zoom if needed
# --drop-densest-as-needed: simplify if too dense
# --simplification=10: More aggressive simplification at lower zooms
# -B: Buffer around tiles to ensure smooth lines across tile boundaries
tippecanoe \
  -o "$CONTOURS_PMTILES" \
  -Z9 \
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
cp "$CONTOURS_PMTILES" "$PROJECT_ROOT/public/$PMTILES_NAME"
echo "✓ Copied to public/$PMTILES_NAME"
echo ""
echo "Done!"
