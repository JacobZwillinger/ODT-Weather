#!/usr/bin/env node
/**
 * Extract elevation profile from route line using SRTM DEM data
 * Samples elevation at each coordinate point along the route
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.join(__dirname, '..');
const buildDir = path.join(projectRoot, 'build');
const routeLinePath = path.join(buildDir, 'route_line.geojson');
const demPath = path.join(projectRoot, 'data', 'corridor_dem.tif');
const outputPath = path.join(projectRoot, 'public', 'elevation-profile.json');

console.log('Extracting elevation profile from route...\n');

// Check if DEM exists
if (!fs.existsSync(demPath)) {
  console.error('Error: DEM file not found:', demPath);
  console.error('Run ./scripts/build-contours.sh first to download DEM data');
  process.exit(1);
}

// Read route line
console.log('1. Reading route line...');
const routeGeoJSON = JSON.parse(fs.readFileSync(routeLinePath, 'utf8'));
const geometry = routeGeoJSON.features[0].geometry;

// Extract all coordinates from MultiLineString
let allCoords = [];
if (geometry.type === 'MultiLineString') {
  geometry.coordinates.forEach(line => {
    allCoords = allCoords.concat(line);
  });
} else if (geometry.type === 'LineString') {
  allCoords = geometry.coordinates;
}

console.log(`   Found ${allCoords.length} coordinate points`);

// Calculate cumulative distance along route
console.log('\n2. Calculating distances...');
const toRadians = (deg) => deg * Math.PI / 180;
const haversine = (lon1, lat1, lon2, lat2) => {
  const R = 3958.8; // Earth radius in miles
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

let cumulativeDistance = 0;
const distances = [0];

for (let i = 1; i < allCoords.length; i++) {
  const [lon1, lat1] = allCoords[i - 1];
  const [lon2, lat2] = allCoords[i];
  const segmentDist = haversine(lon1, lat1, lon2, lat2);
  cumulativeDistance += segmentDist;
  distances.push(cumulativeDistance);
}

console.log(`   Total distance: ${cumulativeDistance.toFixed(2)} miles`);

// Sample elevations from DEM for all coordinates
console.log('\n3. Sampling elevations from DEM...');
console.log('   This may take a minute...');

// Create temporary file with all coordinates
const tempCoordsFile = path.join(buildDir, 'temp_coords.txt');
const coordsText = allCoords.map(([lon, lat]) => `${lon} ${lat}`).join('\n');
fs.writeFileSync(tempCoordsFile, coordsText);

// Use gdallocationinfo to query elevation at each point
// This is much faster than querying individually
try {
  const result = execSync(
    `gdallocationinfo -valonly -geoloc "${demPath}" < "${tempCoordsFile}"`,
    { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
  );

  const elevations = result.trim().split('\n').map(line => {
    const elev = parseFloat(line);
    return isNaN(elev) ? 0 : Math.round(elev * 3.28084); // Convert meters to feet
  });

  console.log(`   Sampled ${elevations.length} elevation points`);

  // Clean up temp file
  fs.unlinkSync(tempCoordsFile);

  // Create elevation profile data
  const profile = allCoords.map((coord, i) => ({
    lon: coord[0],
    lat: coord[1],
    distance: distances[i],
    elevation: elevations[i]
  }));

  // Write output
  fs.writeFileSync(outputPath, JSON.stringify(profile));

  console.log(`\n✓ Elevation profile saved: ${outputPath}`);
  console.log(`  Points: ${profile.length}`);
  console.log(`  Distance: ${cumulativeDistance.toFixed(2)} miles`);
  console.log(`  Elevation range: ${Math.min(...elevations)} - ${Math.max(...elevations)} feet`);
  console.log(`  File size: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`);

} catch (error) {
  console.error('Error sampling elevations:', error.message);
  console.error('\nTry an alternative approach: sampling fewer points');
  process.exit(1);
}

console.log('\nDone!');
