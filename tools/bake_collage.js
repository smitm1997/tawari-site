#!/usr/bin/env node
/* Bake the footer collage (WS-D142, option A) into the four rasters in assets/collage/.

   The layout is tools/collage-layout.json: every icon's box, rotation, flip and paint
   order, read off the canvas boards. The art is the app's own illustrated set,
   final-icons/ in the Tawari repo, so nothing here is drawn or invented: each icon is
   trimmed of its transparent margin, stretched to its box, flipped, rotated about the
   box centre (as CSS does), and painted in board order onto the cream card colour.

   The specimen label is NOT baked. The pages draw it in HTML so it stays sharp at any
   density and can say "Living field guide" on /en/.

   Usage (needs sharp, which the app repo already has):
     node tools/bake_collage.js --icons ~/dev/Tawari/final-icons --sharp ~/dev/Tawari/node_modules/sharp
   Same inputs, same bytes out: re-running it on unchanged icons reproduces the files. */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const home = p => p.replace(/^~(?=$|\/)/, os.homedir());
const ICONS = home(arg('--icons', '~/dev/Tawari/final-icons'));
const sharp = require(home(arg('--sharp', '~/dev/Tawari/node_modules/sharp')));
const OUT = path.join(__dirname, '..', 'assets', 'collage');
const Q = 72; // WebP quality: q65 saved only 5-7% and softened the fine-liner
const CREAM = { r: 0xFD, g: 0xF2, b: 0xDB, alpha: 1 }; // --card
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

// Never on a Colombian-facing surface (WS-D142 inventory): the platypus wildcard, the
// generic mammal that reads as the old plate's jaguarundi, and cultivated plants
// (coffee, garden rose, hibiscus, gourd).
const BANNED = /buckets\/other|buckets\/mammals|rubiaceae|rosaceae|malvaceae|malvales|cucurbitaceae/;

const layout = JSON.parse(fs.readFileSync(path.join(__dirname, 'collage-layout.json'), 'utf8'));

const trimmed = {};
async function icon(name) {
  if (BANNED.test(name)) throw new Error(`banned icon in the layout: ${name}`);
  if (!trimmed[name]) trimmed[name] = await sharp(path.join(ICONS, `${name}.png`)).trim().png().toBuffer();
  return trimmed[name];
}

// Paint the items onto a cream sheet with slack round it, so no icon needs a negative
// offset, then cut out the band [x0, x0 + W] x [0, H] (CSS px) at scale S.
async function bake(items, { x0, W, H, S }) {
  const PAD = 400;
  const layers = [];
  for (const it of items) {
    let buf = await sharp(await icon(it.icon)).resize(Math.round(it.w * S), Math.round(it.h * S), { fit: 'fill' }).png().toBuffer();
    if (it.flip) buf = await sharp(buf).flop().png().toBuffer(); // CSS applies scaleX(-1) first, then rotate
    if (it.rot) buf = await sharp(buf).rotate(it.rot, { background: CLEAR }).png().toBuffer(); // clockwise, like CSS
    const { width, height } = await sharp(buf).metadata();
    const cx = (PAD + it.left - x0 + it.w / 2) * S, cy = (PAD + it.top + it.h / 2) * S;
    layers.push({ input: buf, left: Math.round(cx - width / 2), top: Math.round(cy - height / 2) });
  }
  const sheet = await sharp({ create: { width: Math.round((W + 2 * PAD) * S), height: Math.round((H + 2 * PAD) * S), channels: 4, background: CREAM } })
    .composite(layers).png().toBuffer();
  return sharp(sheet)
    .extract({ left: Math.round(PAD * S), top: Math.round(PAD * S), width: Math.round(W * S), height: Math.round(H * S) })
    .flatten({ background: CREAM });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { desktop, phone } = layout;
  const jobs = [
    // desktop: the 1280 x 280 band as drawn, for srcset at 1x, 1.5x and 2x
    ['collage-1280.webp', desktop.items, { x0: 0, W: desktop.width, H: desktop.height, S: 1 }],
    ['collage-1920.webp', desktop.items, { x0: 0, W: desktop.width, H: desktop.height, S: 1.5 }],
    ['collage-2560.webp', desktop.items, { x0: 0, W: desktop.width, H: desktop.height, S: 2 }],
    // phone: the 375 x 230 vignette at 2x, drawn 60 px wider each side so a 430 px
    // phone sees the icons that bled off the board, not a cut edge. CSS crops to centre.
    ['collage-phone.webp', phone.items, { x0: -60, W: phone.width + 120, H: phone.height, S: 2 }],
  ];
  for (const [name, items, opt] of jobs) {
    const info = await (await bake(items, opt)).webp({ quality: Q, effort: 6, smartSubsample: true }).toFile(path.join(OUT, name));
    console.log(`${name.padEnd(20)} ${info.width}x${info.height}  ${(info.size / 1024).toFixed(1)} KB`);
  }
})().catch(e => { console.error(e.message || e); process.exit(1); });
