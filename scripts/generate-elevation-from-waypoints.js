#!/usr/bin/env node
/**
 * Generate elevation profile using water source waypoints and interpolation
 * This creates a continuous 751-mile profile by interpolating between known points
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.join(__dirname, '..');
const waterDataPath = path.join(projectRoot, 'public', 'water-data.js');
const demPath = path.join(projectRoot, 'data', 'corridor_dem.tif');
const outputPath = path.join(projectRoot, 'public', 'elevation-profile.json');

console.log('Generating elevation profile from waypoints...\n');

// Check if DEM exists
if (!fs.existsSync(demPath)) {
  console.error('Error: DEM file not found:', demPath);
  console.error('Run ./scripts/build-contours.sh first to download DEM data');
  process.exit(1);
}

// Read and parse water-data.js to extract water sources
console.log('1. Reading water sources...');
const waterDataContent = fs.readFileSync(waterDataPath, 'utf8');
const waterSourcesMatch = waterDataContent.match(/const waterSources = (\[[\s\S]*?\]);/);
if (!waterSourcesMatch) {
  console.error('Error: Could not parse waterSources from water-data.js');
  process.exit(1);
}

const waterSources = eval(waterSourcesMatch[1]);
console.log(`   Found ${waterSources.length} water sources`);
console.log(`   Mile range: ${waterSources[0].mile.toFixed(1)} - ${waterSources[waterSources.length-1].mile.toFixed(1)}`);

// Sample elevation at each water source
console.log('\n2. Sampling elevations at water sources...');
const waterWithElevation = [];
let sampledCount = 0;

for (const source of waterSources) {
  if (source.lat && source.lon) {
    try {
      const result = execSync(
        `gdallocationinfo -valonly -geoloc "${demPath}" ${source.lon} ${source.lat}`,
        { encoding: 'utf8' }
      );
      const elevMeters = parseFloat(result.trim());
      const elevFeet = Math.round(elevMeters * 3.28084);

      waterWithElevation.push({
        mile: source.mile,
        lat: source.lat,
        lon: source.lon,
        elevation: elevFeet
      });
      sampledCount++;

      if (sampledCount % 50 === 0) {
        process.stdout.write(`   Sampled ${sampledCount}/${waterSources.length} points...\r`);
      }
    } catch (error) {
      console.warn(`   Warning: Could not get elevation for water source at mile ${source.mile}`);
    }
  }
}

console.log(`\n   ✓ Sampled ${sampledCount} water sources with elevation`);

// Generate interpolated points between water sources
console.log('\n3. Interpolating elevation points...');
const profile = [];
const pointsPerMile = 10; // Generate 10 points per mile for smooth chart

for (let i = 0; i < waterWithElevation.length - 1; i++) {
  const start = waterWithElevation[i];
  const end = waterWithElevation[i + 1];
  const distance = end.mile - start.mile;
  const numPoints = Math.max(2, Math.round(distance * pointsPerMile));

  for (let j = 0; j < numPoints; j++) {
    const ratio = j / numPoints;
    const mile = start.mile + (distance * ratio);
    const lat = start.lat + (end.lat - start.lat) * ratio;
    const lon = start.lon + (end.lon - start.lon) * ratio;
    const elevation = Math.round(start.elevation + (end.elevation - start.elevation) * ratio);

    profile.push({ mile, lat, lon, elevation, distance: mile });
  }
}

// Add final point
const lastSource = waterWithElevation[waterWithElevation.length - 1];
profile.push({
  mile: lastSource.mile,
  lat: lastSource.lat,
  lon: lastSource.lon,
  elevation: lastSource.elevation,
  distance: lastSource.mile
});

console.log(`   ✓ Generated ${profile.length} interpolated points`);

// Write output
fs.writeFileSync(outputPath, JSON.stringify(profile));

console.log(`\n✓ Elevation profile saved: ${outputPath}`);
console.log(`  Points: ${profile.length}`);
console.log(`  Distance: 0 - ${profile[profile.length-1].distance.toFixed(1)} miles`);

const elevations = profile.map(p => p.elevation);
console.log(`  Elevation range: ${Math.min(...elevations)} - ${Math.max(...elevations)} feet`);
console.log(`  File size: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`);

console.log('\nDone!');
