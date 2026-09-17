#!/usr/bin/env node
// Convert simulator PNG captures into the WebP files the pages reference.
// Uses the `sharp` already installed in the Tawari app repo; nothing to install here.
//   node tools/shots.js <dir-with-pngs> assets/screens [width=720] [quality=78]
// Every PNG in the input dir is written as <same-basename>.webp, resized to `width`.
// Prints the byte size of each output so page weight stays visible.
'use strict';
const fs = require('fs');
const path = require('path');
const sharp = require('/Users/martinsmit/dev/Tawari/node_modules/sharp');

const [inDir, outDir, widthArg, qualityArg] = process.argv.slice(2);
if (!inDir || !outDir) { console.error('usage: shots.js <in-dir> <out-dir> [width] [quality]'); process.exit(1); }
const width = Number(widthArg || 720);
const quality = Number(qualityArg || 78);
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  let total = 0;
  for (const f of fs.readdirSync(inDir).filter((n) => n.toLowerCase().endsWith('.png')).sort()) {
    const out = path.join(outDir, f.replace(/\.png$/i, '.webp'));
    const info = await sharp(path.join(inDir, f)).resize({ width }).webp({ quality }).toFile(out);
    total += info.size;
    console.log(`${String(info.size).padStart(7)} B  ${info.width}x${info.height}  ${out}`);
  }
  console.log(`${String(total).padStart(7)} B  total`);
})().catch((e) => { console.error(e); process.exit(1); });
