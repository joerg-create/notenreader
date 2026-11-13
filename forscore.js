// Liest forScore-Sicherungen (.4sb) direkt im Browser.
// Aufbau: "<--4SBV03-->", dann Einträge aus [Namenslänge (16 Zeichen)][Datenlänge (16 Zeichen)][Name][gzip-Daten].
// Der erste Eintrag ist eine Binär-Plist mit allen Metadaten und Setlists.

const MAGIC = '<--4SBV03-->';

async function readRange(file, start, len) {
  return new Uint8Array(await file.slice(start, start + len).arrayBuffer());
}

// Einträge sind normalerweise gzip-komprimiert; falls nicht, Rohdaten zurückgeben
export async function readEntryBlob(blob) {
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  if (head[0] === 0x1f && head[1] === 0x8b) return gunzipBlob(blob);
  return new Uint8Array(await blob.arrayBuffer());
}

export async function gunzipBlob(blob) {
  if (typeof DecompressionStream === 'undefined') throw new Error('Dieser Browser kann die Sicherung nicht entpacken. Bitte Safari 16.4 oder neuer bzw. Chrome verwenden.');
  const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function indexBackup(file, onProgress) {
  const ascii = new TextDecoder('ascii');
  const utf8 = new TextDecoder('utf-8');
  const head = ascii.decode(await readRange(file, 0, 12));
  if (!head.startsWith('<--4S')) throw new Error(`„${file.name}“ ist keine forScore-Datei (.4sb/.4sc)`);
  const entries = [];
  let pos = 0;
  while (pos < file.size) {
    let chunk = await readRange(file, pos, 12 + 32 + 1024);
    if (ascii.decode(chunk.subarray(0, 3)) === '<--') { pos += 12; chunk = chunk.subarray(12); }
    const nameLen = parseInt(ascii.decode(chunk.subarray(0, 16)).trim(), 10);
    const dataLen = parseInt(ascii.decode(chunk.subarray(16, 32)).trim(), 10);
    if (!Number.isFinite(nameLen) || !Number.isFinite(dataLen)) throw new Error('Sicherung ist beschädigt');
    if (nameLen > chunk.length - 32) chunk = await readRange(file, pos, 32 + nameLen);
    const name = utf8.decode(chunk.subarray(32, 32 + nameLen)).normalize('NFC');
    const start = pos + 32 + nameLen;
    entries.push({ name, start, size: dataLen });
    pos = start + dataLen;
    if (entries.length % 50 === 0) onProgress?.(pos / file.size);
  }
  const read = (e) => readEntryBlob(file.slice(e.start, e.start + e.size));
  for (const e of entries) e.read = () => read(e);
  // Metadaten: Eintrag mit Endung .4sb/.4sc/.plist, sonst die erste Binär-Plist
  let meta = {};
  const candidates = [
    ...entries.filter((e) => /\.(4sb|4sc|plist)$/i.test(e.name)),
    ...entries.filter((e) => !/\.(pdf|png|jpe?g)$/i.test(e.name) && !/\.(4sb|4sc|plist)$/i.test(e.name)),
  ];
  for (const e of candidates) {
    try {
      const bytes = await read(e);
      const p = parseBplist(bytes);
      if (p && typeof p === 'object' && !Array.isArray(p)) { meta = { ...meta, ...p }; break; }
    } catch { /* keine Plist */ }
  }
  return { entries, meta, read, MAGIC };
}

// Minimaler Parser für Apple Binär-Plists (bplist00)
export function parseBplist(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (new TextDecoder('ascii').decode(buf.subarray(0, 8)) !== 'bplist00') throw new Error('Keine Binär-Plist');
  const t = buf.length - 32;
  const offSize = buf[t + 6];
  const refSize = buf[t + 7];
  const numObjects = Number(dv.getBigUint64(t + 8));
  const top = Number(dv.getBigUint64(t + 16));
  const offTable = Number(dv.getBigUint64(t + 24));
  const readUInt = (p, n) => { let v = 0; for (let i = 0; i < n; i++) v = v * 256 + buf[p + i]; return v; };
  const offsets = new Array(numObjects);
  for (let i = 0; i < numObjects; i++) offsets[i] = readUInt(offTable + i * offSize, offSize);
  const latin1 = new TextDecoder('iso-8859-1');
  const utf16 = new TextDecoder('utf-16be');
  const cache = new Map();
  const lenAt = (p, info) => {
    if (info !== 0xF) return [info, p + 1];
    const n = 1 << (buf[p + 1] & 0xF);
    return [readUInt(p + 2, n), p + 2 + n];
  };
  function obj(i) {
    if (cache.has(i)) return cache.get(i);
    const p = offsets[i];
    const marker = buf[p];
    const type = marker >> 4;
    const info = marker & 0xF;
    let v;
    switch (type) {
      case 0x0: v = info === 8 ? false : info === 9 ? true : null; break;
      case 0x1: { const n = 1 << info; v = n === 8 ? Number(dv.getBigInt64(p + 1)) : n === 16 ? Number(dv.getBigInt64(p + 9)) : readUInt(p + 1, n); break; }
      case 0x2: v = info === 2 ? dv.getFloat32(p + 1) : dv.getFloat64(p + 1); break;
      case 0x3: v = new Date(Date.UTC(2001, 0, 1) + dv.getFloat64(p + 1) * 1000); break;
      case 0x4: { const [len, s] = lenAt(p, info); v = buf.slice(s, s + len); break; }
      case 0x5: { const [len, s] = lenAt(p, info); v = latin1.decode(buf.subarray(s, s + len)); break; }
      case 0x6: { const [len, s] = lenAt(p, info); v = utf16.decode(buf.subarray(s, s + len * 2)); break; }
      case 0x8: v = { uid: readUInt(p + 1, info + 1) }; break;
      case 0xA: case 0xC: {
        const [len, s] = lenAt(p, info);
        v = [];
        cache.set(i, v);
        for (let k = 0; k < len; k++) v.push(obj(readUInt(s + k * refSize, refSize)));
        return v;
      }
      case 0xD: {
        const [len, s] = lenAt(p, info);
        v = {};
        cache.set(i, v);
        for (let k = 0; k < len; k++) {
          const key = obj(readUInt(s + k * refSize, refSize));
          v[typeof key === 'string' ? key.normalize('NFC') : String(key)] = obj(readUInt(s + (len + k) * refSize, refSize));
        }
        return v;
      }
      default: v = null;
    }
    cache.set(i, v);
    return v;
  }
  return obj(top);
}

// Metadaten je Datei aus der flachen Struktur "datei.pdf|feld" bzw. "datei.pdf|seite|feld" sammeln
export function collectDocs(meta) {
  const docs = new Map();
  for (const [k, v] of Object.entries(meta)) {
    if (k.startsWith('&')) continue;
    const parts = k.split('|');
    if (parts.length < 2) continue;
    const file = parts[0];
    if (!docs.has(file)) docs.set(file, { file, pages: {} });
    const d = docs.get(file);
    if (parts.length === 2) d[parts[1]] = v;
    else if (/^\d+$/.test(parts[1])) {
      const pg = +parts[1];
      (d.pages[pg] ||= {})[parts.slice(2).join('|')] = v;
    }
  }
  return docs;
}

export function collectSetlists(meta) {
  const order = Array.isArray(meta['&SYS;setlists']) ? meta['&SYS;setlists'] : Object.keys(meta).filter((k) => k.startsWith('&SET;'));
  const out = [];
  for (const key of order) {
    const items = meta[key];
    if (!Array.isArray(items)) continue;
    out.push({ name: key.replace(/^&SET;/, '').trim(), files: items.map((x) => (x && x.FilePath ? String(x.FilePath).normalize('NFC') : null)).filter(Boolean) });
  }
  return out;
}

// forScore speichert Mehrfachwerte als "A, B"
export const fsList = (v) => (v == null ? [] : String(v).split(',').map((x) => x.trim()).filter(Boolean));
