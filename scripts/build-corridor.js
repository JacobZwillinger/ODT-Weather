#!/usr/bin/env node
/**
 * Build corridor polygon around the route + alternates
 *
 * Creates a 5km buffer on each side of all routes using ogr2ogr
 * for memory-efficient processing of large geometries.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const bbox = require('@turf/bbox').default;

const projectRoot = path.join(__dirname, '..');
const buildDir = path.join(projectRoot, 'build');
const routeLinePath = path.join(buildDir, 'route_line.geojson');
const alternatesPath = path.join(buildDir, 'alternates.geojson');
const corridorPath = path.join(buildDir, 'corridor.geojson');
const bboxPath = path.join(buildDir, 'route_bbox.json');
const tmpCombined = '/tmp/odt-combined-lines.geojson';
const tmpBuffered = '/tmp/odt-buffered-corridor.geojson';

console.log('Building corridor around route + alternates...\n');

// Read the route line
console.log('1. Reading route line...');
const routeGeoJSON = JSON.parse(fs.readFileSync(routeLinePath, 'utf8'));
const routeFeature = routeGeoJSON.features[0];
let lineCount = 0;
if (routeFeature.geometry.type === 'MultiLineString') {
  lineCount = routeFeature.geometry.coordinates.length;
} else if (routeFeature.geometry.type === 'LineString') {
  lineCount = 1;
}
console.log(`   Route: ${lineCount} segment(s)`);

// Read alternates
console.log('\n2. Reading alternates...');
const alternatesGeoJSON = JSON.parse(fs.readFileSync(alternatesPath, 'utf8'));
console.log(`   Alternates: ${alternatesGeoJSON.features.length} routes`);

// Merge route and alternates into a single GeoJSON file for ogr2ogr
console.log('\n3. Merging route + alternates...');
const combined = {
  type: 'FeatureCollection',
  features: [...routeGeoJSON.features, ...alternatesGeoJSON.features]
};
fs.writeFileSync(tmpCombined, JSON.stringify(combined));
const combinedSize = (fs.statSync(tmpCombined).size / 1024).toFixed(0);
console.log(`   Combined: ${combinedSize} KB (${combined.features.length} features)`);

// Buffer 5km ≈ 0.045 degrees latitude
// Union all buffered geometries into one polygon using ogr2ogr SQLite dialect
const BUFFER_DEG = 0.045; // ~5km
console.log(`\n4. Buffering (${BUFFER_DEG}° ≈ 5km) and unioning via ogr2ogr...`);
execSync(
  `ogr2ogr -f GeoJSON -overwrite ${tmpBuffered} ${tmpCombined} ` +
  `-dialect SQLite -sql "SELECT ST_Union(ST_Buffer(geometry, ${BUFFER_DEG})) AS geometry FROM \\"odt-combined-lines\\""`,
  { stdio: 'inherit' }
);
console.log('   Buffer complete');

// Load the buffered polygon to extract its geometry and bbox
const bufferedGeoJSON = JSON.parse(fs.readFileSync(tmpBuffered, 'utf8'));
const bufferedFeature = bufferedGeoJSON.features[0];

// Create corridor GeoJSON with metadata
const corridorGeoJSON = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: {
      name: 'ODT Corridor',
      buffer_km: 5,
      description: '5km buffer around Oregon Desert Trail + alternates'
    },
    geometry: bufferedFeature.geometry
  }]
};

// Calculate bounding box
console.log('\n5. Calculating bounding box...');
const bounds = bbox(bufferedFeature);
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

// Cleanup temp files
fs.unlinkSync(tmpCombined);
fs.unlinkSync(tmpBuffered);

console.log('\nDone!');
