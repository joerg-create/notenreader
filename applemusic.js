// Apple Music im Notenreader (MusicKit JS). Braucht einen Entwickler-Zugangscode (musickit-token.js),
// eine Anmeldung mit der Apple-ID auf jedem Gerät und ein Apple-Music-Abo.
// In der iPad/iPhone-App übernimmt eine native Brücke (MusicKit für iOS) dieselben Aufgaben.
import { DEV_TOKEN } from './musickit-token.js';

/* ----- Native Brücke (App „Notenreader“ für iOS) ----- */
const bridge = window.webkit?.messageHandlers?.notenreader || null;
export const amNative = !!bridge;
let nState = { playing: false, time: 0, dur: 0, id: null, rate: 1 };
let nAuth = false, nInit = null, nSeq = 0;
const nPending = new Map();
const nListeners = {};
const nEmit = (ev) => (nListeners[ev] || []).forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
if (bridge) {
  window.__nativeMusic = {
    resolve(id, res) {
      const p = nPending.get(id);
      if (!p) return;
      nPending.delete(id);
      if (res && res.ok) p.resolve(res.value); else p.reject(new Error(res?.error || 'Apple Music: Fehler'));
    },
    push(st) {
      const was = nState.playing;
      nState = { ...nState, ...st };
      nEmit('playbackTimeDidChange');
      if (was !== nState.playing) nEmit('playbackStateDidChange');
    },
  };
}
function nCall(cmd, args = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nSeq;
    nPending.set(id, { resolve, reject });
    try { bridge.postMessage({ id, cmd, args }); } catch (e) { nPending.delete(id); reject(e); }
  });
}
function nStart() {
  if (!nInit) nInit = nCall('status').then((r) => { nAuth = !!r?.authorized; if (r?.state) nState = { ...nState, ...r.state }; return { native: true }; })
    .catch((e) => { nInit = null; throw e; });
  return nInit;
}

const SCRIPT = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';
let loading = null;
let mk = null;

export const amAvailable = () => amNative || !!DEV_TOKEN;

function loadScript() {
  if (window.MusicKit?.configure) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    document.addEventListener('musickitloaded', () => resolve(), { once: true });
    const sc = document.createElement('script');
    sc.src = SCRIPT; sc.async = true;
    sc.setAttribute('data-web-components', '');
    sc.onerror = () => { loading = null; reject(new Error('MusicKit konnte nicht geladen werden')); };
    document.head.append(sc);
    setTimeout(() => { if (window.MusicKit?.configure) resolve(); }, 4000);
  });
  return loading;
}

export async function amInstance() {
  if (amNative) return nStart();
  if (mk) return mk;
  await loadScript();
  await window.MusicKit.configure({ developerToken: DEV_TOKEN, app: { name: 'Notenreader', build: '1' } });
  mk = window.MusicKit.getInstance();
  return mk;
}
export const amAuthorized = () => (amNative ? nAuth : !!mk?.isAuthorized);
export async function amAuthorize() {
  if (amNative) { await nStart(); const r = await nCall('authorize'); nAuth = !!r?.authorized; return nAuth; }
  const m = await amInstance(); if (!m.isAuthorized) await m.authorize(); return m.isAuthorized;
}
export async function amSignOut() {
  if (amNative) return; // Zugriff lässt sich in der App nur in den iOS-Einstellungen widerrufen
  const m = await amInstance(); await m.unauthorize();
}

async function api(path) {
  const m = await amInstance();
  const r = await m.api.music(path);
  return r.data;
}
// Alle Seiten einer Bibliotheks-Abfrage holen
async function all(path) {
  const out = [];
  let next = path.includes('?') ? `${path}&limit=100` : `${path}?limit=100`;
  for (let i = 0; next && i < 40; i++) {
    const d = await api(next);
    out.push(...(d.data || []));
    next = d.next || null;
  }
  return out;
}
export async function amPlaylists() {
  if (amNative) { await nStart(); return nCall('playlists'); }
  const list = await all('/v1/me/library/playlists');
  return list.map((p) => ({ id: p.id, name: p.attributes?.name || 'Playlist' }));
}
export async function amPlaylistTracks(id) {
  if (amNative) { await nStart(); return nCall('tracks', { id }); }
  const list = await all(`/v1/me/library/playlists/${id}/tracks`);
  return list.map(trackOf);
}
function trackOf(t) {
  const a = t.attributes || {};
  return {
    id: a.playParams?.catalogId || t.id,
    lib: t.id,
    name: a.name || '',
    artist: a.artistName || '',
    dur: (a.durationInMillis || 0) / 1000,
    art: a.artwork?.url ? a.artwork.url.replace('{w}', '120').replace('{h}', '120') : '',
  };
}
export async function amSearch(term) {
  if (amNative) { await nStart(); return nCall('search', { term }); }
  const m = await amInstance();
  const sf = m.storefrontId || 'de';
  const d = await api(`/v1/catalog/${sf}/search?types=songs&limit=25&term=${encodeURIComponent(term)}`);
  return (d.results?.songs?.data || []).map(trackOf);
}

// Wiedergabe
export async function amPlay(track) {
  if (amNative) { await nStart(); nState = { ...nState, ...(await nCall('play', { id: track.id || '', lib: track.lib || '', dur: track.dur || 0 })) }; return; }
  const m = await amInstance();
  if (m.nowPlayingItem?.id !== track.id && m.nowPlayingItem?.id !== track.lib) {
    try { await m.setQueue({ song: track.id, startPlaying: false }); }
    catch { await m.setQueue({ song: track.lib, startPlaying: false }); }
  }
  await m.play();
}
export const amPause = () => (amNative ? nCall('pause').catch(() => {}) : mk?.pause());
export function amSeek(t) {
  t = Math.max(0, t);
  if (amNative) { nState = { ...nState, time: t }; return nCall('seek', { time: t }).catch(() => {}); }
  return mk?.seekToTime(t);
}
// Tempo (nur in der App): 0,5–1,25
export const amRate = () => nState.rate || 1;
export function amSetRate(r) {
  if (!amNative) return Promise.resolve();
  nState = { ...nState, rate: r };
  return nCall('rate', { rate: r }).catch(() => {});
}
export const amState = () => (amNative ? {
  playing: !!nState.playing, time: nState.time || 0, dur: nState.dur || 0, id: nState.id || null,
} : {
  playing: !!mk && mk.playbackState === window.MusicKit?.PlaybackStates?.playing,
  time: mk?.currentPlaybackTime || 0,
  dur: mk?.currentPlaybackDuration || 0,
  id: mk?.nowPlayingItem?.id || null,
});
export function amOn(ev, fn) {
  if (amNative) { (nListeners[ev] ||= []).push(fn); return; }
  amInstance().then((m) => m.addEventListener(ev, fn)).catch(() => {}); }

// Titel vergleichbar machen: Kleinbuchstaben, Umlaute, ohne Zusätze wie „(Remastered)“ oder „- Marsch“
export function normTitle(t) {
  return String(t || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss').replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}
