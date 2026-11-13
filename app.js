import { db } from './db.js';
import * as pdfjsLib from './vendor/pdf.min.mjs';
import { indexBackup, collectDocs, collectSetlists, fsList } from './forscore.js';
import { loadPhoto, rotateCanvas, warpQuad, enhance, makePdf, canvasToJpeg } from './scan.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;

const APP_VERSION = '1.8.0';

/* ---------- Hilfsfunktionen ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : String(kid));
  }
  return el;
}

const ICONS = {
  back: '<path d="M15 18l-6-6 6-6"/>',
  chev: '<path d="M9 18l6-6-6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  more: '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
  cover: '<rect x="3" y="7" width="18" height="10" rx="1.5" fill="currentColor" fill-opacity=".85"/>',
  pointer: '<path d="M5 3l14 8-6 1.5L10 19z"/>',
  marker: '<path d="M9 11l-6 6v3h9l3-3"/><path d="M22 12l-4.6 4.6a2 2 0 01-2.8 0l-5.2-5.2a2 2 0 010-2.8L14 4"/>',
  eraser: '<path d="M20 20H9L4 15a2 2 0 010-2.8L13.2 3a2 2 0 012.8 0l4 4a2 2 0 010 2.8L11 19"/><path d="M8 10l6 6"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-9 9"/>',
  rotate: '<path d="M20 12a8 8 0 11-2.3-5.7"/><path d="M20 4v5h-5"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  book: '<path d="M2 4h7a3 3 0 013 3v13a2 2 0 00-2-2H2z"/><path d="M22 4h-7a3 3 0 00-3 3v13a2 2 0 012-2h8z"/>',
  play: '<path d="M7 4l13 8-13 8z" fill="currentColor"/>',
  up: '<path d="M18 15l-6-6-6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  rows: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  folder: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
  tag: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L2 12V2h10l8.6 8.6a2 2 0 010 2.8z"/><circle cx="7" cy="7" r="1.5"/>',
};
function icon(name) {
  const span = document.createElement('span');
  span.className = 'ic';
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  return span;
}
function hydrateIcons(root = document) {
  for (const el of $$('.ic[data-icon]', root)) {
    el.replaceWith(icon(el.dataset.icon));
  }
}

const DEFAULT_SETTINGS = { sort: 'title', view: 'auto', penSize: 2, hintClosed: false, libView: 'list', keepAwake: 'reading' };
const settings = (() => {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('nr-settings') || '{}') }; }
  catch { return { ...DEFAULT_SETTINGS }; }
})();
function saveSettings() { try { localStorage.setItem('nr-settings', JSON.stringify(settings)); } catch { /* egal */ } }

function toast(msg, ms = 2400) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), ms);
}

/* ---------- Dialoge ---------- */
function dialog({ title, body, actions = [], onOpen }) {
  return new Promise((resolve) => {
    const d = $('#dlg');
    let result = null;
    const close = (value) => { result = value; d.close(); };
    const primary = actions.find((a) => a.primary);
    const form = h('form', {
      class: 'dlg',
      onsubmit: (e) => { e.preventDefault(); if (primary) close(primary.value); },
    },
    title ? h('h2', {}, title) : null,
    h('div', { class: 'dlg-body' }, body),
    actions.length ? h('div', { class: 'dlg-actions' }, actions.map((a) => h('button', {
      type: 'button', class: `btn ${a.primary ? 'primary' : ''} ${a.danger ? 'danger' : ''}`,
      onclick: () => close(a.value),
    }, a.label))) : null);
    d.replaceChildren(form);
    d.onclose = () => resolve(result);
    d.onclick = (e) => { if (e.target === d) close(null); };
    d.closeWith = close;
    d.showModal();
    onOpen?.(d);
  });
}
async function confirmDialog(title, text, okLabel = 'Löschen') {
  const r = await dialog({
    title, body: h('p', {}, text),
    actions: [{ label: 'Abbrechen', value: null }, { label: okLabel, value: 'ok', primary: true, danger: true }],
  });
  return r === 'ok';
}
function field(label, input) { return h('label', { class: 'field' }, h('span', {}, label), input); }

/* ---------- Daten ---------- */
let scores = [];
let setlists = [];
const state = { tab: 'library', query: '', openSetlist: null, filter: { instruments: '', genre: '', tags: '' }, selecting: false, selected: new Set() };

async function loadData() {
  [scores, setlists] = await Promise.all([db.all('scores'), db.all('setlists')]);
  await migrateScores();
}
const scoreById = (id) => scores.find((s) => s.id === id);

/* ---------- Import ---------- */
async function renderThumb(doc) {
  const page = await doc.getPage(1);
  const vp1 = page.getViewport({ scale: 1 });
  const scale = 320 / vp1.width;
  const vp = page.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const url = c.toDataURL('image/jpeg', 0.78);
  c.width = c.height = 0;
  return url;
}

function titleFromFilename(name) {
  return name.replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Ohne Titel';
}

/* ---------- Tabellen (CSV/TSV) ---------- */
async function readTextSmart(file) {
  const buf = await file.arrayBuffer();
  let text = new TextDecoder('utf-8').decode(buf);
  if (text.includes('�')) {
    try { text = new TextDecoder('windows-1252').decode(buf); } catch { /* bleibt UTF-8 */ }
  }
  return text.replace(/^﻿/, '');
}
function parseTable(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const counts = { '\t': 0, ';': 0, ',': 0 };
  for (const ch of firstLine) if (ch in counts) counts[ch]++;
  const delim = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] : ',';
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += c;
    } else if (c === '"' && cell === '') inQ = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  const header = (rows.shift() || []).map((h0, i) => h0.trim() || `Spalte ${i + 1}`);
  return { header, rows: rows.map((r) => Object.fromEntries(header.map((k, i) => [k, (r[i] ?? '').trim()]))) };
}

// Zielfelder und typische Spaltennamen (deutsch, englisch, forScore)
const TABLE_FIELDS = [
  { key: 'file', label: 'Dateiname', multi: false, guess: ['file', 'filename', 'file name', 'datei', 'dateiname', 'path', 'pfad', 'pdf'] },
  { key: 'title', label: 'Titel', multi: false, guess: ['title', 'titel', 'name', 'stück', 'stueck'] },
  { key: 'ref', label: 'ID', multi: false, guess: ['id', 'reference', 'referenz', 'ref', 'nummer', 'nr', 'number', 'archivnummer', 'signatur'] },
  { key: 'composer', label: 'Komponist', multi: false, guess: ['composer', 'composers', 'komponist', 'komponisten', 'author', 'autor', 'artist', 'interpret'] },
  { key: 'instruments', label: 'Instrument(e)', multi: true, guess: ['instrument', 'instruments', 'instrumente', 'besetzung', 'stimme'] },
  { key: 'genre', label: 'Genre', multi: false, guess: ['genre', 'genres', 'gattung', 'stil', 'style', 'kategorie', 'category'] },
  { key: 'tags', label: 'Tags', multi: true, guess: ['tags', 'tag', 'schlagwörter', 'schlagworte', 'stichwörter', 'keywords', 'labels', 'label'] },
];
function guessMapping(header) {
  const norm = (s) => s.toLowerCase().replace(/[^a-zäöüß0-9 ]/g, '').trim();
  const map = {};
  const used = new Set();
  for (const f of TABLE_FIELDS) {
    const hits = header.filter((h0) => f.guess.includes(norm(h0)) && !used.has(h0));
    hits.forEach((h0) => used.add(h0));
    map[f.key] = f.multi ? hits : (hits[0] || '');
  }
  return map;
}
const splitMulti = (v) => splitList(String(v || '').replace(/[;|\n]/g, ','));
function normName(n) {
  return String(n || '').split(/[\\/]/).pop().normalize('NFC').toLowerCase()
    .replace(/\.(pdf|4sc)$/i, '').replace(/[_\s]+/g, ' ').trim();
}
function metaFromRow(row, map) {
  const one = (k) => (map[k] ? row[map[k]] || '' : '');
  const many = (k) => splitMulti((map[k] || []).map((col) => row[col]).join(','));
  const m = {
    title: one('title'), ref: one('ref'), composer: splitMulti(one('composer')).join(', '),
    genre: splitMulti(one('genre')).join(', '), instruments: many('instruments'), tags: many('tags'),
  };
  return m;
}

async function mappingDialog(table, pdfNames) {
  const map = guessMapping(table.header);
  const body = h('div', {});
  const draw = () => {
    const opts = (sel) => [h('option', { value: '' }, '– nicht verwenden –'), ...table.header.map((c) => h('option', { value: c, selected: c === sel }, c))];
    const rows = TABLE_FIELDS.map((f) => {
      if (!f.multi) {
        const s = h('select', { onchange: () => { map[f.key] = s.value; draw(); } }, opts(map[f.key]));
        return h('label', { class: 'map-row' }, h('span', {}, f.label), s);
      }
      return h('div', { class: 'map-row' }, h('span', {}, f.label),
        h('div', { class: 'chips' }, table.header.map((c) => h('button', {
          type: 'button', class: `chip${map[f.key].includes(c) ? ' on' : ''}`,
          onclick: () => { map[f.key] = map[f.key].includes(c) ? map[f.key].filter((x) => x !== c) : [...map[f.key], c]; draw(); },
        }, c))));
    });
    // Vorschau: Zuordnung der Zeilen zu PDFs bzw. vorhandenen Stücken
    const key = map.file || map.title;
    const names = new Set(pdfNames.map(normName));
    const known = new Set(scores.flatMap((s) => [normName(s.file || ''), normName(s.title)]));
    let hit = 0;
    for (const r of table.rows) { const n = normName(r[key]); if (n && (names.has(n) || known.has(n))) hit++; }
    const sample = table.rows[0] ? metaFromRow(table.rows[0], map) : null;
    body.replaceChildren(
      h('p', { class: 'note' }, `${table.rows.length} Zeilen gefunden. Ordne die Spalten den Feldern zu. Die Zeilen werden über den Dateinamen (oder sonst den Titel) mit den PDFs verbunden.`),
      ...rows,
      h('p', { class: `note match ${hit ? 'ok' : 'warn'}` }, key
        ? `${hit} von ${table.rows.length} Zeilen passen zu einem PDF.`
        : 'Bitte „Dateiname“ oder „Titel“ zuordnen.'),
      sample ? h('p', { class: 'note' }, 'Beispiel erste Zeile: ', h('b', {}, [sample.ref, sample.title, sample.composer, sample.instruments.join(', '), sample.genre, sample.tags.join(', ')].filter(Boolean).join(' · '))) : null,
    );
  };
  draw();
  const r = await dialog({
    title: 'Tabelle zuordnen', body,
    actions: [{ label: 'Abbrechen', value: null }, { label: 'Übernehmen', value: 'ok', primary: true }],
  });
  return r === 'ok' && (map.file || map.title) ? map : null;
}

function applyMeta(s, m) {
  if (m.title) s.title = m.title;
  if (m.ref) s.ref = m.ref;
  if (m.composer) s.composer = m.composer;
  if (m.genre) s.genre = m.genre;
  if (m.instruments.length) s.instruments = m.instruments;
  if (m.tags.length) s.tags = m.tags;
}

/* ---------- Import ---------- */
const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
const isTable = (f) => /\.(csv|tsv|txt)$/i.test(f.name) || f.type === 'text/csv';

async function importFiles(fileList) {
  const all = [...fileList].filter((f) => !f.name.startsWith('.'));
  const fsFiles = all.filter(isForScoreBackup);
  if (fsFiles.length) { await importForScore(fsFiles); return; }
  const files = all.filter(isPdf);
  const tables = all.filter(isTable);
  const photos = all.filter(isImageFile);
  if (photos.length && !files.length && !tables.length) { scanFlow(photos); return; }
  if (!files.length && !tables.length) { toast('Bitte PDF-Dateien oder eine Tabelle (CSV) auswählen'); return; }
  try { await navigator.storage?.persist?.(); } catch { /* nicht unterstützt */ }

  // Tabelle mit Schlagwörtern einlesen und zuordnen lassen
  let lookup = null;
  if (tables.length) {
    try {
      const table = parseTable(await readTextSmart(tables[0]));
      if (!table.rows.length) throw new Error('leer');
      const map = await mappingDialog(table, files.map((f) => f.name));
      if (map) {
        const key = map.file || map.title;
        lookup = new Map();
        for (const r of table.rows) { const n = normName(r[key]); if (n && !lookup.has(n)) lookup.set(n, metaFromRow(r, map)); }
      } else if (!files.length) return;
    } catch (e) {
      console.error(e);
      toast(`„${tables[0].name}“ konnte nicht gelesen werden`);
      if (!files.length) return;
    }
  }

  // Nur Tabelle: vorhandene Stücke aktualisieren
  if (!files.length && lookup) {
    let n = 0;
    for (const s of scores) {
      const m = lookup.get(normName(s.file || '')) || lookup.get(normName(s.title));
      if (m) { applyMeta(s, m); await db.put('scores', s); n++; }
    }
    renderLibrary();
    toast(n ? `Schlagwörter für ${n} ${n === 1 ? 'Stück' : 'Stücke'} übernommen` : 'Keine Zeile passte zu einem vorhandenen Stück', 4000);
    return;
  }

  // Doppelte überspringen (gleicher Dateiname und gleiche Größe)
  const existing = new Set(scores.filter((s) => s.file).map((s) => `${normName(s.file)}|${s.size}`));
  const todo = files.filter((f) => !existing.has(`${normName(f.name)}|${f.size}`));
  const skipped = files.length - todo.length;

  let ok = 0, failed = 0, matched = 0;
  const newIds = [];
  importCancel = false;
  showProgress(0, todo.length);
  for (const [i, f] of todo.entries()) {
    if (importCancel) break;
    showProgress(i, todo.length, f.name);
    try {
      const buf = await f.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
      let composer = '';
      try {
        const meta = await doc.getMetadata();
        const author = meta?.info?.Author;
        if (typeof author === 'string' && author.trim().length < 80) composer = author.trim();
      } catch { /* keine Metadaten */ }
      const thumb = await renderThumb(doc);
      const id = uid();
      await db.put('files', { id, data: buf });
      const s = { id, title: titleFromFilename(f.name), composer, ref: '', instruments: [], genre: '', tags: [], file: f.name, size: f.size, pages: doc.numPages, added: Date.now(), opened: 0, lastPage: 1, thumb };
      const m = lookup && (lookup.get(normName(f.name)) || lookup.get(normName(titleFromFilename(f.name))));
      if (m) { applyMeta(s, m); matched++; s.inbox = !(s.instruments.length || s.genre || s.tags.length); } else s.inbox = true;
      if (!s.ref) s.ref = nextRef();
      await db.put('scores', s);
      scores.push(s);
      newIds.push(id);
      ok++;
      await doc.destroy();
    } catch (e) {
      console.error(e);
      failed++;
    }
    if (i % 10 === 9) renderLibrary();
  }
  hideProgress();
  renderLibrary();

  const parts = [ok === 1 ? '1 Stück importiert' : `${ok} Stücke importiert`];
  if (lookup && ok) parts.push(`${matched} mit Schlagwörtern aus der Tabelle`);
  if (skipped) parts.push(`${skipped} schon vorhanden`);
  if (failed) parts.push(`${failed} nicht lesbar`);
  if (importCancel) parts.push('abgebrochen');
  if (!ok) { toast(parts.slice(1).join(', ') || 'Nichts importiert', 5000); return; }
  if (lookup || importCancel) { toast(parts.join(', '), 6000); if (state.tab === 'inbox') renderInbox(); return; }
  toast(parts.join(', ') + ' – bitte jetzt verschlagworten', 4000);
  setTab('inbox');
  const first = inboxList().findIndex((x) => x.id === newIds[0]);
  if (first >= 0) { inboxIndex = first; renderInbox(); }
}

let importCancel = false;
function showProgress(i, n, name = '') {
  const el = $('#progress');
  el.hidden = false;
  $('#progress-text').textContent = n ? `Importiere ${Math.min(i + 1, n)} von ${n}` : 'Importiere …';
  $('#progress-name').textContent = name;
  $('#progress-bar').style.width = n ? `${Math.round((i / n) * 100)}%` : '0%';
}
function hideProgress() { $('#progress').hidden = true; }

/* ---------- forScore-Sicherung (.4sb) ---------- */
const isForScoreBackup = (f) => /\.4s[bc]$/i.test(f.name);
const stripDir = (n) => n.replace(/^\{%[A-Z_]+%\}\//, '').replace(/^.*\//, '');

function parseRect(str) {
  const nums = String(str || '').match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi);
  return nums && nums.length >= 4 ? nums.map(Number) : null;
}

async function importForScore(files) {
  if (!Array.isArray(files)) files = [files];
  importCancel = false;
  showProgress(0, 0, 'forScore-Sicherung wird gelesen …');
  $('#progress-text').textContent = 'forScore-Sicherung wird gelesen …';
  let bk;
  try {
    bk = { entries: [], meta: {} };
    for (const [i, file] of files.entries()) {
      const one = await indexBackup(file, (f) => { $('#progress-bar').style.width = `${Math.round(((i + f) / files.length) * 100)}%`; });
      bk.entries.push(...one.entries);
      Object.assign(bk.meta, one.meta);
    }
    bk.read = (e) => e.read();
  } catch (e) {
    console.error(e);
    hideProgress();
    toast(e.message || 'Die Sicherung konnte nicht gelesen werden', 6000);
    return;
  }
  hideProgress();

  const docs = collectDocs(bk.meta);
  const fsSets = collectSetlists(bk.meta);
  const pdfEntries = bk.entries.filter((e) => /\.pdf$/i.test(e.name));
  const pngByFile = new Map();
  for (const e of bk.entries) {
    const m = stripDir(e.name).match(/^(.*)\|(\d+)\.png$/i);
    if (!m) continue;
    if (!pngByFile.has(m[1])) pngByFile.set(m[1], []);
    pngByFile.get(m[1]).push({ page: +m[2], entry: e });
  }
  const known = new Set(scores.filter((s) => s.file).map((s) => s.file.normalize('NFC')));
  const fresh = pdfEntries.filter((e) => !known.has(stripDir(e.name)));
  const annoPages = [...pngByFile.values()].reduce((a, l) => a + l.length, 0);
  const instruments = new Set(), genres = new Set(), libs = new Set();
  for (const d of docs.values()) {
    fsList(d.labels).forEach((x) => instruments.add(x));
    fsList(d.genre).forEach((x) => genres.add(x));
    fsList(d.libraries).forEach((x) => libs.add(x));
  }

  const optAnno = h('input', { type: 'checkbox', checked: true });
  const optSets = h('input', { type: 'checkbox', checked: true });
  const optLibs = h('input', { type: 'checkbox', checked: true });
  const preview = (set) => [...set].slice(0, 6).join(', ') + (set.size > 6 ? ' …' : '');
  const r = await dialog({
    title: files.length > 1 ? `${files.length} forScore-Dateien importieren` : 'forScore-Daten importieren',
    body: [
      h('p', {}, h('b', {}, `${pdfEntries.length} Stücke`), `, ${fsSets.length} Setlists und ${annoPages} Seiten mit Anmerkungen gefunden.`,
        known.size && fresh.length < pdfEntries.length ? ` ${pdfEntries.length - fresh.length} davon sind schon im Notenreader und werden übersprungen.` : ''),
      h('div', { class: 'section-title' }, 'So werden die Felder übernommen'),
      h('div', { class: 'map-table' },
        h('div', {}, h('span', {}, 'Titel, Komponist'), h('span', {}, '→ Titel, Komponist')),
        h('div', {}, h('span', {}, 'Labels'), h('span', {}, `→ Instrument (${preview(instruments) || '–'})`)),
        h('div', {}, h('span', {}, 'Genre'), h('span', {}, `→ Genre (${preview(genres) || '–'})`)),
        h('div', {}, h('span', {}, 'Referenz'), h('span', {}, '→ ID')),
        h('div', {}, h('span', {}, 'Schlagwörter'), h('span', {}, '→ Suchbegriffe (werden bei der Suche gefunden)')),
        h('div', {}, h('span', {}, 'Bewertung, Schwierigkeit'), h('span', {}, '→ werden mitgespeichert'))),
      h('label', { class: 'check-row' }, optLibs, h('span', {}, `Bibliotheken als Tags übernehmen (${preview(libs) || '–'})`)),
      h('label', { class: 'check-row' }, optSets, h('span', {}, `Setlists übernehmen (${fsSets.length})`)),
      h('label', { class: 'check-row' }, optAnno, h('span', {}, `Anmerkungen übernehmen (${annoPages} Seiten)`)),
      h('p', { class: 'note' }, 'Der Import kann bei vielen Stücken einige Minuten dauern. Du kannst ihn abbrechen und später erneut starten, schon übernommene Stücke werden dann übersprungen.'),
    ],
    actions: [{ label: 'Abbrechen', value: null }, { label: fresh.length ? `${fresh.length} Stücke importieren` : 'Nur Setlists aktualisieren', value: 'ok', primary: true }],
  });
  if (r !== 'ok') return;

  try { await navigator.storage?.persist?.(); } catch { /* egal */ }
  const fileToId = new Map(scores.filter((s) => s.file).map((s) => [s.file.normalize('NFC'), s.id]));
  let ok = 0, failed = 0, annos = 0;
  showProgress(0, fresh.length);
  for (const [i, e] of fresh.entries()) {
    if (importCancel) break;
    const fname = stripDir(e.name);
    showProgress(i, fresh.length, fname);
    try {
      const data = await bk.read(e);
      const doc = await pdfjsLib.getDocument({ data: data.slice(0) }).promise;
      const thumb = await renderThumb(doc);
      const m = docs.get(fname) || {};
      const id = uid();
      const added = m.added instanceof Date && !isNaN(m.added) ? m.added.getTime() : Date.now();
      const s = {
        id,
        title: String(m.title || '').trim() || titleFromFilename(fname),
        composer: fsList(m.composer).join(', '),
        ref: m.reference != null ? String(m.reference).trim() : '',
        instruments: fsList(m.labels),
        genre: fsList(m.genre).join(', '),
        tags: optLibs.checked ? fsList(m.libraries) : [],
        keywords: fsList(m.keywords).join(', '),
        rating: +m.rating || 0, difficulty: +m.difficulty || 0,
        file: fname, size: data.length, pages: doc.numPages, added, opened: 0, lastPage: 1, thumb, source: 'forScore',
      };
      await db.put('files', { id, data: data.buffer.byteLength === data.length ? data.buffer : data.slice().buffer });
      if (optAnno.checked) {
        for (const { page, entry } of pngByFile.get(fname) || []) {
          if (page < 1 || page > doc.numPages) continue;
          const png = await bk.read(entry);
          const pm = m.pages?.[page] || {};
          const rect = parseRect(pm.rect);
          const fs = rect && pm.zoom ? { zoom: +pm.zoom, rx: rect[0], ry: rect[1] } : {};
          await db.put('annos', { key: `${id}|${page}`, strokes: [], img: new Blob([png], { type: 'image/png' }), fs });
          annos++;
        }
      }
      await db.put('scores', s);
      scores.push(s);
      fileToId.set(fname, id);
      ok++;
      await doc.destroy();
    } catch (err) {
      console.error(fname, err);
      failed++;
    }
    if (i % 20 === 19) renderLibrary();
  }
  hideProgress();

  let setsAdded = 0;
  if (optSets.checked) {
    const names = new Set(setlists.map((sl) => sl.name.toLowerCase()));
    for (const fsSet of fsSets) {
      if (!fsSet.name || names.has(fsSet.name.toLowerCase())) continue;
      const items = fsSet.files.map((f) => fileToId.get(f)).filter(Boolean);
      if (!items.length) continue;
      const sl = { id: uid(), name: fsSet.name, items, created: Date.now(), source: 'forScore' };
      setlists.push(sl);
      await db.put('setlists', sl);
      names.add(fsSet.name.toLowerCase());
      setsAdded++;
    }
  }
  renderLibrary();
  if (state.tab === 'setlists') renderSetlists();
  const parts = [`${ok} Stücke importiert`];
  if (annos) parts.push(`${annos} Seiten mit Anmerkungen`);
  if (setsAdded) parts.push(`${setsAdded} Setlists`);
  if (failed) parts.push(`${failed} nicht lesbar`);
  if (importCancel) parts.push('abgebrochen, erneut starten zum Fortsetzen');
  await dialog({ title: 'forScore-Import fertig', body: h('p', {}, parts.join(', ') + '.'), actions: [{ label: 'OK', value: null, primary: true }] });
}

// Jede Auswahl ist ein <label> mit eigenem Datei-Feld darin. So öffnet der Browser den Datei-Dialog
// direkt durch den Klick (Safari blockiert sonst per Skript geöffnete Dialoge).
function pickOption({ iconName, title, sub, accept, multiple = false, directory = false, capture = null, onFiles }) {
  const input = h('input', { type: 'file', class: 'vh', accept: accept || null, multiple: multiple || null, webkitdirectory: directory || null, capture });
  input.addEventListener('change', () => {
    const files = [...(input.files || [])];
    const d = $('#dlg');
    if (d.open) d.closeWith(null);
    if (files.length) onFiles(files);
  });
  return h('label', { class: 'btn pick' }, input, icon(iconName),
    h('span', {}, h('b', {}, title), h('small', { class: 'sub' }, sub)));
}

async function importMenu() {
  const isTouchApple = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const supportsDir = 'webkitdirectory' in document.createElement('input') && !isTouchApple;
  await dialog({
    title: 'Importieren',
    body: [
      h('div', { class: 'menu' },
        pickOption({ iconName: 'upload', title: 'forScore-Sicherung oder -Datei (.4sb, .4sc)', sub: 'Noten mit Schlagwörtern, Setlists und Anmerkungen aus forScore', multiple: true, onFiles: (f) => importFiles(f) }),
        scanCapture('Noten fotografieren', 'Mit der Kamera, auch mehrere Seiten zu einem Stück', (f) => scanFlow(f)),
        scanLibrary('Fotos von Noten', 'Aus der Fotos-App, Ecken anpassen und gerade ziehen', (f) => scanFlow(f)),
        pickOption({ iconName: 'plus', title: 'PDF-Dateien', sub: 'Eine oder viele Dateien, optional zusammen mit einer CSV-Tabelle', accept: 'application/pdf,.pdf,.csv,.tsv,text/csv,.4sb,.4sc', multiple: true, onFiles: (f) => importFiles(f) }),
        supportsDir ? pickOption({ iconName: 'folder', title: 'Ganzer Ordner', sub: 'Alle PDFs darin, auch in Unterordnern. Liegt eine CSV-Tabelle dabei, werden ihre Schlagwörter übernommen.', directory: true, multiple: true, onFiles: (f) => importFiles(f) }) : null,
        pickOption({ iconName: 'list', title: 'Nur Schlagwörter aus Tabelle', sub: 'CSV-Datei, z. B. Metadaten-Export aus forScore, für schon importierte Stücke', accept: '.csv,.tsv,.txt,text/csv', onFiles: (f) => importFiles(f) }),
        pickOption({ iconName: 'download', title: 'Notenreader-Sicherung', sub: 'Von einem anderen Gerät', accept: '.json,application/json', onFiles: (f) => importBackup(f[0]) })),
      isTouchApple ? null : h('p', { class: 'note drop-hint' }, 'Tipp: Du kannst Dateien (PDFs, CSV, .4sb) auch einfach aus dem Finder in dieses Fenster ziehen.'),
    ],
    actions: [{ label: 'Abbrechen', value: null }],
  });
}

/* ---------- Schlagwörter ---------- */
const splitList = (v) => {
  const seen = new Set();
  return String(v || '').split(',').map((t) => t.trim()).filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
};
function valuesOf(s, key) {
  if (key === 'genre') return s.genre ? [s.genre] : [];
  return s[key] || [];
}
function allValues(key) {
  const m = new Map();
  for (const s of scores) for (const v of valuesOf(s, key)) if (!m.has(v.toLowerCase())) m.set(v.toLowerCase(), v);
  return [...m.values()].sort(collator.compare);
}
function nextRef() {
  let max = 0;
  for (const s of scores) if (/^\d+$/.test(s.ref || '')) max = Math.max(max, parseInt(s.ref, 10));
  return String(max + 1).padStart(4, '0');
}
function matchesQuery(s, q) {
  if (!q) return true;
  const hay = [s.title, s.composer, s.ref, s.genre, s.keywords, ...(s.instruments || []), ...(s.tags || [])].join(' ').toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}
function metaLine(s) {
  return [...(s.instruments || []), s.genre].filter(Boolean).join(' · ');
}
// Vorschlags-Chips unter einem Komma-Listen-Feld
function suggestChips(input, values) {
  if (!values.length) return null;
  return h('div', { class: 'chips' }, values.slice(0, 30).map((v) => h('button', {
    type: 'button', class: 'chip',
    onclick: () => {
      const list = splitList(input.value);
      if (!list.some((x) => x.toLowerCase() === v.toLowerCase())) list.push(v);
      input.value = list.join(', ');
    },
  }, v)));
}
function datalist(id, values) {
  return h('datalist', { id }, values.map((v) => h('option', { value: v })));
}

/* ---------- Bibliothek ---------- */
function filteredScores() {
  const q = state.query.trim().toLowerCase();
  const f = state.filter;
  const eq = (arr, v) => !v || arr.some((x) => x.toLowerCase() === v.toLowerCase());
  const list = scores.filter((s) => matchesQuery(s, q)
    && eq(valuesOf(s, 'instruments'), f.instruments) && eq(valuesOf(s, 'genre'), f.genre) && eq(valuesOf(s, 'tags'), f.tags));
  const sorters = {
    title: (a, b) => collator.compare(a.title, b.title),
    composer: (a, b) => collator.compare(a.composer || '￿', b.composer || '￿') || collator.compare(a.title, b.title),
    ref: (a, b) => collator.compare(a.ref || '￿', b.ref || '￿'),
    genre: (a, b) => collator.compare(a.genre || '￿', b.genre || '￿') || collator.compare(a.title, b.title),
    opened: (a, b) => (b.opened || 0) - (a.opened || 0) || collator.compare(a.title, b.title),
    added: (a, b) => b.added - a.added,
  };
  return list.sort(sorters[settings.sort] || sorters.title);
}

function toggleSelect(s) {
  if (state.selected.has(s.id)) state.selected.delete(s.id); else state.selected.add(s.id);
  renderLibrary();
}
function openOrSelect(s) {
  if (state.selecting) toggleSelect(s);
  else openReader([s.id], 0);
}

function scoreCard(s) {
  const selected = state.selected.has(s.id);
  return h('article', { class: `card${state.selecting ? ' selecting' : ''}${selected ? ' selected' : ''}` },
    h('button', {
      class: 'card-open', 'aria-label': state.selecting ? `${s.title} auswählen` : `${s.title} öffnen`, 'aria-pressed': state.selecting ? String(selected) : null,
      onclick: () => openOrSelect(s),
    },
    h('div', { class: 'thumb' },
      s.thumb ? h('img', { src: s.thumb, alt: '', loading: 'lazy', decoding: 'async' }) : null,
      s.ref ? h('span', { class: 'ref-badge' }, s.ref) : null,
      state.selecting ? h('span', { class: 'check' }, selected ? icon('check') : null) : null),
    h('div', { class: 'meta' },
      h('div', { class: 'title' }, s.title),
      h('div', { class: 'composer' }, s.composer || ' '),
      h('div', { class: 'info' }, metaLine(s) || `${s.pages} ${s.pages === 1 ? 'Seite' : 'Seiten'}`),
      s.tags?.length ? h('div', { class: 'tagline' }, s.tags.map((t) => h('span', { class: 'tag' }, t))) : null)),
    state.selecting ? null : h('button', { class: 'btn card-more', 'aria-label': `Optionen für ${s.title}`, onclick: (e) => { e.stopPropagation(); scoreMenu(s); } }, icon('more')));
}

// Kompakte Zeile für die Listenansicht
function scoreRow(s) {
  const selected = state.selected.has(s.id);
  return h('div', { class: `row-item${selected ? ' selected' : ''}` },
    h('button', {
      class: 'row-open', 'aria-label': state.selecting ? `${s.title} auswählen` : `${s.title} öffnen`, 'aria-pressed': state.selecting ? String(selected) : null,
      onclick: () => openOrSelect(s),
    },
    state.selecting ? h('span', { class: 'check' }, selected ? icon('check') : null) : null,
    h('span', { class: 'row-thumb' }, s.thumb ? h('img', { src: s.thumb, alt: '', loading: 'lazy', decoding: 'async' }) : null),
    h('span', { class: 'row-ref' }, s.ref || ''),
    h('span', { class: 'row-main' },
      h('span', { class: 'row-title' }, s.title),
      h('span', { class: 'row-sub' }, [s.composer, metaLine(s)].filter(Boolean).join(' · ') || `${s.pages} ${s.pages === 1 ? 'Seite' : 'Seiten'}`)),
    s.tags?.length ? h('span', { class: 'row-tags' }, s.tags.slice(0, 3).map((t) => h('span', { class: 'tag' }, t)), s.tags.length > 3 ? h('span', { class: 'tag more' }, `+${s.tags.length - 3}`) : null) : null),
    state.selecting ? null : h('button', { class: 'btn row-more', 'aria-label': `Optionen für ${s.title}`, onclick: (e) => { e.stopPropagation(); scoreMenu(s); } }, icon('more')));
}

// Anfangsbuchstabe für Gruppen und Sprungleiste (Umlaute zum Grundbuchstaben)
function initial(v) {
  const c = String(v || '').trim().normalize('NFD').replace(/[^\p{L}\p{N}]/gu, '').charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : '#';
}
// Gruppen je nach Sortierung: [{ key, label, letter, items }]
function groupScores(list) {
  const sort = settings.sort;
  let keyOf;
  if (sort === 'title') keyOf = (s) => { const l = initial(s.title); return [l, l]; };
  else if (sort === 'composer') keyOf = (s) => (s.composer ? [s.composer, initial(s.composer)] : ['Ohne Komponist', '#']);
  else if (sort === 'genre') keyOf = (s) => (s.genre ? [s.genre, initial(s.genre)] : ['Ohne Genre', '#']);
  else if (sort === 'ref') keyOf = (s) => { const l = initial(s.ref); return s.ref ? [l === '#' ? '0–9' : l, l] : ['Ohne ID', '#']; };
  else return [{ key: '', label: '', letter: '', items: list }];
  const groups = [];
  let cur = null;
  for (const s of list) {
    const [label, letter] = keyOf(s);
    if (!cur || cur.label.toLowerCase() !== label.toLowerCase()) { cur = { key: label, label, letter, items: [] }; groups.push(cur); }
    cur.items.push(s);
  }
  return groups;
}

function renderFilters() {
  const box = $('#filters');
  const defs = [['instruments', 'Alle Instrumente'], ['genre', 'Alle Genres'], ['tags', 'Alle Tags']];
  const selects = [];
  for (const [key, label] of defs) {
    const counts = new Map();
    for (const s of scores) for (const v of valuesOf(s, key)) { const k = v.toLowerCase(); counts.set(k, (counts.get(k) || 0) + 1); }
    const vals = allValues(key);
    if (!vals.length) { state.filter[key] = ''; continue; }
    if (state.filter[key] && !vals.some((v) => v.toLowerCase() === state.filter[key].toLowerCase())) state.filter[key] = '';
    const sel = h('select', {
      'aria-label': label, class: state.filter[key] ? 'active' : '',
      onchange: () => { state.filter[key] = sel.value; renderLibrary(); window.scrollTo(0, 0); },
    }, h('option', { value: '' }, label), vals.map((v) => h('option', { value: v }, `${v} (${counts.get(v.toLowerCase()) || 0})`)));
    sel.value = state.filter[key];
    selects.push(sel);
  }
  const any = Object.values(state.filter).some(Boolean);
  box.replaceChildren(...selects);
  if (any) box.append(h('button', { class: 'btn small ghost', onclick: () => { state.filter = { instruments: '', genre: '', tags: '' }; renderLibrary(); } }, 'Filter zurücksetzen'));
  box.hidden = !selects.length;
}

function renderLibrary() {
  updateInboxBadge();
  renderFilters();
  const list = filteredScores();
  const asList = settings.libView !== 'grid';
  const groups = groupScores(list);
  const grouped = groups.length > 1 || (groups[0] && groups[0].label);
  const container = $('#score-grid');
  container.className = asList ? 'lib-list' : 'lib-grid';
  container.replaceChildren(...groups.map((g) => h('section', { class: 'lib-group', id: g.label ? `grp-${encodeURIComponent(g.key)}` : null, 'data-letter': g.letter },
    grouped ? h('h3', { class: 'group-head' }, h('span', {}, g.label), h('span', { class: 'group-count' }, g.items.length)) : null,
    h('div', { class: asList ? 'rows' : 'grid' }, g.items.map(asList ? scoreRow : scoreCard)))));
  const filtered = state.query.trim() || Object.values(state.filter).some(Boolean);
  $('#lib-count').textContent = !scores.length ? '' : filtered ? `${list.length} von ${scores.length} Stücken` : `${scores.length} Stücke`;
  for (const b of $$('#view-toggle button')) b.classList.toggle('active', b.dataset.view === (asList ? 'list' : 'grid'));
  renderAzBar(grouped && list.length > 30 ? groups : []);
  $('#empty-library').hidden = scores.length > 0;
  $('#no-results').hidden = !(scores.length && !list.length);
  $('#btn-select').hidden = !scores.length;
  $('#btn-select').textContent = state.selecting ? 'Fertig' : 'Auswählen';
  const bar = $('#select-bar');
  bar.hidden = !state.selecting;
  if (state.selecting) {
    for (const id of [...state.selected]) if (!scoreById(id)) state.selected.delete(id);
    const n = state.selected.size;
    $('#sel-count').textContent = n === 1 ? '1 ausgewählt' : `${n} ausgewählt`;
    $('#sel-all').textContent = list.length && list.every((s) => state.selected.has(s.id)) ? 'Keine' : 'Alle';
    for (const b of $$('#select-bar [data-needs-sel]')) b.disabled = !n;
  }
  document.body.classList.toggle('has-select-bar', state.selecting);
}

// Sprungleiste A–Z am rechten Rand
const AZ = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
function renderAzBar(groups) {
  const bar = $('#az-bar');
  const present = new Set(groups.map((g) => g.letter));
  bar.hidden = !groups.length;
  document.body.classList.toggle('has-az', !!groups.length);
  if (!groups.length) return;
  bar.replaceChildren(...AZ.map((l) => h('span', { class: present.has(l) ? 'on' : '', 'data-l': l }, l)));
}
function jumpToLetter(l) {
  const secs = $$('#score-grid .lib-group');
  let target = secs.find((s) => s.dataset.letter === l);
  if (!target) { // nächster vorhandener Buchstabe
    const i = AZ.indexOf(l);
    target = secs.find((s) => AZ.indexOf(s.dataset.letter) >= i) || secs[secs.length - 1];
  }
  if (!target) return;
  const top = target.getBoundingClientRect().top + window.scrollY - $('.topbar').offsetHeight + 1;
  window.scrollTo(0, Math.max(0, top));
  const bubble = $('#az-bubble');
  bubble.textContent = l; bubble.hidden = false;
  clearTimeout(jumpToLetter.t);
  jumpToLetter.t = setTimeout(() => { bubble.hidden = true; }, 600);
}
function bindAzBar() {
  const bar = $('#az-bar');
  let active = false;
  const at = (e) => {
    const r = bar.getBoundingClientRect();
    const i = Math.floor(((e.clientY - r.top) / r.height) * AZ.length);
    const l = AZ[Math.max(0, Math.min(AZ.length - 1, i))];
    if (l !== at.last) { at.last = l; jumpToLetter(l); }
  };
  bar.addEventListener('pointerdown', (e) => { active = true; at.last = null; bar.setPointerCapture(e.pointerId); e.preventDefault(); at(e); });
  bar.addEventListener('pointermove', (e) => { if (active) at(e); });
  const end = () => { active = false; };
  bar.addEventListener('pointerup', end);
  bar.addEventListener('pointercancel', end);
}

function setSelecting(on) {
  state.selecting = on;
  state.selected.clear();
  renderLibrary();
}

async function scoreMenu(s) {
  const r = await dialog({
    title: s.title,
    body: h('div', { class: 'menu' },
      h('button', { type: 'button', class: 'btn', onclick: () => $('#dlg').closeWith('edit') }, icon('edit'), 'Titel und Schlagwörter bearbeiten'),
      h('button', { type: 'button', class: 'btn', onclick: () => $('#dlg').closeWith('retag') }, icon('tag'), 'Neu taggen im Eingang'),
      h('button', { type: 'button', class: 'btn', onclick: () => $('#dlg').closeWith('setlist') }, icon('list'), 'Zu Setlist hinzufügen'),
      h('button', { type: 'button', class: 'btn danger', onclick: () => $('#dlg').closeWith('delete') }, icon('trash'), 'Löschen')),
    actions: [{ label: 'Schließen', value: null }],
  });
  if (r === 'edit') editScore(s);
  else if (r === 'setlist') addToSetlistDialog([s.id]);
  else if (r === 'retag') sendToInbox([s.id]);
  else if (r === 'delete') deleteScore(s);
}

function refConflict(ref, exceptId) {
  if (!ref) return null;
  return scores.find((x) => x.id !== exceptId && (x.ref || '').toLowerCase() === ref.toLowerCase()) || null;
}

async function editScore(s) {
  const title = h('input', { value: s.title, autocomplete: 'off' });
  const ref = h('input', { value: s.ref || '', autocomplete: 'off', placeholder: nextRef() });
  const composer = h('input', { value: s.composer || '', autocomplete: 'off', placeholder: 'z. B. J. S. Bach', list: 'dl-composer' });
  const instruments = h('input', { value: (s.instruments || []).join(', '), autocomplete: 'off', placeholder: 'z. B. Klavier, Violine' });
  const genre = h('input', { value: s.genre || '', autocomplete: 'off', placeholder: 'z. B. Barock, Jazz, Kirchenmusik', list: 'dl-genre' });
  const tags = h('input', { value: (s.tags || []).join(', '), autocomplete: 'off', placeholder: 'z. B. Weihnachten, Vorspiel' });
  const keywords = h('input', { value: s.keywords || '', autocomplete: 'off', placeholder: 'weitere Begriffe für die Suche' });
  const composers = [...new Set(scores.map((x) => x.composer).filter(Boolean))].sort(collator.compare);
  const r = await dialog({
    title: 'Stück bearbeiten',
    body: [
      field('Titel', title),
      h('div', { class: 'field-row' }, field('ID', ref), field('Genre', genre)),
      field('Komponist / Interpret', composer),
      field('Instrument(e), mit Komma getrennt', instruments), suggestChips(instruments, allValues('instruments')),
      field('Tags, mit Komma getrennt', tags), suggestChips(tags, allValues('tags')),
      field('Suchbegriffe', keywords),
      datalist('dl-genre', allValues('genre')), datalist('dl-composer', composers),
    ],
    actions: [{ label: 'Abbrechen', value: null }, { label: 'Sichern', value: 'save', primary: true }],
  });
  if (r !== 'save') return;
  const newRef = ref.value.trim();
  const clash = newRef !== (s.ref || "") && refConflict(newRef, s.id);
  if (clash && !await confirmDialog('ID schon vergeben', `Die ID ${newRef} hat bereits „${clash.title}“. Trotzdem sichern?`, 'Trotzdem sichern')) return;
  s.title = title.value.trim() || s.title;
  s.ref = newRef;
  s.composer = composer.value.trim();
  s.instruments = splitList(instruments.value);
  s.genre = genre.value.trim();
  s.tags = splitList(tags.value);
  s.keywords = keywords.value.trim();
  s.inbox = false;
  await db.put('scores', s);
  if (state.tab === 'inbox') renderInbox();
  renderLibrary();
  if (state.tab === 'setlists') renderSetlists();
  toast('Gesichert');
}

// Mehrere Stücke auf einmal verschlagworten
async function bulkTagDialog(ids, { title, intro, cancelLabel = 'Abbrechen' } = {}) {
  const list = ids.map(scoreById).filter(Boolean);
  if (!list.length) return;
  const instruments = h('input', { autocomplete: 'off', placeholder: 'unverändert lassen' });
  const genre = h('input', { autocomplete: 'off', placeholder: 'unverändert lassen', list: 'dl-genre2' });
  const addTags = h('input', { autocomplete: 'off', placeholder: 'z. B. Weihnachten' });
  const removeTags = h('input', { autocomplete: 'off', placeholder: 'optional' });
  const composer = h('input', { autocomplete: 'off', placeholder: 'unverändert lassen' });
  const r = await dialog({
    title: title || `${list.length} Stücke verschlagworten`,
    body: [
      intro ? h('p', { class: 'note' }, intro) : null,
      h('p', { class: 'note' }, 'Leere Felder bleiben bei allen Stücken unverändert.'),
      field('Instrument(e) setzen', instruments), suggestChips(instruments, allValues('instruments')),
      field('Genre setzen', genre), datalist('dl-genre2', allValues('genre')),
      field('Komponist setzen', composer),
      field('Tags hinzufügen', addTags), suggestChips(addTags, allValues('tags')),
      field('Tags entfernen', removeTags),
    ],
    actions: [{ label: cancelLabel, value: null }, { label: 'Übernehmen', value: 'ok', primary: true }],
  });
  if (r !== 'ok') return;
  const inst = splitList(instruments.value);
  const add = splitList(addTags.value);
  const rem = splitList(removeTags.value).map((t) => t.toLowerCase());
  for (const s of list) {
    if (inst.length) s.instruments = inst;
    if (genre.value.trim()) s.genre = genre.value.trim();
    if (composer.value.trim()) s.composer = composer.value.trim();
    if (add.length || rem.length) s.tags = splitList([...(s.tags || []), ...add].join(',')).filter((t) => !rem.includes(t.toLowerCase()));
    if (inst.length || genre.value.trim() || add.length) s.inbox = false;
    await db.put('scores', s);
  }
  renderLibrary();
  toast(list.length === 1 ? '1 Stück aktualisiert' : `${list.length} Stücke aktualisiert`);
}

async function migrateScores() {
  // Ältere Einträge bekommen fortlaufende IDs und die neuen Felder
  const missing = scores.filter((s) => s.ref === undefined).sort((a, b) => a.added - b.added);
  for (const s of missing) { s.ref = nextRef(); }
  for (const s of scores) {
    let changed = missing.includes(s);
    if (!Array.isArray(s.instruments)) { s.instruments = []; changed = true; }
    if (typeof s.genre !== 'string') { s.genre = ''; changed = true; }
    if (!Array.isArray(s.tags)) { s.tags = []; changed = true; }
    if (changed) await db.put('scores', s);
  }
}

async function deleteScore(s) {
  if (!await confirmDialog('Stück löschen?', `„${s.title}“ und alle Anmerkungen darin werden von diesem Gerät gelöscht.`)) return;
  await db.del('scores', s.id);
  await db.del('files', s.id);
  await db.delPrefix('annos', s.id + '|');
  scores = scores.filter((x) => x.id !== s.id);
  for (const sl of setlists) {
    if (sl.items.includes(s.id)) { sl.items = sl.items.filter((x) => x !== s.id); await db.put('setlists', sl); }
  }
  renderLibrary();
  if (state.tab === 'inbox') renderInbox();
  toast('Gelöscht');
}

async function addToSetlistDialog(ids) {
  const nameInput = h('input', { placeholder: 'Name der neuen Setlist', autocomplete: 'off' });
  const body = h('div', {},
    setlists.length ? h('div', { class: 'menu' }, setlists.slice().sort((a, b) => collator.compare(a.name, b.name)).map((sl) =>
      h('button', { type: 'button', class: 'btn', onclick: () => $('#dlg').closeWith('sl:' + sl.id) }, icon('list'),
        sl.name, h('span', { class: 'note', style: 'margin-left:auto' }, ids.length === 1 && sl.items.includes(ids[0]) ? 'schon enthalten' : `${sl.items.length}`)))) : null,
    h('div', { class: 'section-title' }, 'Neue Setlist'),
    h('label', { class: 'field' }, nameInput));
  const r = await dialog({
    title: ids.length === 1 ? 'Zu Setlist hinzufügen' : `${ids.length} Stücke zu Setlist hinzufügen`, body,
    actions: [{ label: 'Abbrechen', value: null }, { label: 'Neu anlegen', value: 'new', primary: true }],
  });
  let sl;
  if (r === 'new') {
    const name = nameInput.value.trim();
    if (!name) { toast('Bitte einen Namen eingeben'); return; }
    sl = { id: uid(), name, items: [], created: Date.now() };
    setlists.push(sl);
  } else if (r?.startsWith('sl:')) {
    sl = setlists.find((x) => x.id === r.slice(3));
  }
  if (!sl) return;
  sl.items.push(...ids);
  await db.put('setlists', sl);
  toast(`Zu „${sl.name}“ hinzugefügt`);
  if (state.tab === 'setlists') renderSetlists();
}

/* ---------- Setlists ---------- */
function renderSetlists() {
  const root = $('#view-setlists');
  if (state.openSetlist) {
    const sl = setlists.find((x) => x.id === state.openSetlist);
    if (sl) { root.replaceChildren(setlistDetail(sl)); return; }
    state.openSetlist = null;
  }
  const sorted = setlists.slice().sort((a, b) => collator.compare(a.name, b.name));
  root.replaceChildren(
    h('div', { class: 'sl-head' }, h('h2', {}, 'Setlists'),
      h('button', { class: 'btn primary', onclick: newSetlist }, icon('plus'), 'Neue Setlist')),
    sorted.length ? h('div', { class: 'list' }, sorted.map((sl) => h('div', { class: 'row' },
      h('div', { class: 'grow', onclick: () => { state.openSetlist = sl.id; renderSetlists(); } },
        h('div', { class: 't' }, sl.name),
        h('div', { class: 's' }, `${sl.items.length} ${sl.items.length === 1 ? 'Stück' : 'Stücke'}`)),
      h('button', { class: 'btn icon', 'aria-label': `${sl.name} spielen`, disabled: !sl.items.length, onclick: () => playSetlist(sl, 0) }, icon('play')),
      h('button', { class: 'btn icon ghost', 'aria-label': 'Öffnen', onclick: () => { state.openSetlist = sl.id; renderSetlists(); } }, icon('chev')))))
      : h('div', { class: 'empty' }, h('h2', {}, 'Noch keine Setlists'),
        h('p', {}, 'Stelle Stücke für ein Konzert, eine Probe oder einen Gottesdienst in der richtigen Reihenfolge zusammen.')));
}

async function newSetlist() {
  const name = h('input', { placeholder: 'z. B. Probe Donnerstag', autocomplete: 'off' });
  const r = await dialog({
    title: 'Neue Setlist', body: field('Name', name),
    actions: [{ label: 'Abbrechen', value: null }, { label: 'Anlegen', value: 'ok', primary: true }],
    onOpen: () => name.focus(),
  });
  if (r !== 'ok' || !name.value.trim()) return;
  const sl = { id: uid(), name: name.value.trim(), items: [], created: Date.now() };
  setlists.push(sl);
  await db.put('setlists', sl);
  state.openSetlist = sl.id;
  renderSetlists();
  pickScores(sl);
}

function setlistDetail(sl) {
  const save = () => db.put('setlists', sl);
  const nameInput = h('input', { value: sl.name, 'aria-label': 'Name der Setlist', onchange: () => { sl.name = nameInput.value.trim() || sl.name; save(); } });
  const items = sl.items.map((id, i) => {
    const s = scoreById(id);
    if (!s) return null;
    return h('div', { class: 'row' },
      h('span', { class: 'num' }, i + 1),
      h('div', { class: 'mini-thumb' }, s.thumb ? h('img', { src: s.thumb, alt: '' }) : null),
      h('div', { class: 'grow', onclick: () => playSetlist(sl, i) },
        h('div', { class: 't' }, s.title), h('div', { class: 's' }, [s.ref, s.composer, metaLine(s)].filter(Boolean).join(' · ') || `${s.pages} Seiten`)),
      h('div', { class: 'btns' },
        h('button', { class: 'btn icon small', 'aria-label': 'Nach oben', disabled: i === 0, onclick: () => move(i, -1) }, icon('up')),
        h('button', { class: 'btn icon small', 'aria-label': 'Nach unten', disabled: i === sl.items.length - 1, onclick: () => move(i, 1) }, icon('down')),
        h('button', { class: 'btn icon small', 'aria-label': 'Aus Setlist entfernen', onclick: () => { sl.items.splice(i, 1); save(); renderSetlists(); } }, icon('x'))));
  });
  function move(i, d) {
    const [x] = sl.items.splice(i, 1);
    sl.items.splice(i + d, 0, x);
    save(); renderSetlists();
  }
  return h('div', {},
    h('div', { class: 'sl-head' },
      h('button', { class: 'btn icon', 'aria-label': 'Zurück', onclick: () => { state.openSetlist = null; renderSetlists(); } }, icon('back')),
      nameInput),
    h('div', { class: 'sl-actions' },
      h('button', { class: 'btn primary', disabled: !sl.items.length, onclick: () => playSetlist(sl, 0) }, icon('play'), 'Spielen'),
      h('button', { class: 'btn', onclick: () => pickScores(sl) }, icon('plus'), 'Stücke hinzufügen'),
      h('button', { class: 'btn danger', style: 'margin-left:auto', onclick: async () => {
        if (!await confirmDialog('Setlist löschen?', `„${sl.name}“ wird gelöscht. Die Noten selbst bleiben erhalten.`)) return;
        await db.del('setlists', sl.id);
        setlists = setlists.filter((x) => x.id !== sl.id);
        state.openSetlist = null; renderSetlists();
      } }, icon('trash'), 'Löschen')),
    sl.items.length ? h('div', { class: 'list' }, items)
      : h('p', { class: 'empty-small' }, 'Noch leer. Füge Stücke hinzu.'));
}

async function pickScores(sl) {
  if (!scores.length) { toast('Importiere zuerst ein paar Noten'); return; }
  const chosen = new Set();
  const search = h('input', { type: 'search', placeholder: 'Suchen', autocomplete: 'off' });
  const listEl = h('div', { class: 'pick-list' });
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const list = scores.filter((s) => matchesQuery(s, q))
      .sort((a, b) => collator.compare(a.title, b.title));
    listEl.replaceChildren(...list.map((s) => {
      const cb = h('input', { type: 'checkbox', checked: chosen.has(s.id), onchange: () => { cb.checked ? chosen.add(s.id) : chosen.delete(s.id); } });
      return h('label', {}, cb, h('div', { class: 'grow' }, h('div', { class: 't' }, s.title), h('div', { class: 's note' }, s.composer || '')),
        sl.items.includes(s.id) ? h('span', { class: 'note' }, 'enthalten') : null);
    }));
  };
  search.addEventListener('input', draw);
  draw();
  const r = await dialog({
    title: `Zu „${sl.name}“ hinzufügen`,
    body: [field('Suche', search), listEl],
    actions: [{ label: 'Abbrechen', value: null }, { label: 'Hinzufügen', value: 'ok', primary: true }],
  });
  if (r !== 'ok' || !chosen.size) return;
  // Reihenfolge wie in der Liste (alphabetisch) übernehmen
  const ordered = scores.filter((s) => chosen.has(s.id)).sort((a, b) => collator.compare(a.title, b.title));
  sl.items.push(...ordered.map((s) => s.id));
  await db.put('setlists', sl);
  renderSetlists();
}

function playSetlist(sl, index) {
  const ids = sl.items.filter((id) => scoreById(id));
  if (!ids.length) return;
  openReader(ids, Math.min(index, ids.length - 1), { setlist: sl, fromStart: true });
}

/* ---------- Leseansicht ---------- */
const R = {
  queue: [], qi: 0, setlist: null, score: null, doc: null, page: 1,
  cache: new Map(), annos: new Map(), annoImgs: new Map(), renderToken: 0,
  annotate: false, tool: 'pen', color: '#1a1a1a', undo: [], sawPen: false, sel: null, stamp: '\uE522',
  chromeTimer: null, wakeLock: null,
};

function viewMode() { return settings.view; } // 'auto' | 'single' | 'width'
function isTwoUp() {
  if (viewMode() !== 'auto' || !R.doc || R.doc.numPages < 2) return false;
  const st = $('#stage');
  return st.clientWidth > st.clientHeight * 1.15 && st.clientWidth >= 700;
}
const stepSize = () => (isTwoUp() ? 2 : 1);

async function openReader(queue, qi = 0, opts = {}) {
  R.queue = queue; R.qi = qi; R.setlist = opts.setlist || null;
  $('#reader').hidden = false;
  document.body.classList.add('reading');
  history.pushState({ reader: true }, '');
  setAnnotate(false);
  showChrome(true);
  await loadScore(queue[qi], opts.fromStart ? 1 : null);
  requestWakeLock();
}

function closeDoc() {
  for (const v of R.cache.values()) v.promise.then(freeView).catch(() => {});
  R.cache.clear();
  R.annos.clear();
  for (const v of R.annoImgs.values()) v.bitmap?.close?.();
  R.annoImgs.clear();
  R.undo = [];
  R.sel = null;
  if (R.doc) { R.doc.destroy(); R.doc = null; }
}
function freeView(v) { if (v && !v.wrap.isConnected) { v.canvas.width = v.canvas.height = 0; v.anno.width = v.anno.height = 0; } }

async function loadScore(id, page) {
  const s = scoreById(id);
  if (!s) { toast('Stück nicht gefunden'); return; }
  closeDoc();
  R.score = s;
  $('#pages').replaceChildren();
  updateReaderInfo();
  try {
    const f = await db.get('files', id);
    R.doc = await pdfjsLib.getDocument({ data: new Uint8Array(f.data.slice(0)) }).promise;
  } catch (e) {
    console.error(e);
    toast('Die PDF-Datei konnte nicht geöffnet werden');
    return;
  }
  const n = R.doc.numPages;
  if (page === 'last') R.page = isTwoUp() ? n - ((n + 1) % 2) : n;
  else R.page = Math.min(Math.max(1, page || s.lastPage || 1), n);
  s.opened = Date.now();
  db.put('scores', s);
  await renderSpread();
}

function closeReader() {
  if (history.state?.reader) history.back();
  else doCloseReader();
}
function doCloseReader() {
  if ($('#reader').hidden) return;
  setAnnotate(false);
  closeDoc();
  $('#pages').replaceChildren();
  $('#reader').hidden = true;
  document.body.classList.remove('reading');
  releaseWakeLock();
  renderLibrary();
  if (state.tab === 'setlists') renderSetlists();
}
window.addEventListener('popstate', () => { if (!$('#reader').hidden) doCloseReader(); });

function updateReaderInfo() {
  const s = R.score;
  if (!s) return;
  $('#r-title').textContent = s.title;
  $('#r-sub').textContent = [s.composer, metaLine(s), s.ref ? `ID ${s.ref}` : ''].filter(Boolean).join(' · ');
  const n = R.doc?.numPages || s.pages;
  const two = isTwoUp() && R.page < n;
  $('#r-page').textContent = two ? `${R.page}–${R.page + 1} / ${n}` : `${R.page} / ${n}`;
  const slider = $('#r-slider');
  slider.max = n; slider.value = R.page; slider.disabled = n < 2;
  const nav = $('#setlist-nav');
  nav.hidden = R.queue.length < 2;
  if (R.queue.length > 1) {
    const prev = scoreById(R.queue[R.qi - 1]);
    const next = scoreById(R.queue[R.qi + 1]);
    $('#sl-prev').disabled = !prev; $('#sl-next').disabled = !next;
    $('#sl-prev-lbl').textContent = prev ? prev.title : '';
    $('#sl-next-lbl').textContent = next ? next.title : 'Ende';
    $('#sl-pos').textContent = `${R.setlist ? R.setlist.name + ' · ' : ''}${R.qi + 1} / ${R.queue.length}`;
  }
}

async function getPageView(n, maxW, maxH) {
  const mode = viewMode();
  const key = `${n}|${Math.round(maxW)}|${Math.round(maxH)}|${mode}`;
  if (R.cache.has(key)) {
    const v = R.cache.get(key);
    R.cache.delete(key); R.cache.set(key, v);
    return v.promise;
  }
  const doc = R.doc;
  const promise = (async () => {
    const page = await doc.getPage(n);
    const vp1 = page.getViewport({ scale: 1 });
    const scale = mode === 'width' ? maxW / vp1.width : Math.min(maxW / vp1.width, maxH / vp1.height);
    const cssW = Math.floor(vp1.width * scale);
    const cssH = Math.floor(vp1.height * scale);
    let dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const maxArea = 9e6; // iOS hat ein knappes Speicherlimit für Canvas
    if (cssW * cssH * dpr * dpr > maxArea) dpr = Math.sqrt(maxArea / (cssW * cssH));
    const vp = page.getViewport({ scale: scale * dpr });
    const canvas = h('canvas', { class: 'pdf' });
    canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
    canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    const anno = h('canvas', { class: 'anno' });
    anno.style.width = cssW + 'px'; anno.style.height = cssH + 'px';
    const wrap = h('div', { class: 'page', 'data-page': n });
    wrap.style.width = cssW + 'px'; wrap.style.height = cssH + 'px';
    wrap.append(canvas, anno);
    const view = { n, wrap, canvas, anno, cssW, cssH, dpr: Math.min(dpr, 2) };
    wrap.view = view;
    await drawAnnos(view);
    return view;
  })();
  R.cache.set(key, { promise });
  promise.catch(() => R.cache.delete(key));
  while (R.cache.size > 6) {
    const oldKey = R.cache.keys().next().value;
    const old = R.cache.get(oldKey);
    R.cache.delete(oldKey);
    old.promise.then(freeView).catch(() => {});
  }
  return promise;
}

function stageSize() {
  const st = $('#stage');
  const cs = getComputedStyle(st);
  const w = st.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const hgt = st.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  return { w: Math.max(100, w), h: Math.max(100, hgt) };
}

async function renderSpread({ scrollTo = 'top' } = {}) {
  if (!R.doc) return;
  const token = ++R.renderToken;
  const st = $('#stage');
  st.classList.toggle('scroll', viewMode() === 'width');
  const n = R.doc.numPages;
  const two = isTwoUp();
  const nums = two ? [R.page, R.page + 1].filter((x) => x <= n) : [R.page];
  const { w, h: hgt } = stageSize();
  const slotW = two ? (w - 8) / 2 : w;
  let views;
  try { views = await Promise.all(nums.map((x) => getPageView(x, slotW, hgt))); }
  catch (e) { console.error(e); if (token === R.renderToken) toast('Seite konnte nicht dargestellt werden'); return; }
  if (token !== R.renderToken) return;
  $('#pages').replaceChildren(...views.map((v) => v.wrap));
  st.scrollTop = scrollTo === 'bottom' ? st.scrollHeight : 0;
  updateReaderInfo();
  if (R.score.lastPage !== R.page) { R.score.lastPage = R.page; db.put('scores', R.score); }
  // Nachbarseiten vorbereiten, damit das Umblättern sofort geht
  const step = nums.length || 1;
  const ahead = [];
  for (let i = 0; i < (two ? 2 : 1); i++) ahead.push(R.page + step + i);
  ahead.push(R.page - step);
  setTimeout(() => {
    if (token !== R.renderToken) return;
    for (const p of ahead) if (p >= 1 && p <= n) getPageView(p, slotW, hgt).catch(() => {});
  }, 120);
}

function flashEdge(side) {
  const el = $('#edge-flash');
  el.className = side + ' on';
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('on')));
}

async function goNext() {
  if (!R.doc) return;
  const st = $('#stage');
  if (viewMode() === 'width' && st.scrollTop + st.clientHeight < st.scrollHeight - 4) {
    st.scrollBy({ top: st.clientHeight * 0.85, behavior: 'smooth' });
    return;
  }
  if (R.page + stepSize() <= R.doc.numPages) {
    R.page += stepSize();
    renderSpread();
  } else if (R.qi < R.queue.length - 1) {
    R.qi++;
    await loadScore(R.queue[R.qi], 1);
    toast(`Nächstes Stück: ${R.score.title}`);
  } else {
    flashEdge('right');
    if (R.queue.length > 1) toast('Ende der Setlist');
  }
}
async function goPrev() {
  if (!R.doc) return;
  const st = $('#stage');
  if (viewMode() === 'width' && st.scrollTop > 4) {
    st.scrollBy({ top: -st.clientHeight * 0.85, behavior: 'smooth' });
    return;
  }
  if (R.page > 1) {
    R.page = Math.max(1, R.page - stepSize());
    renderSpread({ scrollTo: 'bottom' });
  } else if (R.qi > 0) {
    R.qi--;
    await loadScore(R.queue[R.qi], 'last');
    toast(`Zurück zu: ${R.score.title}`);
  } else {
    flashEdge('left');
  }
}
async function gotoScore(delta) {
  const i = R.qi + delta;
  if (i < 0 || i >= R.queue.length) return;
  R.qi = i;
  await loadScore(R.queue[i], 1);
}

function showChrome(show, autoHide = true) {
  $('#reader').classList.toggle('chrome-hidden', !show);
  clearTimeout(R.chromeTimer);
  if (show && autoHide && !R.annotate) R.chromeTimer = setTimeout(() => showChrome(false), 3500);
}
const chromeVisible = () => !$('#reader').classList.contains('chrome-hidden');

async function chooseView() {
  showChrome(true, false);
  const opts = [
    ['auto', 'Ganze Seite', 'Im Querformat auf dem iPad zwei Seiten nebeneinander.'],
    ['single', 'Immer eine Seite', 'Eine Seite, so groß wie möglich.'],
    ['width', 'Breite füllen', 'Seite füllt die Breite, Umblättern scrollt zuerst nach unten. Gut fürs iPhone im Querformat.'],
  ];
  const body = h('div', { class: 'choice' }, opts.map(([v, t, d]) => h('label', {},
    h('input', { type: 'radio', name: 'view', value: v, checked: settings.view === v }),
    h('div', {}, h('b', {}, t), h('small', {}, d)))));
  const r = await dialog({ title: 'Ansicht', body, actions: [{ label: 'Abbrechen', value: null }, { label: 'Übernehmen', value: 'ok', primary: true }] });
  if (r === 'ok') {
    const v = $('input[name=view]:checked', body)?.value;
    if (v && v !== settings.view) {
      settings.view = v; saveSettings();
      if (isTwoUp() && R.page % 2 === 0) R.page = Math.max(1, R.page - 1);
      R.cache.clear();
      renderSpread();
    }
  }
  showChrome(true);
}

/* Bildschirm wach halten
   settings.keepAwake: 'reading' (nur im Lesemodus), 'always' (solange die App offen ist), 'off'.
   Zuerst die Wake-Lock-Schnittstelle; auf iPad/iPhone zusätzlich ein stummes Endlos-Video,
   weil die Schnittstelle in Home-Bildschirm-Apps älterer iOS-Versionen nicht zuverlässig wirkt. */
const isAppleTouch = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let awakeVideo = null;
function shouldStayAwake() {
  if (document.visibilityState !== 'visible') return false;
  const mode = settings.keepAwake || 'reading';
  if (mode === 'off') return false;
  if (mode === 'always') return true;
  return !$('#reader').hidden;
}
async function updateKeepAwake() {
  if (!shouldStayAwake()) {
    try { R.wakeLock?.release(); } catch { /* egal */ }
    R.wakeLock = null;
    if (awakeVideo) awakeVideo.pause();
    return;
  }
  let locked = false;
  try {
    if ('wakeLock' in navigator) {
      if (!R.wakeLock) {
        R.wakeLock = await navigator.wakeLock.request('screen');
        R.wakeLock.addEventListener('release', () => { R.wakeLock = null; });
      }
      locked = true;
    }
  } catch { /* nicht erlaubt oder nicht unterstützt */ }
  // Einstellung kann sich während des Wartens geändert haben
  if (!shouldStayAwake()) { try { R.wakeLock?.release(); } catch { /* egal */ } R.wakeLock = null; awakeVideo?.pause(); return; }
  if (!locked || isAppleTouch) {
    if (!awakeVideo) {
      awakeVideo = h('video', { src: 'vendor/wach.mp4', muted: true, playsinline: true, loop: true, 'aria-hidden': 'true', style: 'position:fixed;width:1px;height:1px;opacity:0.01;pointer-events:none;left:0;bottom:0' });
      awakeVideo.muted = true; awakeVideo.playsInline = true;
      document.body.append(awakeVideo);
    }
    awakeVideo.play().catch(() => { /* braucht ein Antippen; wird beim nächsten Tippen erneut versucht */ });
  }
}
const requestWakeLock = () => updateKeepAwake();
const releaseWakeLock = () => setTimeout(updateKeepAwake, 0);
document.addEventListener('visibilitychange', updateKeepAwake);
// Video-Wiedergabe ist auf iOS nur nach einer Berührung erlaubt
document.addEventListener('pointerup', () => { if (shouldStayAwake() && (!R.wakeLock || (awakeVideo && awakeVideo.paused))) updateKeepAwake(); }, true);

/* ---------- Anmerkungen ---------- */
const SIZES = { pen: [0.0016, 0.0028, 0.0048], hl: [0.012, 0.02, 0.03] };
const annoKey = (n) => `${R.score.id}|${n}`;

async function getAnnos(n) {
  if (!R.annos.has(n)) {
    const rec = await db.get('annos', annoKey(n));
    R.annos.set(n, rec?.strokes || []);
    // Übernommene forScore-Anmerkungen liegen als Bild vor
    if (rec?.img) {
      try { R.annoImgs.set(n, { blob: rec.img, fs: rec.fs, bitmap: await createImageBitmap(rec.img) }); }
      catch (e) { console.warn('Anmerkungsbild', e); }
    }
  }
  return R.annos.get(n);
}
function saveAnnos(n) {
  const strokes = R.annos.get(n) || [];
  const img = R.annoImgs.get(n);
  if (strokes.length || img) db.put('annos', { key: annoKey(n), strokes, ...(img ? { img: img.blob, fs: img.fs } : {}) });
  else db.del('annos', annoKey(n));
}
// Bild aus forScore passend auf die Seite legen. forScore speichert die Anmerkung als Bildschirmbild
// (768 Punkte breit); die Seite ist darin eingepasst und ggf. per Zuschnitt (rect/zoom) vergrößert.
function drawAnnoImage(ctx, img, W, H) {
  const bm = img.bitmap;
  if (!bm) return;
  const fs = img.fs || {};
  const k = bm.width / 768;
  const boxW = 768, boxH = bm.height / k;
  const ratio = H / W;
  let pw, ph;
  if (ratio > boxH / boxW) { ph = boxH; pw = boxH / ratio; } else { pw = boxW; ph = boxW * ratio; }
  const ox = (boxW - pw) / 2, oy = (boxH - ph) / 2;
  const z = fs.zoom || 1, rx = fs.rx || 0, ry = fs.ry || 0;
  const sc = W / pw;
  ctx.drawImage(bm, (rx - ox) * sc, (ry - oy) * sc, (bm.width / (k * z)) * sc, (bm.height / (k * z)) * sc);
}
// Musikzeichen (SMuFL-Codepunkte, dargestellt mit der Schrift Bravura)
const STAMP_GROUPS = [
  ['Dynamik', [['', 'pp'], ['', 'p'], ['', 'mp'], ['', 'mf'], ['', 'f'], ['', 'ff'], ['', 'fff'], ['', 'sfz'], ['', 'fp'], ['hairpin<', 'Crescendo (ziehen)'], ['hairpin>', 'Decrescendo (ziehen)']]],
  ['Artikulation', [['', 'Akzent'], ['', 'Staccato'], ['', 'Tenuto'], ['', 'Marcato'], ['', 'Fermate'], ['', 'Atemzeichen'], ['', 'Zäsur']]],
  ['Vorzeichen', [['', 'Kreuz'], ['', 'B'], ['', 'Auflösung'], ['', 'Doppelkreuz'], ['', 'Doppel-B']]],
  ['Noten', [['', 'Ganze'], ['', 'Halbe'], ['', 'Viertel'], ['', 'Achtel'], ['', 'Sechzehntel'], ['', 'Punkt']]],
  ['Pausen', [['', 'Ganze Pause'], ['', 'Halbe Pause'], ['', 'Viertelpause'], ['', 'Achtelpause'], ['', 'Sechzehntelpause']]],
  ['Form', [['', 'Segno'], ['', 'Coda'], ['', 'Wiederholung Anfang'], ['', 'Wiederholung Ende'], ['', 'D.C.'], ['', 'D.S.'], ['', 'Violinschlüssel'], ['', 'Bassschlüssel']]],
];
const STAMP_FONT = 'Bravura';
const DEFAULT_STAMP_SIZE = 0.05; // Schriftgröße relativ zur Seitenbreite (≈ eine Notenzeile hoch)
const boxCache = new WeakMap();   // Element -> [x, y, w, h] normiert

function paintAnnos(view, extra) {
  const strokes = R.annos.get(view.n) || [];
  const img = R.annoImgs.get(view.n);
  const sel = R.sel && R.sel.n === view.n ? R.sel.item : null;
  if (!strokes.length && !img && !extra && !view.anno.width) return;
  ensureAnnoCanvas(view);
  const ctx = view.anno.getContext('2d');
  const W = view.anno.width, H = view.anno.height;
  ctx.clearRect(0, 0, W, H);
  if (img) drawAnnoImage(ctx, img, W, H);
  for (const st of strokes) drawStroke(ctx, st, W, H);
  if (extra) drawStroke(ctx, extra, W, H);
  if (sel && strokes.includes(sel)) drawSelection(ctx, sel, W, H);
}
function ensureAnnoCanvas(view) {
  const w = Math.round(view.cssW * view.dpr), hh = Math.round(view.cssH * view.dpr);
  if (view.anno.width !== w || view.anno.height !== hh) { view.anno.width = w; view.anno.height = hh; }
}
function drawStroke(ctx, s, W, H) {
  if (s.t === 'stamp' || s.t === 'text') return drawGlyph(ctx, s, W, H);
  if (s.t === 'rect') {
    ctx.save(); ctx.fillStyle = s.c || '#ffffff';
    ctx.fillRect(s.x * W, s.y * H, s.w * W, s.h * H);
    // Beim Bearbeiten den Rand andeuten, damit die Abdeckung auffindbar bleibt
    if (R.annotate) { ctx.strokeStyle = 'rgba(120,120,120,.6)'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.strokeRect(s.x * W, s.y * H, s.w * W, s.h * H); }
    ctx.restore();
    boxCache.set(s, [s.x, s.y, s.w, s.h]);
    return;
  }
  if (s.t === 'hairpin') return drawHairpin(ctx, s, W, H);
  const p = s.p;
  if (!p || p.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = s.c;
  ctx.lineWidth = Math.max(1, s.w * W);
  if (s.t === 'hl') { ctx.globalAlpha = 0.38; ctx.globalCompositeOperation = 'multiply'; ctx.lineCap = 'butt'; }
  ctx.beginPath();
  ctx.moveTo(p[0] * W, p[1] * H);
  if (p.length === 2) ctx.lineTo(p[0] * W + 0.1, p[1] * H + 0.1);
  for (let i = 2; i < p.length - 2; i += 2) {
    const mx = (p[i] + p[i + 2]) / 2, my = (p[i + 1] + p[i + 3]) / 2;
    ctx.quadraticCurveTo(p[i] * W, p[i + 1] * H, mx * W, my * H);
  }
  if (p.length >= 4) ctx.lineTo(p[p.length - 2] * W, p[p.length - 1] * H);
  ctx.stroke();
  ctx.restore();
}
function drawGlyph(ctx, s, W, H) {
  const px = s.s * W;
  ctx.save();
  ctx.fillStyle = s.c || '#111';
  ctx.font = s.t === 'stamp' ? `${px}px ${STAMP_FONT}` : `italic 700 ${px}px Georgia, "Times New Roman", serif`;
  ctx.textBaseline = 'alphabetic';
  const text = s.t === 'stamp' ? s.g : s.txt;
  const m = ctx.measureText(text);
  const left = m.actualBoundingBoxLeft || 0, right = m.actualBoundingBoxRight || m.width;
  const asc = m.actualBoundingBoxAscent || px * 0.7, desc = m.actualBoundingBoxDescent || 0;
  const bw = left + right, bh = asc + desc;
  // (x, y) ist die Mitte des sichtbaren Zeichens
  const ox = s.x * W - bw / 2 + left, oy = s.y * H - bh / 2 + asc;
  ctx.fillText(text, ox, oy);
  ctx.restore();
  boxCache.set(s, [(s.x * W - bw / 2) / W, (s.y * H - bh / 2) / H, bw / W, bh / H]);
}
function drawHairpin(ctx, s, W, H) {
  const x1 = s.x1 * W, x2 = s.x2 * W, y1 = s.y1 * H, y2 = s.y2 * H;
  const open = s.o * W; // Öffnung am weiten Ende
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const nx = -Math.sin(ang) * open / 2, ny = Math.cos(ang) * open / 2;
  const [tipX, tipY, wideX, wideY] = s.dir === '<' ? [x1, y1, x2, y2] : [x2, y2, x1, y1];
  ctx.save();
  ctx.strokeStyle = s.c || '#111';
  ctx.lineWidth = Math.max(1, 0.0022 * W);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(wideX + nx, wideY + ny); ctx.lineTo(tipX, tipY); ctx.lineTo(wideX - nx, wideY - ny);
  ctx.stroke();
  ctx.restore();
  const xs = [x1, x2], ys = [y1 - open / 2, y1 + open / 2, y2 - open / 2, y2 + open / 2];
  const minX = Math.min(...xs), minY = Math.min(...ys);
  boxCache.set(s, [minX / W, minY / H, (Math.max(...xs) - minX) / W, (Math.max(...ys) - minY) / H]);
}
const HANDLE = 22; // Griffgröße in Bildschirmpunkten
function selectionGeom(item, W, H, dpr) {
  const b = boxCache.get(item) || [0, 0, 0, 0];
  const pad = 6 * dpr;
  const x = b[0] * W - pad, y = b[1] * H - pad, w = b[2] * W + pad * 2, hh = b[3] * H + pad * 2;
  const hs = HANDLE * dpr;
  return { x, y, w, h: hh, resize: [x + w - hs / 2, y + hh - hs / 2, hs], del: [x + w - hs / 2, y - hs / 2, hs] };
}
function drawSelection(ctx, item, W, H) {
  const dpr = W / ctx.canvas.clientWidth || 1;
  const g = selectionGeom(item, W, H, dpr);
  ctx.save();
  ctx.strokeStyle = '#e8a33d'; ctx.lineWidth = 2 * dpr; ctx.setLineDash([6 * dpr, 4 * dpr]);
  ctx.strokeRect(g.x, g.y, g.w, g.h);
  ctx.setLineDash([]);
  // Griff zum Vergrößern (unten rechts)
  ctx.fillStyle = '#e8a33d';
  ctx.fillRect(g.resize[0], g.resize[1], g.resize[2], g.resize[2]);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * dpr;
  ctx.beginPath();
  ctx.moveTo(g.resize[0] + g.resize[2] * 0.3, g.resize[1] + g.resize[2] * 0.7); ctx.lineTo(g.resize[0] + g.resize[2] * 0.7, g.resize[1] + g.resize[2] * 0.3);
  ctx.stroke();
  // Löschen (oben rechts)
  ctx.fillStyle = '#c0392b';
  ctx.beginPath(); ctx.arc(g.del[0] + g.del[2] / 2, g.del[1] + g.del[2] / 2, g.del[2] / 2, 0, Math.PI * 2); ctx.fill();
  const c = g.del[2] / 2, cx = g.del[0] + c, cy = g.del[1] + c;
  ctx.beginPath(); ctx.moveTo(cx - c * 0.4, cy - c * 0.4); ctx.lineTo(cx + c * 0.4, cy + c * 0.4); ctx.moveTo(cx + c * 0.4, cy - c * 0.4); ctx.lineTo(cx - c * 0.4, cy + c * 0.4); ctx.stroke();
  ctx.restore();
}
async function drawAnnos(view) {
  await getAnnos(view.n);
  paintAnnos(view);
}

function setAnnotate(on) {
  R.annotate = on;
  $('#anno-bar').hidden = !on;
  $('#reader-top').hidden = on;
  $('#stage').classList.toggle('drawing', on);
  $('#r-annotate').classList.toggle('active', on);
  if (!on) selectItem(null);
  for (const w of $$('#pages .page')) if (w.view) paintAnnos(w.view);
  if (on) { showChrome(true, false); updateToolUI(); }
  else { $('#stamp-bar').hidden = true; if (!$('#reader').hidden) showChrome(true); }
}
function updateToolUI() {
  for (const b of $$('#anno-bar .tool[data-tool]')) {
    const colorTool = b.dataset.tool === 'pen' || b.dataset.tool === 'hl';
    b.classList.toggle('active', b.dataset.tool === R.tool && (!colorTool || b.dataset.color === R.color));
  }
  for (const b of $$('#anno-bar .tool[data-size]')) b.classList.toggle('active', +b.dataset.size === settings.penSize);
  $('#stamp-bar').hidden = !(R.annotate && R.tool === 'stamp');
  for (const b of $$('#stamp-bar .stamp')) b.classList.toggle('active', b.dataset.g === R.stamp);
}
function buildStampBar() {
  const bar = $('#stamp-bar');
  bar.replaceChildren(...STAMP_GROUPS.flatMap(([label, items], gi) => [
    gi ? h('span', { class: 'sep' }) : null,
    h('span', { class: 'stamp-label' }, label),
    ...items.map(([g, name]) => h('button', {
      class: `stamp${g.startsWith('hairpin') ? ' hp' : ''}`, 'data-g': g, title: name, 'aria-label': name,
      onclick: () => { R.stamp = g; updateToolUI(); },
    }, g === 'hairpin<' ? h('span', { class: 'hp-icon' }, '<') : g === 'hairpin>' ? h('span', { class: 'hp-icon' }, '>') : g)),
  ]).filter(Boolean));
}

function pagePoint(view, e) {
  const r = view.wrap.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
}
function hitItem(view, x, y) {
  const list = R.annos.get(view.n) || [];
  const tol = 0.006;
  for (let i = list.length - 1; i >= 0; i--) {
    const it = list[i];
    if (!['stamp', 'text', 'rect', 'hairpin'].includes(it.t)) continue;
    const b = boxCache.get(it);
    if (b && x >= b[0] - tol && x <= b[0] + b[2] + tol && y >= b[1] - tol && y <= b[1] + b[3] + tol) return it;
  }
  return null;
}
function eraseAt(view, x, y) {
  const strokes = R.annos.get(view.n) || [];
  const tol = 0.012;
  const hit = hitItem(view, x, y);
  const keep = strokes.filter((s) => {
    if (s === hit) return false;
    if (!s.p) return true;
    for (let i = 0; i < s.p.length; i += 2) {
      const dx = s.p[i] - x, dy = (s.p[i + 1] - y) * (view.cssH / view.cssW);
      if (dx * dx + dy * dy < (tol + s.w / 2) ** 2) return false;
    }
    return true;
  });
  if (keep.length !== strokes.length) {
    R.annos.set(view.n, keep);
    drawAnnos(view);
    return true;
  }
  return false;
}
function viewOfPage(n) { return $$('#pages .page').map((w) => w.view).find((v) => v.n === n); }
function selectItem(sel) {
  const old = R.sel;
  R.sel = sel;
  if (old) { const v = viewOfPage(old.n); if (v) paintAnnos(v); }
  if (sel) { const v = viewOfPage(sel.n); if (v) paintAnnos(v); }
  $('#a-delete').hidden = !sel;
}
function deleteSelected() {
  if (!R.sel) return;
  const { n, item } = R.sel;
  const list = R.annos.get(n) || [];
  R.undo.push({ n, strokes: structuredClone(list) });
  R.annos.set(n, list.filter((x) => x !== item));
  saveAnnos(n);
  selectItem(null);
}
const snapshot = (n) => structuredClone(R.annos.get(n) || []);

let drawing = null;
async function onDrawDown(e) {
  if (!R.annotate) return;
  const wrap = e.target.closest?.('.page');
  if (!wrap?.view) return;
  if (e.pointerType === 'pen') R.sawPen = true;
  // Sobald der Pencil benutzt wurde, zeichnen Finger nicht mehr (Handballen-Schutz)
  if (R.sawPen && e.pointerType === 'touch') return;
  e.preventDefault();
  const view = wrap.view;
  const [x, y] = pagePoint(view, e);
  try { wrap.setPointerCapture(e.pointerId); } catch { /* egal */ }
  ensureAnnoCanvas(view);
  const W = view.anno.width, H = view.anno.height, dpr = view.dpr;

  // Ausgewähltes Element: Griffe zum Löschen / Vergrößern
  if (R.sel && R.sel.n === view.n) {
    const g = selectionGeom(R.sel.item, W, H, dpr);
    const px = x * W, py = y * H;
    const inBox = ([bx, by, bs]) => px >= bx - 6 && px <= bx + bs + 6 && py >= by - 6 && py <= by + bs + 6;
    if (inBox(g.del)) { deleteSelected(); return; }
    if (inBox(g.resize)) {
      drawing = { view, mode: 'resize', item: R.sel.item, start: [x, y], orig: structuredClone(R.sel.item), before: snapshot(view.n), id: e.pointerId };
      return;
    }
  }
  // Vorhandenes Zeichen antippen = auswählen und verschieben (bei Zeichen-Werkzeugen)
  if (['stamp', 'text', 'rect', 'select', 'hairpin'].includes(R.tool)) {
    const hit = hitItem(view, x, y);
    if (hit) {
      selectItem({ n: view.n, item: hit });
      drawing = { view, mode: 'move', item: hit, start: [x, y], orig: structuredClone(hit), before: snapshot(view.n), id: e.pointerId };
      return;
    }
    if (R.sel) selectItem(null);
  }
  const before = snapshot(view.n);
  if (R.tool === 'select') return;
  if (R.tool === 'eraser') {
    drawing = { view, erase: true, before, changed: eraseAt(view, x, y), id: e.pointerId };
    return;
  }
  if (R.tool === 'rect') {
    const item = { t: 'rect', x, y, w: 0, h: 0, c: '#ffffff' };
    drawing = { view, mode: 'create-rect', item, start: [x, y], before, id: e.pointerId };
    return;
  }
  if (R.tool === 'stamp' && R.stamp?.startsWith('hairpin')) {
    const item = { t: 'hairpin', dir: R.stamp.slice(-1), x1: x, y1: y, x2: x, y2: y, o: 0.022, c: '#111' };
    drawing = { view, mode: 'create-hairpin', item, before, id: e.pointerId };
    return;
  }
  if (R.tool === 'stamp') {
    if (!R.stamp) { toast('Erst oben ein Zeichen wählen'); return; }
    const item = { t: 'stamp', g: R.stamp, x, y, s: settings.stampSize || DEFAULT_STAMP_SIZE, c: '#111' };
    addItem(view, item, before);
    drawing = { view, mode: 'move', item, start: [x, y], orig: structuredClone(item), before: null, id: e.pointerId };
    return;
  }
  if (R.tool === 'text') {
    drawing = null;
    const txt = await askText();
    if (!txt) return;
    const item = { t: 'text', txt, x, y, s: 0.03, c: '#111' };
    addItem(view, item, before);
    return;
  }
  const t = R.tool;
  const stroke = { t, c: R.color, w: SIZES[t][settings.penSize - 1], p: [x, y] };
  drawing = { view, stroke, before, id: e.pointerId };
}
function addItem(view, item, before) {
  const list = R.annos.get(view.n) || [];
  list.push(item);
  R.annos.set(view.n, list);
  R.undo.push({ n: view.n, strokes: before });
  saveAnnos(view.n);
  R.sel = { n: view.n, item };
  $('#a-delete').hidden = false;
  paintAnnos(view);
}
async function askText() {
  const input = h('input', { placeholder: 'z. B. Trio, D.S. al Fine, 2. Stimme', autocomplete: 'off' });
  const r = await dialog({
    title: 'Text einfügen', body: field('Text', input),
    actions: [{ label: 'Abbrechen', value: null }, { label: 'Einfügen', value: 'ok', primary: true }],
    onOpen: () => input.focus(),
  });
  return r === 'ok' ? input.value.trim() : '';
}
function onDrawMove(e) {
  if (!drawing || e.pointerId !== drawing.id) return;
  e.preventDefault();
  const { view } = drawing;
  const [x, y] = pagePoint(view, e);
  const d = drawing;
  if (d.mode === 'move') {
    const dx = x - d.start[0], dy = y - d.start[1];
    const it = d.item, o = d.orig;
    if (it.t === 'rect') { it.x = o.x + dx; it.y = o.y + dy; }
    else if (it.t === 'hairpin') { it.x1 = o.x1 + dx; it.x2 = o.x2 + dx; it.y1 = o.y1 + dy; it.y2 = o.y2 + dy; }
    else { it.x = o.x + dx; it.y = o.y + dy; }
    d.changed = true;
    paintAnnos(view);
    return;
  }
  if (d.mode === 'resize') {
    const it = d.item, o = d.orig;
    if (it.t === 'rect') { it.w = Math.max(0.005, o.w + x - d.start[0]); it.h = Math.max(0.005, o.h + y - d.start[1]); }
    else if (it.t === 'hairpin') { it.x2 = o.x2 + x - d.start[0]; it.y2 = o.y2 + y - d.start[1]; }
    else {
      const ar = view.cssH / view.cssW;
      const d0 = Math.hypot(d.start[0] - o.x, (d.start[1] - o.y) * ar);
      const d1 = Math.hypot(x - o.x, (y - o.y) * ar);
      if (d0 > 0.001) it.s = Math.min(0.3, Math.max(0.008, o.s * (d1 / d0)));
    }
    d.changed = true;
    paintAnnos(view);
    return;
  }
  if (d.mode === 'create-rect') {
    const [sx, sy] = d.start;
    Object.assign(d.item, { x: Math.min(sx, x), y: Math.min(sy, y), w: Math.abs(x - sx), h: Math.abs(y - sy) });
    paintAnnos(view, d.item);
    return;
  }
  if (d.mode === 'create-hairpin') {
    d.item.x2 = x; d.item.y2 = d.item.y1 + (y - d.item.y1) * 0.15; // fast waagerecht
    paintAnnos(view, d.item);
    return;
  }
  const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of (events.length ? events : [e])) {
    const [px, py] = pagePoint(view, ev);
    if (d.erase) { if (eraseAt(view, px, py)) d.changed = true; continue; }
    const p = d.stroke.p;
    const lx = p[p.length - 2], ly = p[p.length - 1];
    if (Math.abs(px - lx) + Math.abs(py - ly) < 0.0015) continue;
    p.push(px, py);
  }
  if (!d.erase) paintAnnos(view, d.stroke);
}
function onDrawUp(e) {
  if (!drawing || e.pointerId !== drawing.id) return;
  const d = drawing;
  drawing = null;
  if (d.mode === 'move' || d.mode === 'resize') {
    if (d.item.t === 'stamp' && d.mode === 'resize') { settings.stampSize = d.item.s; saveSettings(); }
    if (d.changed) { if (d.before) R.undo.push({ n: d.view.n, strokes: d.before }); saveAnnos(d.view.n); }
    paintAnnos(d.view);
    return;
  }
  if (d.mode === 'create-rect') {
    if (d.item.w < 0.01 || d.item.h < 0.005) { paintAnnos(d.view); toast('Zum Abdecken ein Rechteck über die Stelle ziehen'); return; }
    addItem(d.view, d.item, d.before);
    return;
  }
  if (d.mode === 'create-hairpin') {
    if (Math.abs(d.item.x2 - d.item.x1) < 0.02) { paintAnnos(d.view); toast('Gabel waagerecht ziehen'); return; }
    addItem(d.view, d.item, d.before);
    return;
  }
  if (d.erase) {
    if (d.changed) { R.undo.push({ n: d.view.n, strokes: d.before }); saveAnnos(d.view.n); }
    return;
  }
  const list = R.annos.get(d.view.n) || [];
  list.push(d.stroke);
  R.annos.set(d.view.n, list);
  R.undo.push({ n: d.view.n, strokes: d.before });
  saveAnnos(d.view.n);
  drawAnnos(d.view);
}
async function redrawVisible(n) {
  for (const wrap of $$('#pages .page')) if (wrap.view.n === n) await drawAnnos(wrap.view);
  // Zwischengespeicherte Ansichten derselben Seite auch aktualisieren
  for (const v of R.cache.values()) v.promise.then((view) => { if (view.n === n && !view.wrap.isConnected) drawAnnos(view); }).catch(() => {});
}
async function undoAnno() {
  const u = R.undo.pop();
  if (!u) { toast('Nichts rückgängig zu machen'); return; }
  selectItem(null);
  R.annos.set(u.n, u.strokes);
  if ('img' in u) { if (u.img) R.annoImgs.set(u.n, u.img); else R.annoImgs.delete(u.n); }
  saveAnnos(u.n);
  redrawVisible(u.n);
}
async function clearPageAnnos() {
  const visible = $$('#pages .page').map((w) => w.view.n);
  let any = false;
  for (const n of visible) {
    const s = R.annos.get(n) || [];
    const img = R.annoImgs.get(n) || null;
    if (s.length || img) { selectItem(null); R.undo.push({ n, strokes: s.slice(), img }); R.annos.set(n, []); R.annoImgs.delete(n); saveAnnos(n); redrawVisible(n); any = true; }
  }
  toast(any ? 'Anmerkungen entfernt (Rückgängig möglich)' : 'Keine Anmerkungen auf dieser Seite');
}

/* ---------- Gesten und Tasten im Lesemodus ---------- */
let gesture = null;
function onStageDown(e) {
  if (R.annotate) { onDrawDown(e); if (drawing) return; }
  if (!e.isPrimary) { gesture = null; return; }
  gesture = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId };
}
function onStageUp(e) {
  if (R.annotate && drawing) { onDrawUp(e); return; }
  if (!gesture || e.pointerId !== gesture.id) return;
  const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y, dt = Date.now() - gesture.t;
  gesture = null;
  if (viewMode() !== 'width' || Math.abs(dx) > Math.abs(dy) * 1.5) {
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 800) {
      if (dx < 0) goNext(); else goPrev();
      return;
    }
  }
  if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && dt < 600) {
    if (R.annotate) return; // im Anmerke-Modus kein Umblättern per Tippen
    const st = $('#stage').getBoundingClientRect();
    const rx = (e.clientX - st.left) / st.width;
    if (rx < 0.3) goPrev();
    else if (rx > 0.7) goNext();
    else showChrome(!chromeVisible());
  }
}

document.addEventListener('keydown', (e) => {
  if ($('#reader').hidden || $('#dlg').open) return;
  if (e.target.matches?.('input:not([type=range]), textarea, select')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (R.annotate && R.sel && (k === 'Backspace' || k === 'Delete')) { e.preventDefault(); deleteSelected(); return; }
  if (k === ' ' && e.shiftKey) { e.preventDefault(); goPrev(); return; }
  if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(k)) { e.preventDefault(); goNext(); }
  else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) { e.preventDefault(); goPrev(); }
  else if (k === 'Home') { e.preventDefault(); R.page = 1; renderSpread(); }
  else if (k === 'End') { e.preventDefault(); R.page = R.doc.numPages; renderSpread(); }
  else if (k === 'Escape') { if (R.annotate && R.sel) selectItem(null); else if (R.annotate) setAnnotate(false); else closeReader(); }
});

let resizeTimer;
window.addEventListener('resize', () => {
  if ($('#reader').hidden) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    for (const v of R.cache.values()) v.promise.then(freeView).catch(() => {});
    R.cache.clear();
    if (isTwoUp() && R.page % 2 === 0) R.page -= 1;
    renderSpread();
  }, 180);
});

/* ---------- Einstellungen und Sicherung ---------- */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}
async function exportBackup() {
  toast('Sicherung wird erstellt …', 60000);
  const [allScores, allSetlists, allAnnos] = await Promise.all([db.all('scores'), db.all('setlists'), db.all('annos')]);
  const parts = [`{"app":"Notenreader","format":1,"exported":${JSON.stringify(new Date().toISOString())},`,
    `"scores":${JSON.stringify(allScores)},"setlists":${JSON.stringify(allSetlists)},"annos":${JSON.stringify(allAnnos)},"files":[`];
  let first = true;
  for (const s of allScores) {
    const f = await db.get('files', s.id);
    if (!f) continue;
    const b64 = await blobToBase64(new Blob([f.data], { type: 'application/pdf' }));
    parts.push(`${first ? '' : ','}{"id":${JSON.stringify(s.id)},"data":"${b64}"}`);
    first = false;
  }
  parts.push(']}');
  const blob = new Blob(parts, { type: 'application/json' });
  const date = new Date().toISOString().slice(0, 10);
  const a = h('a', { href: URL.createObjectURL(blob), download: `Notenreader-Sicherung-${date}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  toast('Sicherung gespeichert');
}
async function importBackup(file) {
  try {
    toast('Sicherung wird gelesen …', 60000);
    const data = JSON.parse(await file.text());
    if (data.app !== 'Notenreader' || !Array.isArray(data.scores)) throw new Error('Keine Notenreader-Sicherung');
    const existing = new Set(scores.map((s) => s.id));
    let added = 0;
    for (const f of data.files || []) {
      if (existing.has(f.id)) continue;
      const s = data.scores.find((x) => x.id === f.id);
      if (!s) continue;
      const bin = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
      await db.put('files', { id: f.id, data: bin.buffer });
      await db.put('scores', s);
      added++;
    }
    for (const a of data.annos || []) {
      const id = a.key.split('|')[0];
      if (!existing.has(id)) await db.put('annos', a);
    }
    const slIds = new Set(setlists.map((s) => s.id));
    for (const sl of data.setlists || []) if (!slIds.has(sl.id)) await db.put('setlists', sl);
    await loadData();
    renderLibrary(); renderSetlists();
    toast(`${added} Stücke wiederhergestellt`);
  } catch (e) {
    console.error(e);
    toast('Die Datei ist keine gültige Notenreader-Sicherung');
  }
}

async function openSettings() {
  let storageInfo = '';
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.usage != null) storageInfo = `Belegt: ${(est.usage / 1048576).toFixed(1)} MB`;
    const persisted = await navigator.storage?.persisted?.();
    if (persisted) storageInfo += ' · dauerhaft gespeichert';
  } catch { /* egal */ }
  const body = h('div', {},
    h('div', { class: 'section-title' }, 'Ansicht beim Lesen'),
    h('div', { class: 'choice' }, [
      ['auto', 'Ganze Seite', 'Im Querformat auf großen Bildschirmen zwei Seiten nebeneinander.'],
      ['single', 'Immer eine Seite', ''],
      ['width', 'Breite füllen', 'Zum Lesen auf dem iPhone im Querformat.'],
    ].map(([v, t, d]) => h('label', {},
      h('input', { type: 'radio', name: 'sview', value: v, checked: settings.view === v, onchange: () => { settings.view = v; saveSettings(); } }),
      h('div', {}, h('b', {}, t), d ? h('small', {}, d) : null)))),
    h('div', { class: 'section-title' }, 'Bildschirm anlassen'),
    h('div', { class: 'choice' }, [
      ['reading', 'Beim Lesen', 'Solange Noten offen sind, geht der Bildschirm nicht aus.'],
      ['always', 'Immer', 'Solange der Notenreader geöffnet ist, auch in der Übersicht.'],
      ['off', 'Aus', 'Der Bildschirm geht wie eingestellt automatisch aus.'],
    ].map(([v, t, d]) => h('label', {},
      h('input', { type: 'radio', name: 'sawake', value: v, checked: (settings.keepAwake || 'reading') === v, onchange: () => { settings.keepAwake = v; saveSettings(); updateKeepAwake(); } }),
      h('div', {}, h('b', {}, t), h('small', {}, d))))),
    h('div', { class: 'section-title' }, 'Umblättern'),
    h('p', { class: 'note' }, 'Tippen auf den rechten oder linken Rand, Wischen, oder ein Bluetooth-Pedal bzw. eine Tastatur (Pfeiltasten, Bild auf/ab, Leertaste).'),
    h('div', { class: 'section-title' }, 'Sicherung'),
    h('p', { class: 'note' }, 'Deine Noten liegen nur in diesem Browser auf diesem Gerät. Eine Sicherung enthält alle PDFs, Anmerkungen und Setlists und lässt sich auf einem anderen Gerät wieder einlesen.'),
    h('div', { class: 'menu' },
      h('button', { type: 'button', class: 'btn', onclick: () => { $('#dlg').closeWith(null); exportBackup(); } }, icon('download'), 'Sicherung exportieren'),
      pickOption({ iconName: 'upload', title: 'Sicherung einlesen', sub: 'Notenreader-Sicherung (.json)', accept: '.json,application/json', onFiles: (f) => importBackup(f[0]) })),
    h('p', { class: 'note' }, `${scores.length} Stücke, ${setlists.length} Setlists. ${storageInfo}`),
    h('p', { class: 'note' }, `Notenreader ${APP_VERSION} · PDF-Darstellung mit PDF.js (Apache-2.0)`));
  await dialog({ title: 'Einstellungen', body, actions: [{ label: 'Fertig', value: null, primary: true }] });
}


/* ---------- Noten abfotografieren ---------- */
const isImageFile = (f) => /^image\//.test(f.type) || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name);
const scanCapture = (label, sub, onFiles) => pickOption({ iconName: 'camera', title: label, sub, accept: 'image/*', capture: 'environment', onFiles });
const scanLibrary = (label, sub, onFiles) => pickOption({ iconName: 'image', title: label, sub, accept: 'image/*', multiple: true, onFiles });

let scanOpen = false;
async function scanFlow(initialFiles) {
  if (scanOpen) return;
  scanOpen = true;
  const pages = []; // { canvas, url }
  const queue = [...initialFiles];
  let cur = null;   // { src, quad: [[x,y]×4] normiert }
  let useEnhance = settings.scanEnhance !== false;
  const root = h('div', { id: 'scan', role: 'dialog', 'aria-label': 'Noten fotografieren' });
  document.body.append(root);
  document.body.classList.add('scanning');
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  let title = `Foto-Noten ${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}.${pad(now.getMinutes())}`;

  const close = () => {
    for (const p of pages) URL.revokeObjectURL(p.url);
    root.remove();
    document.body.classList.remove('scanning');
    scanOpen = false;
  };
  const busy = (text) => root.replaceChildren(h('div', { class: 'scan-busy' }, h('div', { class: 'spinner' }), h('p', {}, text)));
  const addFiles = (files) => { queue.push(...files.filter(isImageFile)); if (!cur) nextPhoto(); };
  const cancel = async () => {
    if (pages.length && !await confirmDialog('Fotos verwerfen?', `${pages.length} ${pages.length === 1 ? 'Seite wird' : 'Seiten werden'} nicht gespeichert.`, 'Verwerfen')) return;
    close();
  };

  async function nextPhoto() {
    const f = queue.shift();
    if (!f) { cur = null; review(); return; }
    busy('Foto wird geladen …');
    try {
      const src = await loadPhoto(f);
      cur = { src, quad: [[0.05, 0.05], [0.95, 0.05], [0.95, 0.95], [0.05, 0.95]] };
      edit();
    } catch (e) {
      console.error(e);
      toast(`„${f.name}“ konnte nicht gelesen werden`);
      nextPhoto();
    }
  }

  function edit() {
    const { src } = cur;
    const disp = h('canvas', { class: 'scan-img' });
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'scan-svg');
    const poly = document.createElementNS(svgNS, 'polygon');
    poly.setAttribute('class', 'scan-poly');
    svg.append(poly);
    const handles = cur.quad.map((_, i) => {
      const g = document.createElementNS(svgNS, 'g');
      g.setAttribute('class', 'scan-handle');
      g.dataset.i = i;
      const hit = document.createElementNS(svgNS, 'circle'); hit.setAttribute('r', 30); hit.setAttribute('class', 'hit');
      const dot = document.createElementNS(svgNS, 'circle'); dot.setAttribute('r', 13); dot.setAttribute('class', 'dot');
      g.append(hit, dot);
      svg.append(g);
      return g;
    });
    const loupe = h('canvas', { class: 'scan-loupe', width: 240, height: 240, hidden: true });
    const box = h('div', { class: 'scan-box' }, disp, svg, loupe);
    const stage = h('div', { class: 'scan-stage' }, box);
    let W = 0, H = 0;
    const layout = () => {
      const aw = stage.clientWidth - 24, ah = stage.clientHeight - 24;
      if (aw <= 0 || ah <= 0) return;
      const k = Math.min(aw / src.width, ah / src.height);
      W = Math.round(src.width * k); H = Math.round(src.height * k);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      disp.width = Math.round(W * dpr); disp.height = Math.round(H * dpr);
      disp.style.width = svg.style.width = box.style.width = `${W}px`;
      disp.style.height = svg.style.height = box.style.height = `${H}px`;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      disp.getContext('2d').drawImage(src, 0, 0, disp.width, disp.height);
      draw();
    };
    const draw = () => {
      poly.setAttribute('points', cur.quad.map(([x, y]) => `${x * W},${y * H}`).join(' '));
      handles.forEach((g, i) => g.setAttribute('transform', `translate(${cur.quad[i][0] * W},${cur.quad[i][1] * H})`));
    };
    const showLoupe = (i) => {
      const [x, y] = cur.quad[i];
      const ctx = loupe.getContext('2d');
      const r = 60; // Ausschnitt in Quellpixeln (Radius) → 2-fach
      const sx = x * src.width, sy = y * src.height;
      const span = r * Math.max(1, src.width / W) * 0.5;
      ctx.clearRect(0, 0, 240, 240);
      ctx.save();
      ctx.beginPath(); ctx.arc(120, 120, 118, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = '#222'; ctx.fillRect(0, 0, 240, 240);
      ctx.drawImage(src, sx - span, sy - span, span * 2, span * 2, 0, 0, 240, 240);
      ctx.restore();
      ctx.strokeStyle = '#e8a33d'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(120, 96); ctx.lineTo(120, 144); ctx.moveTo(96, 120); ctx.lineTo(144, 120); ctx.stroke();
      loupe.hidden = false;
      // Lupe über dem Finger, auf der anderen Seite wenn zu weit oben
      const lx = Math.min(Math.max(x * W - 60, 0), W - 120);
      const ly = y * H > 150 ? y * H - 150 : y * H + 30;
      loupe.style.left = `${lx}px`; loupe.style.top = `${ly}px`;
    };
    let dragI = -1;
    svg.addEventListener('pointerdown', (e) => {
      const g = e.target.closest('.scan-handle');
      let i = g ? +g.dataset.i : -1;
      if (i < 0) { // nächstgelegene Ecke nehmen, wenn nah genug
        const r = svg.getBoundingClientRect();
        const px = e.clientX - r.left, py = e.clientY - r.top;
        let best = 1e9;
        cur.quad.forEach(([x, y], k) => { const d = Math.hypot(x * W - px, y * H - py); if (d < best) { best = d; i = k; } });
        if (best > 60) return;
      }
      dragI = i;
      svg.setPointerCapture(e.pointerId);
      e.preventDefault();
      showLoupe(i);
    });
    svg.addEventListener('pointermove', (e) => {
      if (dragI < 0) return;
      const r = svg.getBoundingClientRect();
      cur.quad[dragI] = [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
      draw();
      showLoupe(dragI);
    });
    const up = () => { dragI = -1; loupe.hidden = true; };
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);

    const enhanceBox = h('input', { type: 'checkbox', checked: useEnhance, onchange: () => { useEnhance = enhanceBox.checked; settings.scanEnhance = useEnhance; saveSettings(); } });
    root.replaceChildren(
      h('div', { class: 'scan-top' },
        h('button', { class: 'btn small', onclick: cancel }, 'Abbrechen'),
        h('div', { class: 'scan-title' }, h('b', {}, `Seite ${pages.length + 1}`), h('small', {}, 'Die vier Punkte auf die Ecken des Notenblatts ziehen')),
        h('span', { class: 'scan-spacer' })),
      stage,
      h('div', { class: 'scan-bottom' },
        h('button', { class: 'btn', onclick: () => { cur.src = rotateCanvas(cur.src, 1); cur.quad = cur.quad.map(([x, y]) => [1 - y, x]); cur.quad = [cur.quad[3], cur.quad[0], cur.quad[1], cur.quad[2]]; edit(); } }, icon('rotate'), 'Drehen'),
        h('button', { class: 'btn', onclick: () => { cur.quad = [[0, 0], [1, 0], [1, 1], [0, 1]]; draw(); } }, 'Ganzes Foto'),
        h('label', { class: 'btn scan-toggle' }, enhanceBox, 'Scan-Optik'),
        h('button', { class: 'btn primary', onclick: accept }, icon('check'), 'Übernehmen')));
    requestAnimationFrame(layout);
    window.addEventListener('resize', layout);
    root._cleanup = () => window.removeEventListener('resize', layout);
  }

  async function accept() {
    root._cleanup?.();
    busy('Seite wird gerade gezogen …');
    await new Promise((r) => setTimeout(r, 30));
    try {
      const { src, quad } = cur;
      const q = quad.map(([x, y]) => [x * src.width, y * src.height]);
      let out = warpQuad(src, q);
      if (useEnhance) out = enhance(out);
      const blob = await new Promise((r) => out.toBlob(r, 'image/jpeg', 0.6));
      pages.push({ canvas: out, url: URL.createObjectURL(blob) });
      src.width = src.height = 0;
    } catch (e) {
      console.error(e);
      toast('Das Foto konnte nicht bearbeitet werden');
    }
    cur = null;
    nextPhoto();
  }

  function review() {
    if (!pages.length) { close(); return; }
    const titleInput = h('input', { value: title, autocomplete: 'off', oninput: () => { title = titleInput.value; } });
    const move = (i, d) => { const j = i + d; if (j < 0 || j >= pages.length) return; [pages[i], pages[j]] = [pages[j], pages[i]]; review(); };
    root.replaceChildren(
      h('div', { class: 'scan-top' },
        h('button', { class: 'btn small', onclick: cancel }, 'Abbrechen'),
        h('div', { class: 'scan-title' }, h('b', {}, pages.length === 1 ? '1 Seite' : `${pages.length} Seiten`), h('small', {}, 'Weitere Seiten fotografieren oder als Stück sichern')),
        h('span', { class: 'scan-spacer' })),
      h('div', { class: 'scan-pages' }, pages.map((p, i) => h('figure', { class: 'scan-page' },
        h('img', { src: p.url, alt: `Seite ${i + 1}` }),
        h('figcaption', {},
          h('button', { class: 'btn icon small', 'aria-label': 'Nach vorne', disabled: i === 0, onclick: () => move(i, -1) }, icon('back')),
          h('span', {}, `Seite ${i + 1}`),
          h('button', { class: 'btn icon small', 'aria-label': 'Nach hinten', disabled: i === pages.length - 1, onclick: () => move(i, 1) }, icon('chev')),
          h('button', { class: 'btn icon small danger', 'aria-label': 'Seite entfernen', onclick: () => { URL.revokeObjectURL(p.url); pages.splice(i, 1); review(); } }, icon('trash')))))),
      h('div', { class: 'scan-bottom scan-review' },
        h('div', { class: 'scan-more' },
          scanCapture('Weitere Seite fotografieren', '', addFiles),
          scanLibrary('Aus Fotos wählen', '', addFiles)),
        h('div', { class: 'scan-save' },
          h('label', { class: 'field' }, h('span', {}, 'Titel'), titleInput),
          h('button', { class: 'btn primary', onclick: save }, icon('check'), 'Als Stück sichern'))));
  }

  async function save() {
    busy('PDF wird erstellt …');
    try {
      const jpegs = [];
      for (const p of pages) jpegs.push(await canvasToJpeg(p.canvas, 0.82));
      const name = (title.trim() || 'Foto-Noten').replace(/[\\/:*?"<>|]/g, '-');
      const file = new File([makePdf(jpegs, name)], `${name}.pdf`, { type: 'application/pdf' });
      close();
      await importFiles([file]);
    } catch (e) {
      console.error(e);
      toast('PDF konnte nicht erstellt werden');
      review();
    }
  }

  nextPhoto();
}

/* ---------- Eingang: neue Noten verschlagworten ---------- */
// Ein Stück gehört in den Eingang, wenn es frisch importiert und noch nicht bestätigt wurde
// oder wenn es weder Instrument noch Genre noch Tags hat.
function needsTagging(s) {
  if (s.inbox === true) return true;
  if (s.inbox === false) return false;
  return !(s.instruments || []).length && !s.genre && !(s.tags || []).length;
}
const inboxList = () => scores.filter(needsTagging).sort((a, b) => (a.added || 0) - (b.added || 0));

function updateInboxBadge() {
  const n = inboxList().length;
  const b = $('#inbox-count');
  b.textContent = n;
  b.hidden = !n;
}

const previewCache = new Map(); // id -> objectURL der großen Vorschau
async function renderPreview(id) {
  if (previewCache.has(id)) return previewCache.get(id);
  const f = await db.get('files', id);
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(f.data.slice(0)) }).promise;
  try {
    const page = await doc.getPage(1);
    const vp1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: 1100 / vp1.width });
    const c = document.createElement('canvas');
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
    c.width = c.height = 0;
    const url = URL.createObjectURL(blob);
    previewCache.set(id, url);
    if (previewCache.size > 12) { const [k, u] = previewCache.entries().next().value; URL.revokeObjectURL(u); previewCache.delete(k); }
    return url;
  } finally { doc.destroy(); }
}

// Chip-Auswahl: mehrere (Instrument, Tags) oder genau einen Wert (Genre), plus Freitext für Neues
function chipPicker({ values, selected, single = false, placeholder }) {
  let sel = [...selected];
  const all = [...values];
  for (const v of sel) if (!all.some((x) => x.toLowerCase() === v.toLowerCase())) all.push(v);
  const wrap = h('div', { class: 'chip-picker' });
  const chips = h('div', { class: 'chips' });
  const input = h('input', { class: 'chip-input', placeholder, autocomplete: 'off', enterkeyhint: 'done' });
  const has = (v) => sel.some((x) => x.toLowerCase() === v.toLowerCase());
  const draw = () => {
    chips.replaceChildren(...all.map((v) => h('button', {
      type: 'button', class: `chip${has(v) ? ' on' : ''}`,
      onclick: () => {
        if (single) sel = has(v) ? [] : [v];
        else sel = has(v) ? sel.filter((x) => x.toLowerCase() !== v.toLowerCase()) : [...sel, v];
        draw();
      },
    }, v)));
  };
  const addTyped = () => {
    const vals = single ? [input.value.trim()].filter(Boolean) : splitList(input.value);
    if (!vals.length) return false;
    for (const v of vals) {
      if (!all.some((x) => x.toLowerCase() === v.toLowerCase())) all.push(v);
      if (single) sel = [v]; else if (!has(v)) sel.push(v);
    }
    input.value = '';
    draw();
    return true;
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' || (e.key === ',' && !single)) { if (addTyped()) e.preventDefault(); } });
  input.addEventListener('blur', addTyped);
  draw();
  wrap.append(chips, input);
  wrap.value = () => { addTyped(); return sel; };
  return wrap;
}

let inboxIndex = 0;
function renderInbox() {
  const root = $('#view-inbox');
  const list = inboxList();
  updateInboxBadge();
  const dropBox = h('div', { class: 'inbox-drop' },
    h('div', {}, h('b', {}, 'Neue Noten hinzufügen'),
      h('div', { class: 'note' }, 'PDF-Anhänge aus der Mail hierher ziehen, oder auf dem iPad/iPhone zuerst in „Dateien“ sichern und dann importieren.')),
    h('div', { class: 'inbox-picks' },
      scanCapture('Fotografieren', '', (f) => scanFlow(f)),
      pickOption({ iconName: 'plus', title: 'PDFs wählen', sub: '', accept: 'application/pdf,.pdf', multiple: true, onFiles: (f) => importFiles(f) })));
  if (!list.length) {
    root.replaceChildren(dropBox, h('div', { class: 'empty' }, h('div', { class: 'empty-art' }, '✓'), h('h2', {}, 'Alles verschlagwortet'),
      h('p', {}, 'Neue Noten ohne Instrument, Genre oder Tags erscheinen hier automatisch.')));
    return;
  }
  if (inboxIndex >= list.length) inboxIndex = 0;
  const s = list[inboxIndex];

  const title = h('input', { value: s.title, autocomplete: 'off' });
  const ref = h('input', { value: s.ref || '', autocomplete: 'off', placeholder: nextRef() });
  const composer = h('input', { value: s.composer || '', autocomplete: 'off', list: 'dl-inbox-composer' });
  const keywords = h('input', { value: s.keywords || '', autocomplete: 'off', placeholder: 'weitere Begriffe für die Suche' });
  const inst = chipPicker({ values: allValues('instruments'), selected: s.instruments || [], placeholder: 'Neues Instrument eingeben …' });
  const genre = chipPicker({ values: allValues('genre'), selected: s.genre ? [s.genre] : [], single: true, placeholder: 'Neues Genre eingeben …' });
  const tags = chipPicker({ values: allValues('tags'), selected: s.tags || [], placeholder: 'Neuen Tag eingeben …' });
  const composers = [...new Set(scores.map((x) => x.composer).filter(Boolean))].sort(collator.compare);
  const img = h('img', { alt: `Erste Seite von ${s.title}`, src: s.thumb || '' });
  renderPreview(s.id).then((u) => { img.src = u; }).catch(() => {});

  const save = async (advance) => {
    const newRef = ref.value.trim() || nextRef();
    const clash = newRef !== (s.ref || "") && refConflict(newRef, s.id);
    if (clash && !await confirmDialog('ID schon vergeben', `Die ID ${newRef} hat bereits „${clash.title}“. Trotzdem sichern?`, 'Trotzdem sichern')) return;
    s.title = title.value.trim() || s.title;
    s.ref = newRef;
    s.composer = composer.value.trim();
    s.instruments = inst.value();
    s.genre = genre.value()[0] || '';
    s.tags = tags.value();
    s.keywords = keywords.value.trim();
    s.inbox = false;
    await db.put('scores', s);
    toast(`„${s.title}“ gesichert`);
    if (!advance) inboxIndex = Math.max(0, inboxIndex);
    renderInbox(); renderLibrary();
    window.scrollTo(0, 0);
  };

  const thumbs = h('div', { class: 'inbox-strip' }, list.map((x, i) => h('button', {
    class: `inbox-thumb${i === inboxIndex ? ' current' : ''}`, title: x.title,
    onclick: () => { inboxIndex = i; renderInbox(); },
  }, x.thumb ? h('img', { src: x.thumb, alt: '' }) : null, h('span', {}, x.title))));

  root.replaceChildren(
    dropBox,
    h('div', { class: 'inbox-head' },
      h('h2', {}, `Zu verschlagworten: ${list.length}`),
      h('span', { class: 'note' }, `Stück ${inboxIndex + 1} von ${list.length}`)),
    thumbs,
    h('div', { class: 'inbox-main' },
      h('div', { class: 'inbox-preview' },
        h('button', { class: 'preview-btn', title: 'Im Lesemodus öffnen', onclick: () => openReader([s.id], 0) }, img),
        h('div', { class: 'note' }, `${s.pages} ${s.pages === 1 ? 'Seite' : 'Seiten'}${s.file ? ' · ' + s.file : ''}`)),
      h('form', { class: 'inbox-form', onsubmit: (e) => { e.preventDefault(); save(true); } },
        field('Titel', title),
        h('div', { class: 'field-row' }, field('ID', ref), field('Komponist', composer)),
        h('div', { class: 'field' }, h('span', {}, 'Instrument(e)'), inst),
        h('div', { class: 'field' }, h('span', {}, 'Genre'), genre),
        h('div', { class: 'field' }, h('span', {}, 'Tags'), tags),
        field('Suchbegriffe', keywords),
        datalist('dl-inbox-composer', composers),
        h('div', { class: 'inbox-actions' },
          h('button', { type: 'submit', class: 'btn primary' }, icon('check'), 'Sichern & weiter'),
          h('button', { type: 'button', class: 'btn', onclick: () => { inboxIndex = (inboxIndex + 1) % list.length; renderInbox(); } }, 'Überspringen'),
          h('button', { type: 'button', class: 'btn ghost danger', onclick: async () => { await deleteScore(s); renderInbox(); } }, icon('trash'), 'Löschen')))),
  );
}

// Schon verschlagwortete Stücke zum Überarbeiten in den Eingang legen (Werte bleiben vorausgefüllt)
async function sendToInbox(ids) {
  const list = ids.map(scoreById).filter(Boolean);
  if (!list.length) return;
  for (const s of list) { s.inbox = true; await db.put('scores', s); }
  if (state.selecting) setSelecting(false);
  setTab('inbox');
  const idx = inboxList().findIndex((x) => x.id === list[0].id);
  if (idx >= 0) { inboxIndex = idx; renderInbox(); }
  toast(list.length === 1 ? 'Im Eingang zum Neu-Taggen' : `${list.length} Stücke im Eingang zum Neu-Taggen`);
}

/* ---------- Tabs ---------- */
function setTab(tab) {
  state.tab = tab;
  for (const b of $$('.tabs button')) b.classList.toggle('active', b.dataset.tab === tab);
  $('#view-library').hidden = tab !== 'library';
  $('#view-setlists').hidden = tab !== 'setlists';
  $('#view-inbox').hidden = tab !== 'inbox';
  if (tab === 'setlists') renderSetlists();
  if (tab === 'inbox') { inboxIndex = 0; renderInbox(); }
  window.scrollTo(0, 0);
}

/* ---------- Start ---------- */
function bindUI() {
  hydrateIcons();
  $('#app-version').textContent = `Version ${APP_VERSION}`;
  for (const b of $$('.tabs button')) b.addEventListener('click', () => setTab(b.dataset.tab));
  const fileInput = $('#file-input');
  $('#btn-import').addEventListener('click', importMenu);
  $('#btn-import-empty').addEventListener('click', importMenu);
  for (const inp of [fileInput, $('#folder-input'), $('#table-input'), $('#fs-input')]) {
    inp.addEventListener('change', () => { const f = [...(inp.files || [])]; inp.value = ''; if (f.length) importFiles(f); });
  }
  $('#progress-cancel').addEventListener('click', () => { importCancel = true; $('#progress-text').textContent = 'Wird abgebrochen …'; });
  $('#backup-input').addEventListener('change', (e) => { const f = e.target.files?.[0]; if (f) importBackup(f).finally(() => { e.target.value = ''; }); });
  $('#btn-settings').addEventListener('click', openSettings);
  $('#btn-select').addEventListener('click', () => setSelecting(!state.selecting));
  $('#sel-done').addEventListener('click', () => setSelecting(false));
  $('#sel-all').addEventListener('click', () => {
    const list = filteredScores();
    if (list.every((s) => state.selected.has(s.id))) state.selected.clear();
    else list.forEach((s) => state.selected.add(s.id));
    renderLibrary();
  });
  $('#sel-tag').addEventListener('click', () => bulkTagDialog([...state.selected]));
  $('#sel-setlist').addEventListener('click', () => addToSetlistDialog([...state.selected]));
  $('#sel-inbox').addEventListener('click', () => sendToInbox([...state.selected]));
  const search = $('#search');
  let searchTimer = null;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.query = search.value; renderLibrary(); window.scrollTo(0, 0); }, scores.length > 200 ? 150 : 0);
  });
  for (const b of $$('#view-toggle button')) b.addEventListener('click', () => { settings.libView = b.dataset.view; saveSettings(); renderLibrary(); });
  bindAzBar();
  const topbar = $('.topbar');
  const setTopH = () => document.documentElement.style.setProperty('--topbar-h', `${topbar.offsetHeight}px`);
  setTopH();
  if (window.ResizeObserver) new ResizeObserver(setTopH).observe(topbar);
  const sort = $('#sort');
  sort.value = settings.sort;
  sort.addEventListener('change', () => { settings.sort = sort.value; saveSettings(); renderLibrary(); });

  // Ziehen & Ablegen (Mac / PC)
  let dragDepth = 0;
  const dropOverlay = $('#drop-overlay');
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  document.addEventListener('dragenter', (e) => { if (!hasFiles(e) || !$('#reader').hidden) return; dragDepth++; dropOverlay.hidden = false; });
  document.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dropOverlay.hidden = true; });
  document.addEventListener('dragover', (e) => { if ($('#reader').hidden && hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  document.addEventListener('drop', (e) => {
    dragDepth = 0; dropOverlay.hidden = true;
    if (!$('#reader').hidden) return;
    e.preventDefault();
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length) return;
    if ($('#dlg').open) $('#dlg').closeWith(null);
    importFiles(files);
  });

  // Leseansicht
  const stage = $('#stage');
  stage.addEventListener('pointerdown', onStageDown);
  stage.addEventListener('pointermove', onDrawMove);
  stage.addEventListener('pointerup', onStageUp);
  stage.addEventListener('pointercancel', (e) => { if (drawing) onDrawUp(e); gesture = null; });
  stage.addEventListener('touchmove', (e) => { if (R.annotate && drawing) e.preventDefault(); }, { passive: false });
  $('#r-back').addEventListener('click', closeReader);
  $('#r-view').addEventListener('click', chooseView);
  $('#r-annotate').addEventListener('click', () => setAnnotate(!R.annotate));
  $('#a-done').addEventListener('click', () => setAnnotate(false));
  $('#a-undo').addEventListener('click', undoAnno);
  $('#a-clear').addEventListener('click', clearPageAnnos);
  $('#a-delete').addEventListener('click', deleteSelected);
  buildStampBar();
  document.fonts?.load(`40px ${STAMP_FONT}`).then(() => { for (const w of $$('#pages .page')) if (w.view) paintAnnos(w.view); }).catch(() => {});
  for (const b of $$('#anno-bar .tool[data-tool]')) {
    b.addEventListener('click', () => { R.tool = b.dataset.tool; if (b.dataset.color) R.color = b.dataset.color; if (!['select', 'stamp', 'text', 'rect'].includes(R.tool)) selectItem(null); updateToolUI(); });
  }
  for (const b of $$('#anno-bar .tool[data-size]')) {
    b.addEventListener('click', () => { settings.penSize = +b.dataset.size; saveSettings(); updateToolUI(); });
  }
  const slider = $('#r-slider');
  slider.addEventListener('input', () => { $('#r-page').textContent = `${slider.value} / ${slider.max}`; showChrome(true); });
  slider.addEventListener('change', () => {
    let p = +slider.value;
    if (isTwoUp() && p % 2 === 0) p -= 1;
    R.page = Math.max(1, p); renderSpread();
  });
  $('#sl-prev').addEventListener('click', () => gotoScore(-1));
  $('#sl-next').addEventListener('click', () => gotoScore(1));
  for (const bar of ['#reader-top', '#reader-bottom']) {
    $(bar).addEventListener('pointerdown', () => showChrome(true));
  }

  // Installationshinweis für iPhone/iPad in Safari
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS && !standalone && !settings.hintClosed) $('#install-hint').hidden = false;
  $('#install-hint-close').addEventListener('click', () => { settings.hintClosed = true; saveSettings(); $('#install-hint').hidden = true; });
}

async function main() {
  bindUI();
  try {
    await loadData();
  } catch (e) {
    console.error(e);
    toast('Speicher nicht verfügbar. Ist privates Surfen aktiv?', 8000);
  }
  renderLibrary();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service Worker:', e));
    // Neue Version übernommen: einmal neu laden, damit sie sofort aktiv ist
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && $('#reader').hidden && !$('#dlg').open && $('#progress').hidden) location.reload(); });
  }
}
main();

// Für Tests im Browser
window.__notenreader = { importFiles, R, settings };
