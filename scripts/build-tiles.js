#!/usr/bin/env node
/**
 * Build PMTiles from route data
 *
 * Creates:
 * - build/route_line.geojson - LineString connecting section waypoints
 * - build/waypoints.geojson - Points from GPX waypoints
 * - public/route.pmtiles - Tiled vector data
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Section waypoints from index.html (25 sections with coordinates)
const sections = [
  { name: "1: Badlands to Sand Spring", lat: 44.045, lon: -121.038, mile: 0 },
  { name: "2: Sand Spring to South Reservoir", lat: 43.708, lon: -120.847, mile: 36 },
  { name: "3: South Reservoir to Lost Forest", lat: 43.521, lon: -120.777, mile: 53 },
  { name: "4: Lost Forest to Burma Rim", lat: 43.379, lon: -120.374, mile: 81 },
  { name: "5: Burma Rim to Diablo Peak North", lat: 43.202, lon: -120.278, mile: 99 },
  { name: "6: Diablo Peak North to Paisley", lat: 43.053, lon: -120.564, mile: 127 },
  { name: "7: Paisley to Abert Rim South", lat: 42.694, lon: -120.546, mile: 161 },
  { name: "8: Abert Rim South to Colvin Timbers", lat: 42.329, lon: -120.301, mile: 211 },
  { name: "9: Colvin Timbers to Plush", lat: 42.507, lon: -120.202, mile: 242 },
  { name: "10: Plush to Hart Mountain HQ", lat: 42.425, lon: -119.905, mile: 266 },
  { name: "11: Hart Mountain HQ to Orejana Canyon", lat: 42.548, lon: -119.655, mile: 311 },
  { name: "12: Orejana Canyon to Frenchglen", lat: 42.790, lon: -119.483, mile: 334 },
  { name: "13: Frenchglen to South Steens", lat: 42.825, lon: -118.914, mile: 374 },
  { name: "14: South Steens to East Steens Road", lat: 42.657, lon: -118.728, mile: 393 },
  { name: "15: East Steens Road to Fields", lat: 42.520, lon: -118.531, mile: 417 },
  { name: "16: Fields to Denio Creek", lat: 42.265, lon: -118.675, mile: 438 },
  { name: "17: Denio Creek to No Name Creek", lat: 42.002, lon: -118.634, mile: 467 },
  { name: "18: No Name Creek to Oregon Canyon", lat: 42.042, lon: -118.352, mile: 486 },
  { name: "19: Oregon Canyon to Hwy 95", lat: 42.116, lon: -117.984, mile: 517 },
  { name: "20: Hwy 95 to Anderson Crossing", lat: 42.121, lon: -117.746, mile: 539 },
  { name: "21: Anderson Crossing to Three Forks", lat: 42.130, lon: -117.316, mile: 577 },
  { name: "22: Three Forks to Rome", lat: 42.545, lon: -117.166, mile: 621 },
  { name: "23: Rome to Lambert Rocks", lat: 42.839, lon: -117.628, mile: 661 },
  { name: "24: Lambert Rocks to Leslie Gulch", lat: 43.064, lon: -117.681, mile: 684 },
  { name: "25: Leslie Gulch to Owyhee Reservoir", lat: 43.299, lon: -117.270, mile: 725 }
];

const projectRoot = path.join(__dirname, '..');
const buildDir = path.join(projectRoot, 'build');
const publicDir = path.join(projectRoot, 'public');
const gpxPath = path.join(projectRoot, 'data', 'route.gpx');
const detailedRoutePath = path.join(projectRoot, 'data', 'route.geojson');

// Ensure directories exist
if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });

console.log('Building route tiles...\n');

// 1. Use detailed route line from KML track files
console.log('1. Using detailed route line from KML tracks...');

let routeLine;
const routeLinePath = path.join(buildDir, 'route_line.geojson');

if (fs.existsSync(detailedRoutePath)) {
  // Use the detailed route parsed from KML files
  routeLine = JSON.parse(fs.readFileSync(detailedRoutePath, 'utf8'));
  const totalPoints = routeLine.features[0].geometry.coordinates.reduce(
    (sum, line) => sum + line.length, 0
  );
  console.log(`   Using detailed route with ${totalPoints} points from KML tracks`);
} else {
  // Fallback: Create simple route line from section waypoints
  console.log('   Detailed route not found, creating simple line from sections...');
  routeLine = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {
        name: 'Oregon Desert Trail',
        length_miles: 751.1
      },
      geometry: {
        type: 'LineString',
        coordinates: sections.map(s => [s.lon, s.lat])
      }
    }]
  };
}

fs.writeFileSync(routeLinePath, JSON.stringify(routeLine));
console.log(`   Written: ${routeLinePath}`);

// 2. Parse GPX and create waypoints GeoJSON
console.log('\n2. Parsing GPX waypoints...');

const gpxContent = fs.readFileSync(gpxPath, 'utf8');

// Extract waypoints using regex (GPX is simple enough)
const wptRegex = /<wpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>.*?<name>([^<]+)<\/name>.*?<\/wpt>/gs;
const waypoints = [];
let match;

while ((match = wptRegex.exec(gpxContent)) !== null) {
  const lat = parseFloat(match[1]);
  const lon = parseFloat(match[2]);
  const name = match[3];

  // Skip alternate routes (names starting with ALT)
  if (!name.startsWith('ALT')) {
    waypoints.push({ lat, lon, name });
  }
}

console.log(`   Found ${waypoints.length} waypoints (excluding alternates)`);

const waypointsGeoJSON = {
  type: 'FeatureCollection',
  features: waypoints.map(wp => ({
    type: 'Feature',
    properties: { name: wp.name },
    geometry: {
      type: 'Point',
      coordinates: [wp.lon, wp.lat]
    }
  }))
};

const waypointsPath = path.join(buildDir, 'waypoints.geojson');
fs.writeFileSync(waypointsPath, JSON.stringify(waypointsGeoJSON));
console.log(`   Written: ${waypointsPath}`);

// 3. Create section markers GeoJSON
console.log('\n3. Creating section markers...');

const sectionsGeoJSON = {
  type: 'FeatureCollection',
  features: sections.map(s => ({
    type: 'Feature',
    properties: {
      name: s.name,
      mile: s.mile
    },
    geometry: {
      type: 'Point',
      coordinates: [s.lon, s.lat]
    }
  }))
};

const sectionsPath = path.join(buildDir, 'sections.geojson');
fs.writeFileSync(sectionsPath, JSON.stringify(sectionsGeoJSON));
console.log(`   Written: ${sectionsPath} (${sections.length} sections)`);

// 4. Run Tippecanoe to create PMTiles
console.log('\n4. Running Tippecanoe...');

const pmtilesPath = path.join(publicDir, 'route.pmtiles');

try {
  // Create PMTiles with all layers using named-layer option
  // Each file becomes its own layer
  execSync(`tippecanoe -o "${pmtilesPath}" --force --minimum-zoom=0 --maximum-zoom=13 --named-layer=route:"${routeLinePath}" --named-layer=waypoints:"${waypointsPath}" --named-layer=sections:"${sectionsPath}"`, {
    stdio: 'inherit'
  });

  const stats = fs.statSync(pmtilesPath);
  console.log(`\n✓ Created: ${pmtilesPath} (${(stats.size / 1024).toFixed(1)} KB)`);

} catch (error) {
  console.error('Error running Tippecanoe:', error.message);
  process.exit(1);
}

console.log('\nDone!');
