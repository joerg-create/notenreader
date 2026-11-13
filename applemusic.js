// Apple Music im Notenreader (MusicKit JS). Braucht einen Entwickler-Zugangscode (musickit-token.js),
// eine Anmeldung mit der Apple-ID auf jedem Gerät und ein Apple-Music-Abo.
import { DEV_TOKEN } from './musickit-token.js';

const SCRIPT = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';
let loading = null;
let mk = null;

export const amAvailable = () => !!DEV_TOKEN;

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
  if (mk) return mk;
  await loadScript();
  await window.MusicKit.configure({ developerToken: DEV_TOKEN, app: { name: 'Notenreader', build: '1' } });
  mk = window.MusicKit.getInstance();
  return mk;
}
export const amAuthorized = () => !!mk?.isAuthorized;
export async function amAuthorize() { const m = await amInstance(); if (!m.isAuthorized) await m.authorize(); return m.isAuthorized; }
export async function amSignOut() { const m = await amInstance(); await m.unauthorize(); }

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
  const list = await all('/v1/me/library/playlists');
  return list.map((p) => ({ id: p.id, name: p.attributes?.name || 'Playlist' }));
}
export async function amPlaylistTracks(id) {
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
  const m = await amInstance();
  const sf = m.storefrontId || 'de';
  const d = await api(`/v1/catalog/${sf}/search?types=songs&limit=25&term=${encodeURIComponent(term)}`);
  return (d.results?.songs?.data || []).map(trackOf);
}

// Wiedergabe
export async function amPlay(track) {
  const m = await amInstance();
  if (m.nowPlayingItem?.id !== track.id && m.nowPlayingItem?.id !== track.lib) {
    try { await m.setQueue({ song: track.id, startPlaying: false }); }
    catch { await m.setQueue({ song: track.lib, startPlaying: false }); }
  }
  await m.play();
}
export const amPause = () => mk?.pause();
export const amSeek = (t) => mk?.seekToTime(Math.max(0, t));
export const amState = () => ({
  playing: !!mk && mk.playbackState === window.MusicKit?.PlaybackStates?.playing,
  time: mk?.currentPlaybackTime || 0,
  dur: mk?.currentPlaybackDuration || 0,
  id: mk?.nowPlayingItem?.id || null,
});
export function amOn(ev, fn) { amInstance().then((m) => m.addEventListener(ev, fn)).catch(() => {}); }

// Titel vergleichbar machen: Kleinbuchstaben, Umlaute, ohne Zusätze wie „(Remastered)“ oder „- Marsch“
export function normTitle(t) {
  return String(t || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss').replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}
