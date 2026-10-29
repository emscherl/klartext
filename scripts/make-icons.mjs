// Erzeugt die PNG-Icons aus derselben Form wie icons/icon.svg, ohne Abhängigkeiten.
// Aufruf: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [17, 18, 20], FG = [251, 251, 250], ACCENT = [43, 68, 255];

// Koordinaten im 64er-Raster wie im SVG
function shade(x, y, { rounded, scale }) {
  const c = 32, u = (x - c) / scale + c, v = (y - c) / scale + c;
  if (rounded && !inRoundRect(x, y, 0, 0, 64, 64, 14)) return null;
  if ((u - 43) ** 2 + (v - 31) ** 2 <= 16) return ACCENT;
  if (inRoundRect(u, v, 10, 18, 54, 44, 4) || inTail(u, v)) return FG;
  return BG;
}
function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
function inTail(x, y) { // Dreieck (21,44) (30,44) (21,52)
  return y >= 44 && x >= 21 && (x - 21) / 9 + (y - 44) / 8 <= 1;
}

function png(size, opts) {
  const ss = 4, rows = [];
  for (let py = 0; py < size; py++) {
    const row = [0];
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const col = shade(((px + (sx + 0.5) / ss) / size) * 64, ((py + (sy + 0.5) / ss) / size) * 64, opts);
        if (col) { r += col[0]; g += col[1]; b += col[2]; a++; }
      }
      const n = ss * ss;
      row.push(a ? Math.round(r / a) : 0, a ? Math.round(g / a) : 0, a ? Math.round(b / a) : 0, Math.round((a / n) * 255));
    }
    rows.push(Buffer.from(row));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function crc32(buf) {
  let c = ~0;
  for (const byte of buf) { c ^= byte; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c >>> 0;
}

const out = new URL('../icons/', import.meta.url);
writeFileSync(new URL('icon-192.png', out), png(192, { rounded: true, scale: 1 }));
writeFileSync(new URL('icon-512.png', out), png(512, { rounded: true, scale: 1 }));
writeFileSync(new URL('icon-maskable-512.png', out), png(512, { rounded: false, scale: 0.8 }));
writeFileSync(new URL('apple-touch-icon.png', out), png(180, { rounded: false, scale: 1 }));
console.log('Icons geschrieben.');
