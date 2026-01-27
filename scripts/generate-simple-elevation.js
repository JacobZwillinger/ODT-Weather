#!/usr/bin/env node
/**
 * Generate elevation profile using evenly-spaced sampling along the trail
 * Uses the old elevation profile data but redistributes it to match the 751-mile trail
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const oldProfilePath = path.join(projectRoot, 'public', 'elevation-profile.json');
const outputPath = path.join(projectRoot, 'public', 'elevation-profile.json.new');

console.log('Generating simplified elevation profile...\n');

// Read the old profile
console.log('1. Reading old elevation profile...');
const oldProfile = JSON.parse(fs.readFileSync(oldProfilePath, 'utf8'));
console.log(`   Found ${oldProfile.length} points covering 0-${oldProfile[oldProfile.length-1].distance.toFixed(1)} miles`);

// Create a lookup function for elevation at any distance
function getElevationAtDistance(distance) {
  // Find the two points that bracket this distance
  for (let i = 0; i < oldProfile.length - 1; i++) {
    if (oldProfile[i].distance <= distance && oldProfile[i+1].distance >= distance) {
      // Linear interpolation between the two points
      const t = (distance - oldProfile[i].distance) / (oldProfile[i+1].distance - oldProfile[i].distance);
      return Math.round(oldProfile[i].elevation + t * (oldProfile[i+1].elevation - oldProfile[i].elevation));
    }
  }
  // If distance is beyond the data, return last known elevation
  return oldProfile[oldProfile.length - 1].elevation;
}

// Generate new profile with points every 0.1 miles from 0 to 751.1
console.log('\n2. Generating new profile (0-751.1 miles)...');
const TRAIL_LENGTH = 751.1;
const POINTS_PER_MILE = 10;
const newProfile = [];

for (let mile = 0; mile <= TRAIL_LENGTH; mile += 0.1) {
  // For each mile marker, find the corresponding location in the old profile
  const elevation = getElevationAtDistance(mile);

  // Use interpolated lat/lon (not perfect but good enough for elevation display)
  let lat = 43.0, lon = -119.0;  // Default fallback

  // Try to find nearby point in old profile for lat/lon
  const nearbyPoint = oldProfile.find(p => Math.abs(p.distance - mile) < 0.5);
  if (nearbyPoint) {
    lat = nearbyPoint.lat;
    lon = nearbyPoint.lon;
  }

  newProfile.push({
    lon,
    lat,
    distance: Math.round(mile * 10) / 10,  // Round to 0.1 precision
    elevation
  });
}

console.log(`   Generated ${newProfile.length} points`);

// Write output
fs.writeFileSync(outputPath, JSON.stringify(newProfile));

console.log(`\n✓ New elevation profile saved: ${outputPath}`);
console.log(`  Points: ${newProfile.length}`);
console.log(`  Distance: 0 - ${newProfile[newProfile.length-1].distance} miles`);

const elevations = newProfile.map(p => p.elevation);
console.log(`  Elevation range: ${Math.min(...elevations)} - ${Math.max(...elevations)} feet`);
console.log(`  File size: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`);

console.log('\nDone! Review the new file and replace elevation-profile.json if it looks good.');
