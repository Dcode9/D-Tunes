const fs = require('fs');
const path = require('path');

function makeIcoFromPng(pngPath, icoPath) {
  const pngBuffer = fs.readFileSync(pngPath);
  
  // Create standard Windows ICO containing the PNG
  const icoHeader = Buffer.alloc(6 + 16);
  
  // ICONDIR
  icoHeader.writeUInt16LE(0, 0); // Reserved
  icoHeader.writeUInt16LE(1, 2); // Type = 1 (ICO)
  icoHeader.writeUInt16LE(1, 4); // Count = 1 image
  
  // ICONDIRENTRY (16 bytes)
  icoHeader.writeUInt8(0, 6); // Width: 0 means 256px
  icoHeader.writeUInt8(0, 7); // Height: 0 means 256px
  icoHeader.writeUInt8(0, 8); // Color count: 0 (>= 8bpp)
  icoHeader.writeUInt8(0, 9); // Reserved: 0
  icoHeader.writeUInt16LE(1, 10); // Color planes: 1
  icoHeader.writeUInt16LE(32, 12); // Bits per pixel: 32 (RGBA)
  icoHeader.writeUInt32LE(pngBuffer.length, 14); // Bytes in res
  icoHeader.writeUInt32LE(22, 18); // Image offset: 6 + 16 = 22
  
  const finalIco = Buffer.concat([icoHeader, pngBuffer]);
  fs.writeFileSync(icoPath, finalIco);
  console.log(`Generated pure transparent ICO at ${icoPath} (${finalIco.length} bytes)`);
}

const pngPath = path.join(__dirname, 'assets', 'DTunes_logo.png');
const icoPath = path.join(__dirname, 'assets', 'icon.ico');
const iconPngPath = path.join(__dirname, 'assets', 'icon.png');

if (fs.existsSync(pngPath)) {
  makeIcoFromPng(pngPath, icoPath);
  fs.copyFileSync(pngPath, iconPngPath);
  console.log(`Saved transparent icon.png at ${iconPngPath}`);
}
