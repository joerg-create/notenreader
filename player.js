// Mitspielen: pro Stück ein Link (Apple Music o. ä.) und/oder eine eigene Audiodatei
// mit langsamerem Tempo (ohne Tonhöhenänderung) und Wiederholschleife A–B.

const fmt = (t) => {
  if (!isFinite(t)) return '0:00';
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};
const audioKey = (id) => `audio|${id}`;
import { amAvailable, amAuthorize, amInstance, amAuthorized, amPlaylists, amPlaylistTracks, amSearch, amPlay, amPause, amSeek, amState, amOn, normTitle, amNative, amRate, amSetRate } from './applemusic.js';

export function makePlayer({ h, icon, toast, getScore, getScores, saveScore, db, onChange }) {
  const el = new Audio();
  el.preload = 'auto';
  el.preservesPitch = true; el.webkitPreservesPitch = true; el.mozPreservesPitch = true;
  let url = null, loadedFor = null, rate = 1, loopA = null, loopB = null, raf = 0;
  let ui = null;

  const pill = h('button', { id: 'play-pill', hidden: true });
  document.body.append(pill);

  function audioSession() { try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* egal */ } }

  async function load(s) {
    if (loadedFor === (s?.id || null)) return;
    el.pause();
    if (url) { URL.revokeObjectURL(url); url = null; }
    el.removeAttribute('src'); el.load();
    loopA = loopB = null;
    loadedFor = s?.id || null;
    if (!s?.music?.audio) return;
    const rec = await db.get('files', audioKey(s.id));
    if (!rec || loadedFor !== s.id) return;
    url = URL.createObjectURL(new Blob([rec.data], { type: rec.type || 'audio/mpeg' }));
    el.src = url;
    el.playbackRate = rate;
  }

  function tick() {
    if (loopA != null && loopB != null && loopB > loopA && el.currentTime >= loopB) el.currentTime = loopA;
    update();
    if (!el.paused) raf = requestAnimationFrame(tick);
  }
  el.addEventListener('play', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); update(); });
  el.addEventListener('pause', () => { update(); });
  el.addEventListener('ended', () => { if (loopA != null && loopB == null) { el.currentTime = loopA; el.play(); } update(); });
  el.addEventListener('loadedmetadata', update);

  function play() {
    audioSession();
    if (amPlaying()) amPause();
    el.playbackRate = rate;
    el.play().catch((e) => { console.error(e); toast('Die Audiodatei lässt sich nicht abspielen'); });
  }
  function toggle() { if (el.paused) play(); else el.pause(); }

  function update() {
    const own = !!el.src && !el.paused;
    const playing = own || amPlaying();
    pill.hidden = !(playing && !onChange?.panelOpen?.());
    pill.replaceChildren(h('span', {}, `♪ ${fmt(own ? el.currentTime : amState().time)}`), h('span', { class: 'pill-stop', onclick: (e) => { e.stopPropagation(); el.pause(); amPause(); update(); } }, '■'));
    if (!ui) return;
    ui.time.textContent = `${fmt(el.currentTime)} / ${fmt(el.duration)}`;
    if (!ui.seeking) { ui.seek.max = isFinite(el.duration) ? el.duration : 0; ui.seek.value = el.currentTime; }
    ui.playB.textContent = el.paused ? '▶ Abspielen' : '❚❚ Pause';
    ui.playB.className = `btn ${el.paused ? 'primary' : 'danger'} pr-go`;
    ui.aB.textContent = loopA == null ? 'A setzen' : `A ${fmt(loopA)}`;
    ui.bB.textContent = loopB == null ? 'B setzen' : `B ${fmt(loopB)}`;
    ui.aB.classList.toggle('active', loopA != null);
    ui.bB.classList.toggle('active', loopB != null);
    const len = isFinite(el.duration) && el.duration ? el.duration : 0;
    if (len && loopA != null) {
      ui.band.hidden = false;
      const b = loopB != null ? loopB : len;
      ui.band.style.left = (loopA / len) * 100 + '%';
      ui.band.style.width = Math.max(0.5, ((b - loopA) / len) * 100) + '%';
    } else ui.band.hidden = true;
  }
  pill.addEventListener('click', () => onChange?.openPanel?.());

  async function setAudio(s, file) {
    if (!file) return;
    const buf = await file.arrayBuffer();
    await db.put('files', { id: audioKey(s.id), data: buf, type: file.type || 'audio/mpeg' });
    s.music = { ...(s.music || {}), audio: { name: file.name, size: file.size } };
    await saveScore(s);
    loadedFor = null;
    await load(s);
    toast('Audiodatei gesichert');
    onChange?.rerender?.();
  }
  async function removeAudio(s) {
    el.pause();
    await db.del('files', audioKey(s.id));
    if (s.music) delete s.music.audio;
    await saveScore(s);
    loadedFor = null;
    await load(s);
    onChange?.rerender?.();
  }
  async function setLink(s, v) {
    v = v.trim();
    if (v && !/^https?:\/\//i.test(v)) { toast('Bitte einen Link einfügen, der mit https:// beginnt'); return false; }
    s.music = { ...(s.music || {}) };
    if (v) s.music.url = v; else delete s.music.url;
    await saveScore(s);
    return true;
  }

  /* ----- Apple Music (MusicKit) ----- */
  let amUi = null, amView = 'main', amLoopA = null, amLoopB = null, amBusy = false;
  let amLists = null, amListId = settingsGet('amPlaylist'), amTracks = [], amFilter = '';
  function settingsGet(k) { try { return localStorage.getItem('nr-' + k) || ''; } catch { return ''; } }
  function settingsSet(k, v) { try { localStorage.setItem('nr-' + k, v); } catch { /* egal */ } }
  if (amAvailable()) {
    // Schon angemeldet? Dann still im Hintergrund starten
    amInstance().then(() => onChange?.rerender?.()).catch(() => {});
    const tickAm = () => {
      const st = amState();
      if (amLoopA != null && amLoopB != null && st.time >= amLoopB) amSeek(amLoopA);
      amUpdate();
    };
    amOn('playbackTimeDidChange', tickAm);
    amOn('playbackStateDidChange', () => { amUpdate(); update(); });
  }
  const amPlaying = () => amAvailable() && amState().playing;
  function amUpdate() {
    if (!amUi) return;
    const st = amState();
    const mine = amUi.track && (st.id === amUi.track.id || st.id === amUi.track.lib);
    const t = mine ? st.time : 0, d = mine ? st.dur : amUi.track?.dur || 0;
    amUi.time.textContent = `${fmt(t)} / ${fmt(d)}`;
    if (!amUi.seeking) { amUi.seek.max = d || 0; amUi.seek.value = t; }
    const playing = mine && st.playing;
    amUi.playB.textContent = playing ? '❚❚ Pause' : '▶ Abspielen';
    amUi.playB.className = `btn ${playing ? 'danger' : 'primary'} pr-go`;
    amUi.aB.textContent = amLoopA == null ? 'A setzen' : `A ${fmt(amLoopA)}`;
    amUi.bB.textContent = amLoopB == null ? 'B setzen' : `B ${fmt(amLoopB)}`;
    amUi.aB.classList.toggle('active', amLoopA != null);
    amUi.bB.classList.toggle('active', amLoopB != null);
  }
  async function amAssign(s, track) {
    s.music = { ...(s.music || {}), am: { id: track.id, lib: track.lib, name: track.name, artist: track.artist, dur: track.dur } };
    await saveScore(s);
    amLoopA = amLoopB = null;
    amView = 'main';
    onChange?.rerender?.();
  }
  async function amAutoAssign(tracks) {
    const list = getScores?.() || [];
    const idx = tracks.map((t) => ({ t, n: normTitle(t.name) })).filter((x) => x.n.length >= 3);
    let n = 0;
    for (const sc of list) {
      if (sc.music?.am) continue;
      const st = normTitle(sc.title);
      if (st.length < 3) continue;
      const hit = idx.find((x) => x.n === st) || idx.find((x) => st.length >= 6 && x.n.length >= 6 && (x.n.startsWith(st) || st.startsWith(x.n)));
      if (!hit) continue;
      sc.music = { ...(sc.music || {}), am: { id: hit.t.id, lib: hit.t.lib, name: hit.t.name, artist: hit.t.artist, dur: hit.t.dur } };
      await saveScore(sc);
      n++;
    }
    return n;
  }
  function amSection(s) {
    const m = s.music || {};
    amUi = null;
    if (!amAvailable()) return [];
    if (!amAuthorized()) {
      return [h('button', { class: 'btn primary pr-go', onclick: async () => {
        try { if (await amAuthorize()) toast('Mit Apple Music verbunden'); } catch (e) { console.error(e); toast('Anmeldung bei Apple Music hat nicht geklappt'); }
        onChange?.rerender?.();
      } }, '♫ Mit Apple Music anmelden'),
      h('p', { class: 'pr-note' }, 'Einmal pro Gerät mit der Apple-ID anmelden. Danach spielen die Lieder aus deiner Mediathek direkt hier (Apple-Music-Abo nötig).')];
    }
    if (amView === 'pick') return amPicker(s);
    if (!m.am) {
      return [h('div', { class: 'pr-row' },
        h('button', { class: 'btn primary', onclick: () => { amView = 'pick'; onChange?.rerender?.(); } }, '♫ Lied zuordnen'))];
    }
    const seek = h('input', { type: 'range', min: 0, max: 0, step: 0.5, value: 0, 'aria-label': 'Position',
      oninput: () => { amUi.seeking = true; },
      onchange: () => { amSeek(+seek.value); amUi.seeking = false; } });
    amUi = {
      track: m.am, seek, seeking: false,
      time: h('span', { class: 'pr-sub' }),
      playB: h('button', { class: 'btn primary pr-go', onclick: async () => {
        const st = amState();
        const mine = st.id === m.am.id || st.id === m.am.lib;
        try { if (mine && st.playing) amPause(); else { el.pause(); await amPlay(m.am); } } catch (e) { console.error(e); toast('Abspielen nicht möglich (Apple-Music-Abo aktiv?)'); }
        amUpdate(); update();
      } }),
      aB: h('button', { class: 'btn', onclick: () => { amLoopA = amState().time; if (amLoopB != null && amLoopB <= amLoopA) amLoopB = null; amUpdate(); } }),
      bB: h('button', { class: 'btn', onclick: () => { if (amLoopA == null) amLoopA = 0; const t = amState().time; if (t > amLoopA) { amLoopB = t; amSeek(amLoopA); } amUpdate(); } }),
    };
    queueMicrotask(amUpdate);
    return [
      h('div', { class: 'pl-file' }, h('span', { class: 'pl-name' }, `${m.am.name}${m.am.artist ? ' · ' + m.am.artist : ''}`), amUi.time),
      h('div', { class: 'pl-seek' }, seek),
      h('div', { class: 'pr-row' },
        h('button', { class: 'btn round small', 'aria-label': '5 Sekunden zurück', onclick: () => amSeek(amState().time - 5) }, '↺'),
        amUi.playB,
        h('button', { class: 'btn round small', 'aria-label': '5 Sekunden vor', onclick: () => amSeek(amState().time + 5) }, '↻')),
      ...(amNative ? [amRateRow()] : []),
      h('div', { class: 'pr-row' }, amUi.aB, amUi.bB, h('button', { class: 'btn', onclick: () => { amLoopA = amLoopB = null; amUpdate(); } }, 'Schleife aus')),
      h('div', { class: 'pr-row' },
        h('button', { class: 'btn', onclick: () => { amView = 'pick'; onChange?.rerender?.(); } }, 'Anderes Lied'),
        h('button', { class: 'btn', onclick: async () => { delete s.music.am; await saveScore(s); onChange?.rerender?.(); } }, 'Entfernen')),
    ];
  }
  // Tempo für Apple Music (nur in der iPad/iPhone-App über die native Brücke)
  function amRateRow() {
    const r0 = amRate();
    const lbl = h('span', { class: 'pr-a4' }, `${Math.round(r0 * 100)} %`);
    const inp = h('input', { type: 'range', min: 0.5, max: 1.25, step: 0.05, value: r0, 'aria-label': 'Tempo',
      oninput: () => { lbl.textContent = `${Math.round(+inp.value * 100)} %`; amSetRate(+inp.value); } });
    return h('div', { class: 'pr-row' }, h('span', { class: 'pr-label' }, 'Tempo'), inp, lbl);
  }
  function amPicker(s) {
    const listBox = h('div', { class: 'am-list' }, h('p', { class: 'pr-note' }, 'Lade …'));
    const showTracks = (tracks) => {
      const f = normTitle(amFilter);
      const st = normTitle(s.title);
      const shown = tracks.filter((t) => !f || normTitle(`${t.name} ${t.artist}`).includes(f))
        .sort((a, b) => (normTitle(b.name).includes(st) ? 1 : 0) - (normTitle(a.name).includes(st) ? 1 : 0));
      listBox.replaceChildren(...(shown.length ? shown.slice(0, 200).map((t) => h('button', { class: 'am-item', onclick: () => amAssign(s, t) },
        t.art ? h('img', { src: t.art, alt: '' }) : h('span', { class: 'am-noart' }, '♫'),
        h('span', { class: 'am-t' }, h('b', {}, t.name), h('small', {}, `${t.artist} · ${fmt(t.dur)}`)))) : [h('p', { class: 'pr-note' }, 'Keine Treffer')]));
    };
    const search = h('input', { type: 'search', class: 'pl-input', placeholder: 'Filtern oder im Katalog suchen', value: amFilter,
      oninput: () => { amFilter = search.value; if (amListId) showTracks(amTracks); } });
    const sel = h('select', { 'aria-label': 'Playlist', onchange: async () => { amListId = sel.value; settingsSet('amPlaylist', amListId); await loadTracks(); } },
      h('option', { value: '' }, 'Playlist wählen …'));
    async function loadTracks() {
      if (!amListId) { listBox.replaceChildren(); return; }
      listBox.replaceChildren(h('p', { class: 'pr-note' }, 'Lade Playlist …'));
      try { amTracks = await amPlaylistTracks(amListId); showTracks(amTracks); }
      catch (e) { console.error(e); listBox.replaceChildren(h('p', { class: 'pr-note' }, 'Playlist konnte nicht geladen werden')); }
    }
    (async () => {
      try {
        amLists = amLists || await amPlaylists();
        sel.replaceChildren(h('option', { value: '' }, 'Playlist wählen …'), ...amLists.map((p) => h('option', { value: p.id }, p.name)));
        if (amListId && amLists.some((p) => p.id === amListId)) { sel.value = amListId; await loadTracks(); }
        else listBox.replaceChildren(h('p', { class: 'pr-note' }, 'Wähle oben deine Playlist.'));
      } catch (e) { console.error(e); listBox.replaceChildren(h('p', { class: 'pr-note' }, 'Mediathek konnte nicht geladen werden')); }
    })();
    return [
      h('div', { class: 'pr-row' }, sel),
      h('div', { class: 'pr-row' }, search,
        h('button', { class: 'btn', onclick: async () => {
          const term = search.value.trim() || s.title;
          listBox.replaceChildren(h('p', { class: 'pr-note' }, 'Suche im Katalog …'));
          try { showTracks(await amSearch(term)); } catch (e) { console.error(e); listBox.replaceChildren(h('p', { class: 'pr-note' }, 'Suche fehlgeschlagen')); }
        } }, 'Katalog')),
      listBox,
      h('div', { class: 'pr-row' },
        h('button', { class: 'btn', onclick: async () => {
          if (amBusy) return;
          if (!amTracks.length) { toast('Zuerst eine Playlist wählen'); return; }
          amBusy = true;
          try { const n = await amAutoAssign(amTracks); toast(n ? `${n} ${n === 1 ? 'Stück' : 'Stücke'} über den Titel zugeordnet` : 'Keine weiteren Titel passend gefunden'); }
          finally { amBusy = false; }
          amView = 'main'; onChange?.rerender?.();
        } }, 'Alle Stücke automatisch zuordnen'),
        h('button', { class: 'btn', onclick: () => { amView = 'main'; onChange?.rerender?.(); } }, 'Zurück')),
    ];
  }

  function render() {
    const s = getScore();
    if (!s) {
      ui = null;
      return h('div', { class: 'pr-body' }, h('p', { class: 'pr-note' }, 'Öffne zuerst ein Stück. Dann kannst du einen Apple-Music-Link oder eine Aufnahme dazu speichern.'));
    }
    load(s);
    const m = s.music || {};
    const link = h('input', { type: 'url', value: m.url || '', placeholder: 'Link aus Apple Music (Teilen → Link kopieren)', class: 'pl-input', autocomplete: 'off' });
    const linkRow = h('div', { class: 'pr-row' },
      link,
      h('button', { class: 'btn', onclick: async () => { if (await setLink(s, link.value)) { toast(link.value.trim() ? 'Link gesichert' : 'Link entfernt'); onChange?.rerender?.(); } } }, 'Sichern'));
    const openB = m.url
      ? h('button', { class: 'btn primary pr-go', onclick: () => window.open(m.url, '_blank') }, '♫ In Apple Music öffnen')
      : h('button', { class: 'btn pr-go', onclick: () => window.open(`https://music.apple.com/de/search?term=${encodeURIComponent([s.title, s.composer].filter(Boolean).join(' '))}`, '_blank') }, '♫ In Apple Music suchen');

    const fileIn = h('input', { type: 'file', accept: 'audio/*,.mp3,.m4a,.aac,.wav', hidden: true, onchange: () => { const f = fileIn.files[0]; fileIn.value = ''; setAudio(s, f); } });
    const pick = h('label', { class: 'btn' }, fileIn, m.audio ? 'Andere Datei' : 'Audiodatei wählen');

    let audioPart;
    if (m.audio) {
      const seek = h('input', { type: 'range', min: 0, max: 0, step: 0.1, value: 0, 'aria-label': 'Position',
        oninput: () => { ui.seeking = true; ui.time.textContent = `${fmt(+seek.value)} / ${fmt(el.duration)}`; },
        onchange: () => { el.currentTime = +seek.value; ui.seeking = false; } });
      const band = h('div', { class: 'pl-band', hidden: true });
      const rateLbl = h('span', { class: 'pr-a4' }, `${Math.round(rate * 100)} %`);
      const rateIn = h('input', { type: 'range', min: 0.5, max: 1.25, step: 0.05, value: rate, 'aria-label': 'Tempo',
        oninput: () => { rate = +rateIn.value; el.playbackRate = rate; rateLbl.textContent = `${Math.round(rate * 100)} %`; } });
      ui = {
        seek, band, seeking: false,
        time: h('span', { class: 'pr-sub' }),
        playB: h('button', { class: 'btn primary pr-go', onclick: toggle }),
        aB: h('button', { class: 'btn', onclick: () => { loopA = el.currentTime; if (loopB != null && loopB <= loopA) loopB = null; update(); } }),
        bB: h('button', { class: 'btn', onclick: () => { if (loopA == null) loopA = 0; if (el.currentTime > loopA) { loopB = el.currentTime; el.currentTime = loopA; } update(); } }),
      };
      audioPart = [
        h('div', { class: 'pl-file' }, h('span', { class: 'pl-name' }, m.audio.name), ui.time),
        h('div', { class: 'pl-seek' }, band, seek),
        h('div', { class: 'pr-row' },
          h('button', { class: 'btn round small', 'aria-label': '5 Sekunden zurück', onclick: () => { el.currentTime = Math.max(0, el.currentTime - 5); } }, '↺'),
          ui.playB,
          h('button', { class: 'btn round small', 'aria-label': '5 Sekunden vor', onclick: () => { el.currentTime = Math.min(el.duration || 0, el.currentTime + 5); } }, '↻')),
        h('div', { class: 'pr-row' }, h('span', { class: 'pr-label' }, 'Tempo'), rateIn, rateLbl),
        h('div', { class: 'pr-row' }, ui.aB, ui.bB,
          h('button', { class: 'btn', onclick: () => { loopA = loopB = null; update(); } }, 'Schleife aus')),
        h('div', { class: 'pr-row' }, pick,
          h('button', { class: 'btn', onclick: () => removeAudio(s) }, 'Entfernen')),
      ];
    } else {
      ui = null;
      audioPart = [
        h('p', { class: 'pr-note' }, 'Eigene Aufnahme oder MP3 hinterlegen: Die spielt der Notenreader selbst ab, auch langsamer (ohne Tonhöhenänderung) und mit Wiederholschleife.'),
        h('div', { class: 'pr-row' }, pick),
      ];
    }
    const amPart = amSection(s);
    const linkPart = amPart.length
      ? [h('details', { class: 'pl-more' }, h('summary', {}, 'Stattdessen Link zur Musik-App'), linkRow, openB)]
      : [linkRow, openB];
    const body = h('div', { class: 'pr-body' },
      h('div', { class: 'pr-sect' }, 'Apple Music'),
      ...amPart, ...linkPart,
      h('div', { class: 'pr-sect' }, 'Eigene Aufnahme'),
      ...audioPart);
    queueMicrotask(update);
    setTimeout(update, 50);
    return body;
  }

  function scoreChanged() {
    const s = getScore();
    if (s && loadedFor !== s.id) { amLoopA = amLoopB = null; amView = 'main'; load(s).then(update); }
  }

  return { render, scoreChanged, update, isPlaying: () => !!el.src && !el.paused, stop: () => el.pause() };
}
