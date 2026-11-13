// Üben: eigene Aufnahmen pro Stück und ein Übe-Tagebuch (Übezeit pro Tag und Stück, Tempo, Notiz).
// Übezeit zählt, solange ein Stück offen ist und der Bildschirm an ist (nicht im Auftrittsmodus).
// score.log = { 'JJJJ-MM-TT': { s: Sekunden, bpm: schnellstes Metronom-Tempo, note: 'Notiz' } }
// score.recs = [{ id, at, dur, size, type }], Audiodaten in files unter 'rec|<stück>|<zeit>'.

const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtClock = (t) => `${Math.floor(t / 60)}:${pad(Math.floor(t % 60))}`;
export function fmtMin(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} Min`;
  return `${Math.floor(m / 60)} Std ${m % 60 ? `${m % 60} Min` : ''}`.trim();
}
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const dateLabel = (k) => {
  const [y, m, d] = k.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const today = dayKey(), yest = dayKey(new Date(Date.now() - 864e5));
  if (k === today) return 'Heute';
  if (k === yest) return 'Gestern';
  return `${WD[dt.getDay()]}, ${d}.${m}.`;
};

export function makeUeben({ h, icon, toast, settings, getScore, getScores, saveScore, db, share, rerender }) {
  /* ----- Übezeit mitschreiben ----- */
  const TICK = 15;
  let dirty = null, ticks = 0;
  function entry(s, k = dayKey()) {
    s.log ||= {};
    return (s.log[k] ||= { s: 0 });
  }
  setInterval(() => {
    const s = getScore();
    if (!s || document.visibilityState !== 'visible' || settings.locked) return;
    entry(s).s += TICK;
    dirty = s;
    if (++ticks % 4 === 0) flush();
    if (ui?.today && document.activeElement?.tagName !== 'TEXTAREA') rerender();
  }, TICK * 1000);
  function flush() { if (dirty) { saveScore(dirty); dirty = null; } }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  function logBpm(bpm) {
    const s = getScore();
    if (!s) return;
    const e = entry(s);
    if (!e.bpm || bpm > e.bpm) { e.bpm = bpm; saveScore(s); }
  }

  /* ----- Aufnahme ----- */
  let rec = null; // { mr, stream, chunks, start, timer }
  const player = new Audio();
  let playing = null, playUrl = null;
  function pickType() {
    if (!window.MediaRecorder) return null;
    for (const t of ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg']) if (MediaRecorder.isTypeSupported?.(t)) return t;
    return '';
  }
  async function startRec() {
    const s = getScore();
    if (!s) return;
    const type = pickType();
    if (type === null) { toast('Aufnehmen geht in diesem Browser nicht'); return; }
    try {
      try { if (navigator.audioSession) navigator.audioSession.type = 'play-and-record'; } catch { /* egal */ }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
      const mr = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream);
      const chunks = [];
      mr.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
      mr.onstop = () => saveRec(s, chunks, mr.mimeType || type || 'audio/mp4');
      rec = { mr, stream, chunks, start: Date.now(), timer: setInterval(() => { if (ui?.recTime) ui.recTime.textContent = fmtClock((Date.now() - rec.start) / 1000); }, 500) };
      mr.start(1000);
      stopPlay();
      rerender();
    } catch (e) {
      console.error(e);
      toast('Kein Zugriff aufs Mikrofon. Bitte in den Einstellungen erlauben.', 5000);
    }
  }
  function stopRec() {
    if (!rec) return;
    clearInterval(rec.timer);
    rec.dur = (Date.now() - rec.start) / 1000;
    try { rec.mr.stop(); } catch { /* egal */ }
    rec.stream.getTracks().forEach((t) => t.stop());
    try { if (navigator.audioSession) navigator.audioSession.type = 'auto'; } catch { /* egal */ }
  }
  async function saveRec(s, chunks, type) {
    const dur = rec?.dur || 0;
    rec = null;
    if (!chunks.length || dur < 1) { rerender(); return; }
    const blob = new Blob(chunks, { type });
    const at = Date.now();
    const id = `rec|${s.id}|${at}`;
    await db.put('files', { id, data: await blob.arrayBuffer(), type });
    s.recs = [{ id, at, dur, size: blob.size, type }, ...(s.recs || [])];
    await saveScore(s);
    toast(`Aufnahme gesichert (${fmtClock(dur)})`);
    rerender();
  }
  async function play(r) {
    if (playing === r.id && !player.paused) { player.pause(); rerender(); return; }
    stopPlay();
    const f = await db.get('files', r.id);
    if (!f) { toast('Aufnahme nicht gefunden'); return; }
    playUrl = URL.createObjectURL(new Blob([f.data], { type: f.type || r.type }));
    player.src = playUrl; playing = r.id;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* egal */ }
    player.play().catch(() => toast('Lässt sich nicht abspielen'));
    rerender();
  }
  function stopPlay() {
    player.pause();
    if (playUrl) { URL.revokeObjectURL(playUrl); playUrl = null; }
    playing = null;
  }
  player.addEventListener('ended', () => { playing = null; rerender(); });
  player.addEventListener('timeupdate', () => { if (ui?.pos && player.duration) ui.pos.value = player.currentTime / player.duration; });
  async function remove(s, r) {
    if (playing === r.id) stopPlay();
    await db.del('files', r.id);
    s.recs = (s.recs || []).filter((x) => x.id !== r.id);
    await saveScore(s);
    rerender();
  }
  async function shareRec(s, r) {
    const f = await db.get('files', r.id);
    if (!f) return;
    const d = new Date(r.at);
    const ext = (f.type || r.type || '').includes('webm') ? 'webm' : (f.type || '').includes('ogg') ? 'ogg' : 'm4a';
    const name = `${s.title.replace(/[\\/:*?"<>|]/g, '-')} ${dayKey(d)} ${pad(d.getHours())}-${pad(d.getMinutes())}.${ext}`;
    share([new File([f.data], name, { type: f.type || r.type })]);
  }

  /* ----- Oberfläche ----- */
  let ui = null;
  function render() {
    const s = getScore();
    const scores = getScores();
    ui = {};
    const parts = [];
    // Aufnahme
    if (s) {
      const recs = s.recs || [];
      ui.recTime = h('span', { class: 'ub-rectime' }, rec ? fmtClock((Date.now() - rec.start) / 1000) : '');
      parts.push(h('div', { class: 'ub-sec' },
        h('div', { class: 'ub-h' }, 'Aufnehmen'),
        h('div', { class: 'pr-row' },
          h('button', { class: `btn ${rec ? 'danger' : 'primary'} pr-go ub-rec`, onclick: () => (rec ? stopRec() : startRec()) },
            h('span', { class: `ub-dot${rec ? ' on' : ''}` }), rec ? 'Stopp' : 'Aufnahme starten'),
          ui.recTime),
        recs.length ? h('div', { class: 'ub-list' }, recs.slice(0, 12).map((r) => {
          const d = new Date(r.at);
          const on = playing === r.id && !player.paused;
          return h('div', { class: 'ub-item' },
            h('button', { class: 'btn icon small', 'aria-label': on ? 'Pause' : 'Abspielen', onclick: () => play(r) }, on ? '❚❚' : icon('play')),
            h('div', { class: 'ub-meta' }, h('b', {}, `${dateLabel(dayKey(d))}, ${pad(d.getHours())}:${pad(d.getMinutes())}`), h('small', {}, fmtClock(r.dur))),
            h('button', { class: 'btn icon small', 'aria-label': 'Teilen', title: 'Teilen oder sichern', onclick: () => shareRec(s, r) }, icon('upload')),
            h('button', { class: 'btn icon small', 'aria-label': 'Löschen', title: 'Löschen', onclick: () => remove(s, r) }, icon('trash')));
        })) : h('p', { class: 'pr-note' }, 'Nimm dich beim Spielen auf und hör es dir danach an. Die Aufnahmen bleiben bei diesem Stück.'),
        playing ? (ui.pos = h('input', { type: 'range', min: 0, max: 1, step: 0.001, value: 0, 'aria-label': 'Position', oninput: () => { if (player.duration) player.currentTime = +ui.pos.value * player.duration; } })) : null));
    }
    // Tagebuch
    const today = dayKey();
    const days = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5); days.push([dayKey(d), WD[d.getDay()]]); }
    const total = (k) => scores.reduce((a, x) => a + (x.log?.[k]?.s || 0), 0);
    const week = days.map(([k, l]) => [k, l, total(k)]);
    const max = Math.max(60, ...week.map((w) => w[2]));
    const weekSum = week.reduce((a, w) => a + w[2], 0);
    parts.push(h('div', { class: 'ub-sec' },
      h('div', { class: 'ub-h' }, 'Übe-Tagebuch'),
      h('div', { class: 'ub-sum' }, h('div', {}, h('b', {}, fmtMin(total(today))), h('small', {}, 'heute')), h('div', {}, h('b', {}, fmtMin(weekSum)), h('small', {}, 'letzte 7 Tage'))),
      h('div', { class: 'ub-bars' }, week.map(([k, l, v]) => h('div', { class: `ub-bar${k === today ? ' today' : ''}`, title: `${dateLabel(k)}: ${fmtMin(v)}` },
        h('span', { style: `height:${Math.round((v / max) * 100)}%` }), h('small', {}, l))))));
    if (s) {
      const e = s.log?.[today] || {};
      const all = Object.values(s.log || {}).reduce((a, x) => a + (x.s || 0), 0);
      const best = Math.max(0, ...Object.values(s.log || {}).map((x) => x.bpm || 0));
      ui.today = h('b', {}, fmtMin(e.s || 0));
      let saveT = null;
      const note = h('textarea', { rows: 2, placeholder: 'Notiz für heute, z. B. „Takt 17–24 langsam üben“', value: e.note || '',
        oninput: () => { clearTimeout(saveT); saveT = setTimeout(() => { entry(s).note = note.value.trim(); saveScore(s); }, 600); } });
      note.value = e.note || '';
      const hist = Object.entries(s.log || {}).filter(([k, x]) => k !== today && (x.note || x.s >= 60)).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 8);
      parts.push(h('div', { class: 'ub-sec' },
        h('div', { class: 'ub-h' }, `„${s.title}“`),
        h('div', { class: 'ub-line' }, 'Heute ', ui.today, ` · insgesamt ${fmtMin(all)}`, best ? ` · Metronom bis ${best}` : ''),
        note,
        hist.length ? h('div', { class: 'ub-hist' }, hist.map(([k, x]) => h('div', {},
          h('b', {}, dateLabel(k)), ` ${fmtMin(x.s || 0)}${x.bpm ? ` · ${x.bpm} BPM` : ''}`, x.note ? h('div', { class: 'ub-note' }, x.note) : null))) : null));
    } else {
      // Ohne offenes Stück: was zuletzt geübt wurde
      const recent = [];
      for (const [k] of [...days].reverse()) for (const x of scores) if (x.log?.[k]?.s >= 60) recent.push([k, x, x.log[k]]);
      parts.push(h('div', { class: 'ub-sec' },
        h('div', { class: 'ub-h' }, 'Zuletzt geübt'),
        recent.length ? h('div', { class: 'ub-hist' }, recent.slice(0, 12).map(([k, x, e]) => h('div', {},
          h('b', {}, `${dateLabel(k)}: ${x.title}`), ` ${fmtMin(e.s)}${e.bpm ? ` · ${e.bpm} BPM` : ''}`, e.note ? h('div', { class: 'ub-note' }, e.note) : null)))
          : h('p', { class: 'pr-note' }, 'Die Übezeit zählt von selbst mit, solange ein Stück offen ist. Aufnahmen und Notizen gibt es in der Leseansicht.')));
    }
    return h('div', { class: 'pr-body ub' }, parts);
  }
  return { render, logBpm, flush, recording: () => !!rec, stop: () => { stopRec(); stopPlay(); } };
}
