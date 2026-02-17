#!/usr/bin/env node
/**
 * Create a 10-mile buffer around the route for clipping contour lines.
 * This wide buffer ensures contour lines are visible across the full
 * hiking corridor — roughly matching visibility range from the trail.
 */

const fs = require('fs');
const path = require('path');
const buffer = require('@turf/buffer').default;

const projectRoot = path.join(__dirname, '..');
const buildDir = path.join(projectRoot, 'build');
const routeLinePath = path.join(buildDir, 'route_line.geojson');
const narrowBufferPath = path.join(buildDir, 'narrow_buffer.geojson');

// 10 miles = 16.09 kilometers
const BUFFER_MILES = 10;
const BUFFER_KM = BUFFER_MILES * 1.60934;

console.log(`Creating ${BUFFER_MILES}-mile buffer for contours...\n`);

// Read the route line
console.log('1. Reading route line...');
const routeGeoJSON = JSON.parse(fs.readFileSync(routeLinePath, 'utf8'));
const routeFeature = routeGeoJSON.features[0];
console.log(`   Route loaded`);

// Create buffer
console.log(`\n2. Creating ${BUFFER_MILES}-mile (${BUFFER_KM.toFixed(1)} km) buffer...`);
const buffered = buffer(routeFeature, BUFFER_KM, { units: 'kilometers' });

console.log(`   Buffer created: ${buffered.geometry.type}`);

// Create buffer GeoJSON
const bufferGeoJSON = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: {
      name: 'Contour Buffer',
      buffer_miles: BUFFER_MILES,
      buffer_km: BUFFER_KM,
      description: `${BUFFER_MILES}-mile buffer around Oregon Desert Trail for contour clipping`
    },
    geometry: buffered.geometry
  }]
};

// Write buffer GeoJSON
fs.writeFileSync(narrowBufferPath, JSON.stringify(bufferGeoJSON));
console.log(`\n✓ Buffer saved: ${narrowBufferPath}`);
console.log(`  File size: ${(fs.statSync(narrowBufferPath).size / 1024).toFixed(1)} KB`);

console.log('\nDone!');
