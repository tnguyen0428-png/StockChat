// ============================================
// generate-icons.js
// Generates solid green PNG icons for PWA.
// Run with: node scripts/generate-icons.js
// ============================================

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

// #1AAD5E
const R = 26, G = 173, B = 94;

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(type, data) {
  const len      = Buffer.alloc(4);
  const crcBuf   = Buffer.alloc(4);
  const typeBuf  = Buffer.from(type, 'ascii');
  len.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function createPNG(size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8]  = 8; // bit depth
  ihdr[9]  = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowSize = 1 + size * 3;
  const raw     = Buffer.alloc(size * rowSize);
  for (let y = 0; y < size; y++) {
    const off  = y * rowSize;
    raw[off]   = 0; // filter None
    for (let x = 0; x < size; x++) {
      raw[off + 1 + x * 3]     = R;
      raw[off + 1 + x * 3 + 1] = G;
      raw[off + 1 + x * 3 + 2] = B;
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, '..', 'public');
fs.mkdirSync(outDir, { recursive: true });

const icons = [
  { name: 'icon-192.png',          size: 192 },
  { name: 'icon-512.png',          size: 512 },
  { name: 'apple-touch-icon.png',  size: 180 },
];

for (const { name, size } of icons) {
  const dest = path.join(outDir, name);
  fs.writeFileSync(dest, createPNG(size));
  console.log(`✓ ${name} (${size}x${size})`);
}

console.log('Done. Note: icons are solid green placeholders.');
console.log('Replace with proper branded PNGs for production.');
