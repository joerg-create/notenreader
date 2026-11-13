// Fotografierte Noten: Bild laden, entzerren, aufhellen und als PDF speichern.

// Foto laden und auf höchstens maxSide Pixel verkleinern (Ausrichtung aus EXIF übernimmt der Browser).
export async function loadPhoto(file, maxSide = 2600) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally { URL.revokeObjectURL(url); }
}

export function rotateCanvas(src, dir = 1) {
  const c = document.createElement('canvas');
  c.width = src.height; c.height = src.width;
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(dir * Math.PI / 2);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

// Homographie: bildet das Rechteck (0,0)-(1,1) auf das Viereck q = [[x,y] × 4] ab (oben links, oben rechts, unten rechts, unten links)
function homography(q) {
  const src = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [u, v] = src[i], [x, y] = q[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
  }
  // Gauß-Elimination
  const n = 8;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / A[c][c];
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const x = new Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k];
    x[r] = s / A[r][r];
  }
  return x; // a b c d e f g h
}

const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);

// Viereck (in Pixeln des Quellbilds) gerade ziehen. Liefert ein neues Canvas.
export function warpQuad(src, quad, maxW = 1800) {
  const w0 = Math.max(dist(quad[0], quad[1]), dist(quad[3], quad[2]));
  const h0 = Math.max(dist(quad[0], quad[3]), dist(quad[1], quad[2]));
  const k = Math.min(1, maxW / w0, (maxW * 1.6) / h0);
  const W = Math.max(1, Math.round(w0 * k)), H = Math.max(1, Math.round(h0 * k));
  const [a, b, c, d, e, f, g, hh] = homography(quad);
  const sctx = src.getContext('2d');
  const sw = src.width, sh = src.height;
  const sdata = sctx.getImageData(0, 0, sw, sh).data;
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const octx = out.getContext('2d');
  const img = octx.createImageData(W, H);
  const o = img.data;
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H;
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      const den = g * u + hh * v + 1;
      let sx = (a * u + b * v + c) / den - 0.5, sy = (d * u + e * v + f) / den - 0.5;
      const i = (y * W + x) * 4;
      if (sx < 0) sx = 0; else if (sx > sw - 1.001) sx = sw - 1.001;
      if (sy < 0) sy = 0; else if (sy > sh - 1.001) sy = sh - 1.001;
      const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0;
      const p00 = (y0 * sw + x0) * 4, p10 = p00 + 4, p01 = p00 + sw * 4, p11 = p01 + 4;
      for (let ch = 0; ch < 3; ch++) {
        const top = sdata[p00 + ch] + (sdata[p10 + ch] - sdata[p00 + ch]) * fx;
        const bot = sdata[p01 + ch] + (sdata[p11 + ch] - sdata[p01 + ch]) * fx;
        o[i + ch] = top + (bot - top) * fy;
      }
      o[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

// Scan-Optik: Graustufen, ungleichmäßige Beleuchtung und Schatten ausgleichen, Kontrast erhöhen.
export function enhance(src) {
  const W = src.width, H = src.height;
  const ctx = src.getContext('2d');
  const id = ctx.getImageData(0, 0, W, H);
  const d = id.data;
  const gray = new Float32Array(W * H);
  for (let i = 0, j = 0; j < gray.length; i += 4, j++) gray[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  // Hintergrundhelligkeit: lokales Maximum auf grobem Raster (Papier ist heller als Tinte), dann weich hochskalieren
  const cell = Math.max(8, Math.round(Math.max(W, H) / 60));
  const gw = Math.ceil(W / cell), gh = Math.ceil(H / cell);
  const grid = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      // 90. Perzentil per Histogramm, robuster als das Maximum
      const hist = new Uint32Array(64);
      let n = 0;
      const y1 = Math.min(H, (gy + 1) * cell), x1 = Math.min(W, (gx + 1) * cell);
      for (let y = gy * cell; y < y1; y += 2) for (let x = gx * cell; x < x1; x += 2) { hist[gray[y * W + x] >> 2]++; n++; }
      let acc = 0, k = 63;
      for (; k > 0; k--) { acc += hist[k]; if (acc >= n * 0.1) break; }
      grid[gy * gw + gx] = k * 4 + 2;
    }
  }
  // Hellsten Nachbarn nehmen, damit dunkle Flächen (Text, Balken) nicht als Hintergrund gelten
  {
    const g2 = new Float32Array(grid.length);
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
      let m = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = gy + dy, xx = gx + dx;
        if (yy >= 0 && yy < gh && xx >= 0 && xx < gw) m = Math.max(m, grid[yy * gw + xx]);
      }
      g2[gy * gw + gx] = m;
    }
    grid.set(g2);
  }
  // Glätten (zweimal 3×3-Mittel), damit keine Kanten entstehen
  for (let pass = 0; pass < 2; pass++) {
    const g2 = new Float32Array(grid.length);
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
      let s = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = gy + dy, xx = gx + dx;
        if (yy >= 0 && yy < gh && xx >= 0 && xx < gw) { s += grid[yy * gw + xx]; c++; }
      }
      g2[gy * gw + gx] = s / c;
    }
    grid.set(g2);
  }
  const bgAt = (x, y) => {
    const fx = Math.min(gw - 1.001, Math.max(0, x / cell - 0.5)), fy = Math.min(gh - 1.001, Math.max(0, y / cell - 0.5));
    const x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0;
    const x1 = Math.min(gw - 1, x0 + 1), y1 = Math.min(gh - 1, y0 + 1);
    const a = grid[y0 * gw + x0] + (grid[y0 * gw + x1] - grid[y0 * gw + x0]) * tx;
    const b = grid[y1 * gw + x0] + (grid[y1 * gw + x1] - grid[y1 * gw + x0]) * tx;
    return a + (b - a) * ty;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const j = y * W + x;
      const bg = Math.max(40, bgAt(x, y));
      let r = gray[j] / bg; // 1 = Papier, kleiner = Tinte
      // Papier ganz weiß, Tinte kräftig schwarz
      r = (r - 0.45) / (0.88 - 0.45);
      r = r < 0 ? 0 : r > 1 ? 1 : r;
      const v = 255 * r * r * (3 - 2 * r); // weicher S-Verlauf
      const i = j * 4;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
  }
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  out.getContext('2d').putImageData(id, 0, 0);
  return out;
}

// Mehrere JPEG-Seiten zu einem PDF zusammenfügen. pages: [{ jpeg: Uint8Array, w, h }]
export function makePdf(pages, title = '') {
  const enc = new TextEncoder();
  const parts = [];
  let len = 0;
  const offsets = [];
  const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const obj = (n, body) => { offsets[n] = len; push(`${n} 0 obj\n`); for (const b of [].concat(body)) push(b); push('\nendobj\n'); };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const n = pages.length;
  // 1 Katalog, 2 Seitenbaum, 3 Info, dann je Seite: Seite, Inhalt, Bild
  const pageIds = pages.map((_, i) => 4 + i * 3);
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Count ${n} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`);
  const esc = (s) => s.replace(/[\\()]/g, (m) => '\\' + m).replace(/[^\x20-\x7e]/g, '?');
  obj(3, `<< /Title (${esc(title)}) /Producer (Notenreader) >>`);
  pages.forEach((p, i) => {
    const id = pageIds[i];
    const W = 595.28, H = +(W * p.h / p.w).toFixed(2);
    const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    obj(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`);
    obj(id + 1, [`<< /Length ${content.length} >>\nstream\n`, content, '\nendstream']);
    obj(id + 2, [`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`, p.jpeg, '\nendstream']);
  });
  const xref = len;
  const total = 4 + n * 3;
  let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) x += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  push(x);
  push(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}

export async function canvasToJpeg(c, q = 0.85) {
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', q));
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), w: c.width, h: c.height };
}
