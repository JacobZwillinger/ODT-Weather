#!/bin/bash
# Bundle web assets into Android app's assets directory
# Run this before building the APK in Android Studio

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PUBLIC_DIR="$PROJECT_ROOT/public"
ASSETS_DIR="$PROJECT_ROOT/android/app/src/main/assets"

echo "Bundling web assets for Android..."
echo ""

# Clean previous assets
rm -rf "$ASSETS_DIR"
mkdir -p "$ASSETS_DIR"

# Copy HTML
echo "1. Copying index.html..."
cp "$PUBLIC_DIR/index.html" "$ASSETS_DIR/"

# Copy CSS
echo "2. Copying CSS..."
mkdir -p "$ASSETS_DIR/css"
cp "$PUBLIC_DIR/css/styles.css" "$ASSETS_DIR/css/"

# Copy JS modules
echo "3. Copying JavaScript modules..."
mkdir -p "$ASSETS_DIR/js"
cp "$PUBLIC_DIR/js/"*.js "$ASSETS_DIR/js/"

# Copy local libraries
echo "4. Copying MapLibre GL + PMTiles libraries..."
mkdir -p "$ASSETS_DIR/lib"
cp "$PUBLIC_DIR/lib/"* "$ASSETS_DIR/lib/"

# Copy PMTiles (basemap, overlay, contours — skip route.pmtiles if it exists)
echo "5. Copying PMTiles..."
for f in basemap.pmtiles overlay.pmtiles contours.pmtiles; do
  if [ -f "$PUBLIC_DIR/$f" ]; then
    cp "$PUBLIC_DIR/$f" "$ASSETS_DIR/$f"
    SIZE=$(du -h "$ASSETS_DIR/$f" | cut -f1)
    echo "   $f ($SIZE)"
  else
    echo "   WARNING: $f not found!"
  fi
done

# Copy JSON data files
echo "6. Copying data files..."
for f in waypoints.json water.json towns.json navigation.json toilets.json elevation-profile.json; do
  if [ -f "$PUBLIC_DIR/$f" ]; then
    cp "$PUBLIC_DIR/$f" "$ASSETS_DIR/$f"
  else
    echo "   WARNING: $f not found!"
  fi
done

# Copy font glyphs
echo "7. Copying font glyphs..."
if [ -d "$PUBLIC_DIR/fonts" ]; then
  cp -r "$PUBLIC_DIR/fonts" "$ASSETS_DIR/fonts"
  FONT_COUNT=$(find "$ASSETS_DIR/fonts" -name "*.pbf" | wc -l | tr -d ' ')
  FONT_SIZE=$(du -sh "$ASSETS_DIR/fonts" | cut -f1)
  echo "   $FONT_COUNT PBF files ($FONT_SIZE)"
else
  echo "   WARNING: fonts/ directory not found!"
fi

echo ""
echo "Asset bundle complete!"
TOTAL_SIZE=$(du -sh "$ASSETS_DIR" | cut -f1)
echo "Total size: $TOTAL_SIZE"
echo ""
echo "Now open android/ in Android Studio and build the APK."
