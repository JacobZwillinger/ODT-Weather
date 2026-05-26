#!/usr/bin/env node
/**
 * Parse NNML GPX files into route_line.geojson + alternates.geojson.
 *
 * Main sections (s1..s8) → MultiLineString in route_line.geojson.
 * Alternate sections (sNa, sNb, etc.) → individual LineString features in alternates.geojson.
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const gpxDir = path.join(projectRoot, 'public/trails/nnml/gpx');
const outDir = path.join(projectRoot, 'build/nnml');
fs.mkdirSync(outDir, { recursive: true });

// Pull every trkpt out as [lon, lat]. We split by trkseg so multi-segment tracks become multiple lines.
function extractSegments(gpx) {
  const segments = [];
  const segRegex = /<trkseg>([\s\S]*?)<\/trkseg>/g;
  let segMatch;
  while ((segMatch = segRegex.exec(gpx)) !== null) {
    const coords = [];
    const ptRegex = /<trkpt\s+lat="([-\d.]+)"\s+lon="([-\d.]+)"/g;
    let ptMatch;
    while ((ptMatch = ptRegex.exec(segMatch[1])) !== null) {
      coords.push([parseFloat(ptMatch[2]), parseFloat(ptMatch[1])]);
    }
    if (coords.length >= 2) segments.push(coords);
  }
  return segments;
}

function trackName(gpx, fallback) {
  const m = gpx.match(/<trk>[\s\S]*?<name>([^<]+)<\/name>/);
  return m ? m[1].trim() : fallback;
}

const files = fs.readdirSync(gpxDir).filter((f) => f.endsWith('.gpx')).sort();

const mainSegments = [];
const alternateFeatures = [];

// Filenames look like "s1-...", "s1a-...", "s1b-...", "s2a-..." etc.
// Main = pure digit section (no letter after the number).
const mainRe = /^s(\d+)-/;
const altRe = /^s(\d+)([a-z]+)-/;

for (const file of files) {
  const filePath = path.join(gpxDir, file);
  const gpx = fs.readFileSync(filePath, 'utf8');
  const segments = extractSegments(gpx);
  if (segments.length === 0) {
    console.warn(`  ! Skipping ${file} — no trkpt data`);
    continue;
  }
  const name = trackName(gpx, file);

  const altMatch = file.match(altRe);
  if (altMatch) {
    const section = parseInt(altMatch[1], 10);
    const variant = altMatch[2];
    const geometry = segments.length === 1
      ? { type: 'LineString', coordinates: segments[0] }
      : { type: 'MultiLineString', coordinates: segments };
    alternateFeatures.push({
      type: 'Feature',
      properties: {
        trail: 'nnml',
        name,
        file,
        section,
        variant,
        routeType: 'alternate'
      },
      geometry
    });
    console.log(`  alt  ${file} (section ${section}${variant}, ${segments.length} seg, ${segments.reduce((n, s) => n + s.length, 0)} pts)`);
  } else if (mainRe.test(file)) {
    for (const seg of segments) mainSegments.push(seg);
    console.log(`  main ${file} (${segments.length} seg, ${segments.reduce((n, s) => n + s.length, 0)} pts)`);
  } else {
    console.warn(`  ? Unrecognized filename pattern: ${file}`);
  }
}

const routeGeoJSON = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { trail: 'nnml', name: 'Northern New Mexico Loop', routeType: 'main' },
    geometry: { type: 'MultiLineString', coordinates: mainSegments }
  }]
};

const alternatesGeoJSON = {
  type: 'FeatureCollection',
  features: alternateFeatures
};

const routePath = path.join(outDir, 'route_line.geojson');
const altPath = path.join(outDir, 'alternates.geojson');
fs.writeFileSync(routePath, JSON.stringify(routeGeoJSON));
fs.writeFileSync(altPath, JSON.stringify(alternatesGeoJSON));

const totalMainPts = mainSegments.reduce((n, s) => n + s.length, 0);
console.log(`\n✓ Wrote ${routePath} (${mainSegments.length} segments, ${totalMainPts} points)`);
console.log(`✓ Wrote ${altPath} (${alternateFeatures.length} alternates)`);
