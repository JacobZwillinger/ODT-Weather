#!/usr/bin/env node
/**
 * Create a narrow buffer (500 feet = ~152 meters) around the route
 * for clipping contour lines
 */

const fs = require('fs');
const path = require('path');
const buffer = require('@turf/buffer').default;

const projectRoot = path.join(__dirname, '..');
const buildDir = path.join(projectRoot, 'build');
const routeLinePath = path.join(buildDir, 'route_line.geojson');
const narrowBufferPath = path.join(buildDir, 'narrow_buffer.geojson');

console.log('Creating narrow buffer for contours...\n');

// Read the route line
console.log('1. Reading route line...');
const routeGeoJSON = JSON.parse(fs.readFileSync(routeLinePath, 'utf8'));
const routeFeature = routeGeoJSON.features[0];
console.log(`   Route loaded`);

// Create narrow buffer - 500 feet = ~152 meters = 0.152 kilometers
console.log('\n2. Creating 500-foot (~152m) buffer...');
const bufferDistance = 0.152; // kilometers
const buffered = buffer(routeFeature, bufferDistance, { units: 'kilometers' });

console.log(`   Buffer created: ${buffered.geometry.type}`);

// Create buffer GeoJSON
const bufferGeoJSON = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: {
      name: 'Narrow Contour Buffer',
      buffer_meters: 152,
      buffer_feet: 500,
      description: '500-foot buffer around Oregon Desert Trail for contour clipping'
    },
    geometry: buffered.geometry
  }]
};

// Write buffer GeoJSON
fs.writeFileSync(narrowBufferPath, JSON.stringify(bufferGeoJSON));
console.log(`\n✓ Narrow buffer saved: ${narrowBufferPath}`);
console.log(`  File size: ${(fs.statSync(narrowBufferPath).size / 1024).toFixed(1)} KB`);

console.log('\nDone!');
