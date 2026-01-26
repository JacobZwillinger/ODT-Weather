const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

// Parse KML coordinates string to array of [lon, lat] pairs
function parseCoordinates(coordString) {
  // Handle both newline-separated and space-separated coordinates
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

// Parse a single KML file
function parseKmlFile(filePath) {
  const kmlContent = fs.readFileSync(filePath, 'utf-8');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_'
  });

  const result = parser.parse(kmlContent);
  const placemarks = result.kml.Document.Folder.Placemark;

  // Handle both single placemark and array of placemarks
  const placemarksArray = Array.isArray(placemarks) ? placemarks : [placemarks];

  const features = [];

  placemarksArray.forEach(placemark => {
    let lineStrings = [];

    // Check for direct LineString
    if (placemark.LineString && placemark.LineString.coordinates) {
      lineStrings.push(placemark.LineString);
    }

    // Check for LineString inside MultiGeometry
    if (placemark.MultiGeometry && placemark.MultiGeometry.LineString) {
      const multiLineStrings = Array.isArray(placemark.MultiGeometry.LineString)
        ? placemark.MultiGeometry.LineString
        : [placemark.MultiGeometry.LineString];
      lineStrings = lineStrings.concat(multiLineStrings);
    }

    // Process all LineStrings found
    lineStrings.forEach(lineString => {
      if (lineString.coordinates) {
        const coordinates = parseCoordinates(lineString.coordinates);

        if (coordinates.length > 0) {
          features.push({
            type: 'Feature',
            properties: {
              name: placemark.name || 'Unnamed Track',
              description: placemark.description || ''
            },
            geometry: {
              type: 'LineString',
              coordinates: coordinates
            }
          });
        }
      }
    });
  });

  return features;
}

// Main execution
function main() {
  const trackFilesDir = path.join(__dirname, '..', 'Track Files');
  const kmlFiles = [
    'Region 1 Track.kml',
    'Region 2 Track.kml',
    'Region 3 Track.kml',
    'Region 4 Track.kml'
  ];

  let allFeatures = [];

  kmlFiles.forEach(filename => {
    const filePath = path.join(trackFilesDir, filename);
    console.log(`Parsing ${filename}...`);

    try {
      const features = parseKmlFile(filePath);
      console.log(`  Found ${features.length} track(s) with ${features.reduce((sum, f) => sum + f.geometry.coordinates.length, 0)} total points`);
      allFeatures = allFeatures.concat(features);
    } catch (error) {
      console.error(`  Error parsing ${filename}:`, error.message);
    }
  });

  // Create a single MultiLineString feature for the entire route
  const routeFeature = {
    type: 'Feature',
    properties: {
      name: 'Oregon Desert Trail',
      type: 'route'
    },
    geometry: {
      type: 'MultiLineString',
      coordinates: allFeatures.map(f => f.geometry.coordinates)
    }
  };

  const geojson = {
    type: 'FeatureCollection',
    features: [routeFeature]
  };

  // Write the GeoJSON file
  const outputPath = path.join(__dirname, '..', 'data', 'route.geojson');
  fs.writeFileSync(outputPath, JSON.stringify(geojson, null, 2));

  console.log(`\nCreated route.geojson with ${allFeatures.length} segments and ${routeFeature.geometry.coordinates.reduce((sum, line) => sum + line.length, 0)} total points`);
  console.log(`Output: ${outputPath}`);
}

main();
