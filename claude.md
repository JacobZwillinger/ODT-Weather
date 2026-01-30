# Claude Instructions for ODT Weather Project

## Auto-Push Policy
**CRITICAL**: Always push changes to the remote repository when completing tasks. Don't wait for the user to ask.

After completing work:
1. Run `git add -A`
2. Create a meaningful commit message
3. Push with `git push`

This should happen automatically at the end of each task completion.

## Project Overview
Oregon Desert Trail weather snapshot application with interactive map and weather forecasts.

## Key Technical Details
- **GPS Coordinates**: GPX files are the authoritative source. Never interpolate from mileage.
- **Data Pipeline**: `build-water-sources.py` generates JSON files from GPX + CSV
- **Map**: Uses PMTiles for vector tiles, MapLibre GL for rendering
- **Layout**: Fullscreen map with compact overlays for info and elevation

## Important Files
- `public/index.html` - Main application
- `build-water-sources.py` - Data processing pipeline
- `public/waypoints.json` - All 852 waypoints for navigation
- `public/water-sources.json` - 325 water sources
- `public/towns.json` - 17 towns/services

## Development Guidelines
- Keep design clean and minimal
- Maximize map visibility
- Test on both mobile and desktop
- Always push changes when done
