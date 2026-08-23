/* Одноразовый скрипт: генерирует PNG-иконки PWA без внешних зависимостей.
   Запуск: node make-icons.js  (файл можно удалить после генерации) */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = b => {
  let c = 0xFFFFFFFF;
  for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function makePng(size, px) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const row = px(y);
    raw[y * (size * 4 + 1)] = 0;
    row.copy(raw, y * (size * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* штанга на оранжевом градиенте */
function draw(size, padRatio) {
  const pad = size * padRatio;
  const k = size / 512;
  const bars = [
    [150, 150, 362, 362], // вертикальные стойки
    [92, 200, 92, 312],   // левый блин
    [420, 200, 420, 312], // правый блин
    [150, 256, 362, 256], // гриф
  ];
  const r = 17 * k, rr = r * r;
  return y => {
    const row = Buffer.alloc(size * 4);
    for (let x = 0; x < size; x++) {
      let R, G, B, A = 255;
      // фон: диагональный градиент + скруглённые углы
      const t = (x + y) / (2 * size);
      R = 255; G = Math.round(138 - 44 * t); B = Math.round(61 - 35 * t);
      if (padRatio === 0) {
        const cr = 116 * k;
        const cx = x < cr ? cr : (x > size - cr ? size - cr : null);
        const cy = y < cr ? cr : (y > size - cr ? size - cr : null);
        if (cx !== null && cy !== null && (x - cx) ** 2 + (y - cy) ** 2 > cr * cr) A = 0;
      } else { R = G = B = 0; A = 0; } // прозрачный фон для maskable
      // штанга: расстояние до отрезков
      if (A) {
        let d = Infinity;
        for (const [x1, y1, x2, y2] of bars) {
          const ax = x1 * k, ay = y1 * k, bx = x2 * k, by = y2 * k;
          const dx = bx - ax, dy = by - ay;
          const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
          d = Math.min(d, Math.hypot(x - (ax + u * dx), y - (ay + u * dy)));
        }
        const edge = d - r;
        if (edge < 0) { R = G = B = 255; }
        else if (edge < 1.5) { const a = 1 - edge / 1.5; R += (255 - R) * a; G += (255 - G) * a; B += (255 - B) * a; }
      }
      const i = x * 4;
      row[i] = R; row[i + 1] = G; row[i + 2] = B; row[i + 3] = A;
    }
    return row;
  };
}

const dir = __dirname;
fs.writeFileSync(path.join(dir, 'icon-192.png'), makePng(192, draw(192, 0)));
fs.writeFileSync(path.join(dir, 'icon-512.png'), makePng(512, draw(512, 0)));
fs.writeFileSync(path.join(dir, 'maskable-512.png'), makePng(512, draw(512, 0.12)));
console.log('OK: icon-192.png, icon-512.png, maskable-512.png');
