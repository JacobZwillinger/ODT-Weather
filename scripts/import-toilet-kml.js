#!/usr/bin/env node
/**
 * Import pit toilet waypoints from KML into public/toilets.json
 *
 * Parses Track Files/ODT pit toilets.kml (Point placemarks),
 * finds the nearest trail mile for each point using waypoints.json,
 * and writes the results to public/toilets.json.
 *
 * Run: node scripts/import-toilet-kml.js
 */

const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

const projectRoot = path.join(__dirname, '..');

// Haversine distance in km between two lat/lon points
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Find the nearest waypoint (by Haversine distance) and return its mile
function findNearestMile(lat, lon, waypoints) {
  let best = null;
  let bestDist = Infinity;
  for (const wp of waypoints) {
    const d = haversineKm(lat, lon, wp.lat, wp.lon);
    if (d < bestDist) {
      bestDist = d;
      best = wp;
    }
  }
  return { mile: best.mile, distKm: bestDist, nearestName: best.name };
}

// Parse the KML
const kmlPath = path.join(projectRoot, 'Track Files', 'ODT pit toilets.kml');
const kmlContent = fs.readFileSync(kmlPath, 'utf-8');
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
const result = parser.parse(kmlContent);

const folder = result.kml.Document.Folder;
const placemarks = folder.Placemark;
const placemarksArr = Array.isArray(placemarks) ? placemarks : [placemarks];

// Load waypoints for nearest-mile lookup
// Filter out ALT-prefixed alternate-route waypoints — they may have incorrect mile values
const allWaypoints = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'public', 'waypoints.json'), 'utf-8')
);
const waypoints = allWaypoints.filter(wp => !wp.name.startsWith('ALT'));

const toilets = [];

for (const pm of placemarksArr) {
  if (!pm.Point) continue; // skip any non-Point placemarks

  const coordStr = pm.Point.coordinates.trim();
  const parts = coordStr.split(',').map(Number);
  const lon = parts[0];
  const lat = parts[1];

  const { mile, distKm, nearestName } = findNearestMile(lat, lon, waypoints);

  const name = (pm.name || 'Pit Toilet').trim();
  const description = pm.description ? String(pm.description).trim() : '';

  toilets.push({
    mile: parseFloat(mile.toFixed(1)),
    lat,
    lon,
    name,
    landmark: description,
    subcategory: ''
  });

  console.log(`  Mile ${mile.toFixed(1)}: ${name}${description ? ' (' + description + ')' : ''} [${distKm.toFixed(2)} km from ${nearestName}]`);
}

// Sort by mile
toilets.sort((a, b) => a.mile - b.mile);

const outPath = path.join(projectRoot, 'public', 'toilets.json');
fs.writeFileSync(outPath, JSON.stringify(toilets, null, 2));
console.log(`\nWritten ${toilets.length} toilets to ${outPath}`);
