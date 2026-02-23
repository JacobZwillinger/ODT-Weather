const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

// Parse KML coordinates string to array of [lon, lat] pairs
function parseCoordinates(coordString) {
  const normalized = coordString.trim().replace(/\s+/g, '\n');
  return normalized
    .split('\n')
    .map(coord => {
      const parts = coord.trim().split(',');
      if (parts.length >= 2) {
        return [parseFloat(parts[0]), parseFloat(parts[1])];
      }
      return null;
    })
    .filter(coord => coord && !isNaN(coord[0]) && !isNaN(coord[1]));
}

// Parse All_ODT_Alternates.kml and return GeoJSON features
// The KML has two folders: "Markers" (1 Point) and "Lines and Polygons" (68 LineStrings)
function parseAlternatesKml(filePath) {
  const kmlContent = fs.readFileSync(filePath, 'utf-8');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_'
  });

  const result = parser.parse(kmlContent);
  const folders = result.kml.Document.Folder;

  // Folders may be a single object or an array
  const foldersArray = Array.isArray(folders) ? folders : [folders];

  const features = [];

  for (const folder of foldersArray) {
    const placemarks = folder.Placemark;
    if (!placemarks) continue;

    // Placemarks may be a single object or an array
    const placemarksArray = Array.isArray(placemarks) ? placemarks : [placemarks];

    for (const pm of placemarksArray) {
      // Skip Points (the "Markers" folder contains a Point warning marker)
      if (!pm.LineString) continue;

      const coords = parseCoordinates(pm.LineString.coordinates);
      if (coords.length > 0) {
        features.push({
          type: 'Feature',
          properties: {
            name: pm.name || 'Alternate Route'
          },
          geometry: {
            type: 'LineString',
            coordinates: coords
          }
        });
      }
    }
  }

  return features;
}

module.exports = { parseAlternatesKml };

// Run directly: node scripts/parse-alternates.js
if (require.main === module) {
  const kmlPath = path.join(__dirname, '..', 'Track Files', 'All_ODT_Alternates.kml');
  const features = parseAlternatesKml(kmlPath);
  console.log(`Found ${features.length} alternate route segments`);

  const out = path.join(__dirname, '..', 'build', 'alternates.geojson');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ type: 'FeatureCollection', features }));
  console.log(`Written: ${out}`);
}
