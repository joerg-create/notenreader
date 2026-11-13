// Mitspielen: pro Stück ein Link (Apple Music o. ä.) und/oder eine eigene Audiodatei
// mit langsamerem Tempo (ohne Tonhöhenänderung) und Wiederholschleife A–B.

const fmt = (t) => {
  if (!isFinite(t)) return '0:00';
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};
const audioKey = (id) => `audio|${id}`;

export function makePlayer({ h, icon, toast, getScore, saveScore, db, onChange }) {
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
    el.playbackRate = rate;
    el.play().catch((e) => { console.error(e); toast('Die Audiodatei lässt sich nicht abspielen'); });
  }
  function toggle() { if (el.paused) play(); else el.pause(); }

  function update() {
    const playing = !!el.src && !el.paused;
    pill.hidden = !(playing && !onChange?.panelOpen?.());
    pill.replaceChildren(h('span', {}, `♪ ${fmt(el.currentTime)}`), h('span', { class: 'pill-stop', onclick: (e) => { e.stopPropagation(); el.pause(); } }, '■'));
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
        h('p', { class: 'pr-note' }, 'Eigene Aufnahme oder MP3 hinterlegen: Dann spielt der Notenreader sie selbst ab, auch langsamer und mit Wiederholschleife. Lieder aus Apple Music selbst sind kopiergeschützt und gehen nur über den Link.'),
        h('div', { class: 'pr-row' }, pick),
      ];
    }
    const body = h('div', { class: 'pr-body' },
      h('div', { class: 'pr-sect' }, 'Apple Music'),
      linkRow, openB,
      h('div', { class: 'pr-sect' }, 'Eigene Aufnahme'),
      ...audioPart);
    queueMicrotask(update);
    setTimeout(update, 50);
    return body;
  }

  function scoreChanged() {
    const s = getScore();
    if (s && loadedFor !== s.id) load(s).then(update);
  }

  return { render, scoreChanged, update, isPlaying: () => !!el.src && !el.paused, stop: () => el.pause() };
}
