#!/usr/bin/env node
/**
 * Generate elevation profile by interpolating between section waypoints
 * and sampling actual DEM elevation at each point
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.join(__dirname, '..');
const buildDir = path.join(projectRoot, 'build');
const sectionsPath = path.join(buildDir, 'sections.geojson');
const demPath = path.join(projectRoot, 'data', 'corridor_dem.tif');
const outputPath = path.join(projectRoot, 'public', 'elevation-profile.json');
const TRAIL_END_MILE = 751.1;

console.log('Generating elevation profile from section waypoints...\n');

// Check if DEM exists
if (!fs.existsSync(demPath)) {
  console.error('Error: DEM file not found:', demPath);
  console.error('Run ./scripts/build-contours.sh first to download DEM data');
  process.exit(1);
}

// Read section waypoints
console.log('1. Reading section waypoints...');
const sections = JSON.parse(fs.readFileSync(sectionsPath, 'utf8'));
const waypoints = sections.features.map(f => ({
  mile: f.properties.mile,
  lon: f.geometry.coordinates[0],
  lat: f.geometry.coordinates[1],
  name: f.properties.name
}));

// Add trail end point (interpolate from last waypoint)
const lastWaypoint = waypoints[waypoints.length - 1];
const secondLastWaypoint = waypoints[waypoints.length - 2];
const endLon = lastWaypoint.lon + (lastWaypoint.lon - secondLastWaypoint.lon) *
  ((TRAIL_END_MILE - lastWaypoint.mile) / (lastWaypoint.mile - secondLastWaypoint.mile));
const endLat = lastWaypoint.lat + (lastWaypoint.lat - secondLastWaypoint.lat) *
  ((TRAIL_END_MILE - lastWaypoint.mile) / (lastWaypoint.mile - secondLastWaypoint.mile));

waypoints.push({
  mile: TRAIL_END_MILE,
  lon: endLon,
  lat: endLat,
  name: 'Trail End'
});

console.log(`   Found ${waypoints.length} waypoints from mile 0 to ${TRAIL_END_MILE}`);

// Generate interpolated GPS coordinates every 0.1 miles
console.log('\n2. Interpolating GPS coordinates...');
const points = [];
const POINTS_PER_MILE = 10; // Every 0.1 miles

for (let i = 0; i < waypoints.length - 1; i++) {
  const start = waypoints[i];
  const end = waypoints[i + 1];
  const distance = end.mile - start.mile;
  const numPoints = Math.ceil(distance * POINTS_PER_MILE);

  for (let j = 0; j < numPoints; j++) {
    const ratio = j / numPoints;
    const mile = start.mile + (distance * ratio);
    const lon = start.lon + (end.lon - start.lon) * ratio;
    const lat = start.lat + (end.lat - start.lat) * ratio;

    points.push({
      mile: Math.round(mile * 10) / 10,
      lon,
      lat
    });
  }
}

// Add final point
const finalWaypoint = waypoints[waypoints.length - 1];
points.push({
  mile: TRAIL_END_MILE,
  lon: finalWaypoint.lon,
  lat: finalWaypoint.lat
});

console.log(`   Generated ${points.length} interpolated GPS points`);

// Sample elevation from DEM for all points in batches
console.log('\n3. Sampling elevations from DEM...');
console.log('   This may take a couple minutes...');

const elevations = [];
const BATCH_SIZE = 500;
const tempCoordsFile = path.join(buildDir, 'temp_section_coords.txt');

try {
  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    const batch = points.slice(i, Math.min(i + BATCH_SIZE, points.length));
    const coordsText = batch.map(p => `${p.lon} ${p.lat}`).join('\n');
    fs.writeFileSync(tempCoordsFile, coordsText);

    try {
      const result = execSync(
        `gdallocationinfo -valonly -geoloc "${demPath}" < "${tempCoordsFile}"`,
        { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
      );

      const batchElevations = result.trim().split('\n').map(line => {
        const elev = parseFloat(line);
        return isNaN(elev) ? 0 : Math.round(elev * 3.28084); // Convert meters to feet
      });

      elevations.push(...batchElevations);
    } catch (batchError) {
      // If batch fails, sample points individually
      console.log(`\n   Warning: Batch failed at point ${i}, sampling individually...`);
      for (const point of batch) {
        try {
          const singleResult = execSync(
            `echo "${point.lon} ${point.lat}" | gdallocationinfo -valonly -geoloc "${demPath}"`,
            { encoding: 'utf8' }
          );
          const elev = parseFloat(singleResult.trim());
          elevations.push(isNaN(elev) ? 0 : Math.round(elev * 3.28084));
        } catch (singleError) {
          // Point outside DEM bounds, use 0
          elevations.push(0);
        }
      }
    }

    const progress = Math.round((i + batch.length) / points.length * 100);
    process.stdout.write(`   Sampling... ${progress}% (${i + batch.length}/${points.length} points)\r`);
  }

  console.log(`\n   ✓ Sampled ${elevations.length} elevation points`);

  // Clean up temp file
  if (fs.existsSync(tempCoordsFile)) {
    fs.unlinkSync(tempCoordsFile);
  }

  // Create elevation profile
  const profile = points.map((point, i) => ({
    lon: point.lon,
    lat: point.lat,
    distance: point.mile,
    elevation: elevations[i]
  }));

  // Write output
  fs.writeFileSync(outputPath, JSON.stringify(profile));

  console.log(`\n✓ Elevation profile saved: ${outputPath}`);
  console.log(`  Points: ${profile.length}`);
  console.log(`  Distance: 0 - ${TRAIL_END_MILE} miles`);
  console.log(`  Elevation range: ${Math.min(...elevations)} - ${Math.max(...elevations)} feet`);
  console.log(`  File size: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`);

  // Verify some key sections
  console.log('\n✓ Sample data verification:');
  const samples = [0, 92, 246, 250, 500, 750];
  samples.forEach(mile => {
    const point = profile.find(p => Math.abs(p.distance - mile) < 0.5);
    if (point) {
      console.log(`  Mile ${mile}: ${point.elevation} ft`);
    }
  });

} catch (error) {
  console.error('\nError sampling elevations:', error.message);
  process.exit(1);
}

console.log('\nDone!');
