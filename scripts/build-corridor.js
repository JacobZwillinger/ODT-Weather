#!/usr/bin/env node
/**
 * Build corridor polygon around the route
 *
 * Creates a 5km (1 mile = ~1.6km, so ~3 miles) buffer on each side of the route line
 * for offline basemap generation.
 */

const fs = require('fs');
const path = require('path');
const buffer = require('@turf/buffer').default;
const bbox = require('@turf/bbox').default;

const projectRoot = path.join(__dirname, '..');
const buildDir = path.join(projectRoot, 'build');
const routeLinePath = path.join(buildDir, 'route_line.geojson');
const corridorPath = path.join(buildDir, 'corridor.geojson');
const bboxPath = path.join(buildDir, 'route_bbox.json');

console.log('Building corridor around route...\n');

// Read the route line
console.log('1. Reading route line...');
const routeGeoJSON = JSON.parse(fs.readFileSync(routeLinePath, 'utf8'));
console.log(`   Found ${routeGeoJSON.features.length} feature(s)`);

// Extract the route geometry
// Handle both MultiLineString and single LineString
let routeFeature = routeGeoJSON.features[0];

// Count total points
let totalPoints = 0;
if (routeFeature.geometry.type === 'MultiLineString') {
  totalPoints = routeFeature.geometry.coordinates.reduce((sum, line) => sum + line.length, 0);
} else if (routeFeature.geometry.type === 'LineString') {
  totalPoints = routeFeature.geometry.coordinates.length;
}
console.log(`   Route has ${totalPoints} points`);

// Create buffer - 5km = 5 kilometers
console.log('\n2. Creating 5km buffer...');
const bufferDistance = 5; // kilometers
const buffered = buffer(routeFeature, bufferDistance, { units: 'kilometers' });

console.log(`   Buffer created: ${buffered.geometry.type}`);

// Create corridor GeoJSON
const corridorGeoJSON = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: {
      name: 'ODT Corridor',
      buffer_km: bufferDistance,
      description: `${bufferDistance}km buffer around Oregon Desert Trail`
    },
    geometry: buffered.geometry
  }]
};

// Calculate bounding box
console.log('\n3. Calculating bounding box...');
const bounds = bbox(buffered);
const bboxInfo = {
  bbox: bounds,
  west: bounds[0],
  south: bounds[1],
  east: bounds[2],
  north: bounds[3],
  center: [
    (bounds[0] + bounds[2]) / 2,
    (bounds[1] + bounds[3]) / 2
  ],
  width_degrees: bounds[2] - bounds[0],
  height_degrees: bounds[3] - bounds[1]
};

console.log(`   Bounding box: [${bounds.join(', ')}]`);
console.log(`   Center: [${bboxInfo.center.join(', ')}]`);
console.log(`   Size: ${bboxInfo.width_degrees.toFixed(2)}° × ${bboxInfo.height_degrees.toFixed(2)}°`);

// Write corridor GeoJSON
fs.writeFileSync(corridorPath, JSON.stringify(corridorGeoJSON));
console.log(`\n✓ Corridor saved: ${corridorPath}`);
console.log(`  File size: ${(fs.statSync(corridorPath).size / 1024).toFixed(1)} KB`);

// Write bounding box
fs.writeFileSync(bboxPath, JSON.stringify(bboxInfo, null, 2));
console.log(`\n✓ Bounding box saved: ${bboxPath}`);

console.log('\nDone!');
