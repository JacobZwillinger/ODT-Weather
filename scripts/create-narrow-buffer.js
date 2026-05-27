#!/usr/bin/env node
/**
 * Create a 10-mile buffer around the route + alternates for clipping contour lines.
 * Uses ogr2ogr for memory-efficient processing of large geometries.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.join(__dirname, '..');
const buildDir = path.join(projectRoot, 'build');

// Per-trail layout: --trail nnml writes/reads build/nnml/. Default (odt) writes/reads build/.
const trailArgIdx = process.argv.indexOf('--trail');
const trail = trailArgIdx !== -1 ? process.argv[trailArgIdx + 1] : 'odt';
const trailBuildDir = trail === 'odt' ? buildDir : path.join(buildDir, trail);
fs.mkdirSync(trailBuildDir, { recursive: true });

const routeLinePath = path.join(trailBuildDir, 'route_line.geojson');
const alternatesPath = path.join(trailBuildDir, 'alternates.geojson');
const narrowBufferPath = path.join(trailBuildDir, 'narrow_buffer.geojson');
const tmpCombined = `/tmp/${trail}-combined-for-buffer.geojson`;
const tmpProjected = `/tmp/${trail}-combined-for-buffer-5070.geojson`;
const tmpBufferedProjected = `/tmp/${trail}-narrow-buffer-5070.geojson`;
const tmpBuffered = `/tmp/${trail}-narrow-buffer.geojson`;
const sqlLayerName = `${trail}-combined-for-buffer`;

const BUFFER_MILES = 10;
const BUFFER_METERS = BUFFER_MILES * 1609.344;

console.log(`Creating ${BUFFER_MILES}-mile buffer for contours (route + alternates)...\n`);

for (const tmpPath of [tmpCombined, tmpProjected, tmpBufferedProjected, tmpBuffered]) {
  if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
}

// Read route line
console.log('1. Reading route line...');
const routeGeoJSON = JSON.parse(fs.readFileSync(routeLinePath, 'utf8'));
console.log(`   Route loaded`);

// Read alternates
console.log('\n2. Reading alternates...');
const alternatesGeoJSON = JSON.parse(fs.readFileSync(alternatesPath, 'utf8'));
console.log(`   Alternates: ${alternatesGeoJSON.features.length} routes`);

// Merge route and alternates into a single GeoJSON
console.log('\n3. Merging route + alternates...');
const combined = {
  type: 'FeatureCollection',
  features: [...routeGeoJSON.features, ...alternatesGeoJSON.features]
};
fs.writeFileSync(tmpCombined, JSON.stringify(combined));
const combinedSize = (fs.statSync(tmpCombined).size / 1024).toFixed(0);
console.log(`   Combined: ${combinedSize} KB (${combined.features.length} features)`);

// Project to CONUS Albers so the buffer is measured in meters, not degrees.
console.log('\n4. Projecting to EPSG:5070 for true-distance buffering...');
execSync(
  `ogr2ogr -f GeoJSON -overwrite -t_srs EPSG:5070 ${tmpProjected} ${tmpCombined}`,
  { stdio: 'inherit' }
);

// Buffer and union via ogr2ogr SQLite dialect
console.log(`\n5. Buffering (${BUFFER_METERS.toFixed(0)}m = ${BUFFER_MILES} miles) and unioning via ogr2ogr...`);
execSync(
  `ogr2ogr -f GeoJSON -overwrite ${tmpBufferedProjected} ${tmpProjected} ` +
  `-dialect SQLite -sql "SELECT ST_Union(ST_Buffer(geometry, ${BUFFER_METERS})) AS geometry FROM \\"${sqlLayerName}\\""`,
  { stdio: 'inherit' }
);

console.log('\n6. Reprojecting buffer back to WGS84...');
execSync(
  `ogr2ogr -f GeoJSON -overwrite -t_srs EPSG:4326 ${tmpBuffered} ${tmpBufferedProjected}`,
  { stdio: 'inherit' }
);
console.log('   Buffer complete');

// Load buffered polygon and create output GeoJSON with metadata
const bufferedGeoJSON = JSON.parse(fs.readFileSync(tmpBuffered, 'utf8'));
const bufferedFeature = bufferedGeoJSON.features[0];

const bufferGeoJSON = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: {
      name: `${trail.toUpperCase()} Contour Buffer`,
      trail,
      buffer_miles: BUFFER_MILES,
      buffer_meters: BUFFER_METERS,
      buffer_crs: 'EPSG:5070',
      description: `${BUFFER_MILES}-mile buffer around ${trail.toUpperCase()} route + alternates for contour clipping`
    },
    geometry: bufferedFeature.geometry
  }]
};

// Write buffer GeoJSON
fs.writeFileSync(narrowBufferPath, JSON.stringify(bufferGeoJSON));
console.log(`\n✓ Buffer saved: ${narrowBufferPath}`);
console.log(`  File size: ${(fs.statSync(narrowBufferPath).size / 1024).toFixed(1)} KB`);

// Cleanup temp files
for (const tmpPath of [tmpCombined, tmpProjected, tmpBufferedProjected, tmpBuffered]) {
  if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
}

console.log('\nDone!');
