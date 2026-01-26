const fs = require('fs');
const path = require('path');

// Read PMTiles header
const pmtilesFile = process.argv[2] || 'basemap.pmtiles';
const pmtilesPath = path.join(__dirname, '..', 'dist', pmtilesFile);
const fd = fs.openSync(pmtilesPath, 'r');

// Read first 127 bytes (PMTiles v3 header)
const headerBuffer = Buffer.alloc(127);
fs.readSync(fd, headerBuffer, 0, 127, 0);

// Check magic number
const magic = headerBuffer.toString('utf8', 0, 7);
console.log('Magic:', magic);

if (magic !== 'PMTiles') {
  console.log('ERROR: Not a valid PMTiles file!');
  console.log('First bytes:', headerBuffer.slice(0, 20));
  process.exit(1);
}

// Read version
const version = headerBuffer.readUInt8(7);
console.log('Version:', version);

// Read metadata offset and length
const metadataOffset = Number(headerBuffer.readBigUInt64LE(36));
const metadataLength = Number(headerBuffer.readBigUInt64LE(44));

console.log('Metadata offset:', metadataOffset);
console.log('Metadata length:', metadataLength);

if (metadataLength > 0) {
  // Read metadata JSON
  const metadataBuffer = Buffer.alloc(metadataLength);
  fs.readSync(fd, metadataBuffer, 0, metadataLength, metadataOffset);

  const metadata = JSON.parse(metadataBuffer.toString('utf8'));
  console.log('\nMetadata:');
  console.log(JSON.stringify(metadata, null, 2));

  if (metadata.vector_layers) {
    console.log('\nVector Layers Found:');
    metadata.vector_layers.forEach(layer => {
      console.log(`- ${layer.id} (${layer.fields ? Object.keys(layer.fields).length : 0} fields)`);
      if (layer.fields) {
        console.log('  Fields:', Object.keys(layer.fields).join(', '));
      }
    });
  }
}

fs.closeSync(fd);
