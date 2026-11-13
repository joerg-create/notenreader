// Metronom und Stimmgerät (Web Audio). Die Oberfläche baut sich selbst auf; app.js reicht Hilfsfunktionen herein.

import { makePlayer } from './player.js';
import { makeUeben } from './ueben.js';

let ctx = null;
function audio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
// iPhone/iPad: Ton auch bei stummgeschaltetem Klingelschalter
function audioSession(type) { try { if (navigator.audioSession) navigator.audioSession.type = type; } catch { /* egal */ } }

/* ---------- Tonhöhenerkennung (McLeod-Pitch-Methode) ---------- */
export function detectPitch(x, sr) {
  const n = x.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += x[i] * x[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.008) return null;
  const maxLag = Math.min(n >> 1, Math.floor(sr / 40));
  const minLag = Math.floor(sr / 1400);
  const nsdf = new Float32Array(maxLag);
  for (let tau = 0; tau < maxLag; tau++) {
    let acf = 0, m = 0;
    for (let i = 0, end = n - tau; i < end; i++) { const a = x[i], b = x[i + tau]; acf += a * b; m += a * a + b * b; }
    nsdf[tau] = m > 0 ? (2 * acf) / m : 0;
  }
  const peaks = [];
  let tau = 0;
  while (tau < maxLag && nsdf[tau] > 0) tau++;
  while (tau < maxLag) {
    while (tau < maxLag && nsdf[tau] <= 0) tau++;
    let best = -1, bi = -1;
    while (tau < maxLag && nsdf[tau] > 0) { if (nsdf[tau] > best) { best = nsdf[tau]; bi = tau; } tau++; }
    if (bi > 0 && bi < maxLag - 1) peaks.push(bi);
  }
  if (!peaks.length) return null;
  const maxP = Math.max(...peaks.map((p) => nsdf[p]));
  const k = peaks.find((p) => p >= minLag && nsdf[p] >= 0.88 * maxP);
  if (k === undefined || nsdf[k] < 0.6) return null;
  const a = nsdf[k - 1], b = nsdf[k], c = nsdf[k + 1];
  const den = a - 2 * b + c;
  const shift = den ? (a - c) / (2 * den) : 0;
  return { freq: sr / (k + shift), clarity: b, rms };
}

const NAMES = ['C', 'Cis', 'D', 'Es', 'E', 'F', 'Fis', 'G', 'As', 'A', 'B', 'H'];
const TRANSPOSE = { C: 0, B: 2, Es: 9, F: 7 };
const TEMPO_NAMES = [[40, 'Grave'], [60, 'Largo'], [66, 'Larghetto'], [76, 'Adagio'], [108, 'Andante'], [120, 'Moderato'], [156, 'Allegro'], [176, 'Vivace'], [200, 'Presto'], [999, 'Prestissimo']];
const tempoName = (bpm) => TEMPO_NAMES.find(([max]) => bpm < max)[1];

export function initPractice({ h, icon, settings, saveSettings, toast, getScore, getScores, saveScore, db, share }) {
  const st = {
    bpm: settings.metroBpm || 100, beats: settings.metroBeats || 4, sub: settings.metroSub || 1,
    vol: settings.metroVol ?? 0.8, a4: settings.tunerA4 || 443, trans: settings.tunerTrans || 'C',
    // Tempo-Trainer: alle `every` Takte um `step` BPM schneller, bis `target`
    train: { on: false, every: 4, step: 2, target: 120, ...(settings.metroTrain || {}) },
  };
  const saveTrain = () => { settings.metroTrain = { ...st.train }; saveSettings(); };
  const save = () => {
    Object.assign(settings, { metroBpm: st.bpm, metroBeats: st.beats, metroSub: st.sub, metroVol: st.vol, tunerA4: st.a4, tunerTrans: st.trans });
    saveSettings();
    const s = getScore();
    if (s) { s.metro = { bpm: st.bpm, beats: st.beats, sub: st.sub }; saveScore(s); }
  };

  /* ----- Metronom ----- */
  let running = false, timer = null, nextTime = 0, tick = 0, startBpm = 0, bars = 0;
  const queue = []; // { time, beat, sub }
  function click(time, kind) {
    const ac = audio();
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = kind === 0 ? 'square' : 'sine';
    o.frequency.value = kind === 0 ? 1760 : kind === 1 ? 1175 : 880;
    const peak = st.vol * (kind === 2 ? 0.35 : kind === 0 ? 0.6 : 0.8);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, time + (kind === 2 ? 0.03 : 0.05));
    o.connect(g).connect(ac.destination);
    o.start(time); o.stop(time + 0.06);
  }
  function schedule() {
    const ac = audio();
    while (nextTime < ac.currentTime + 0.12) {
      const sub = tick % st.sub, beat = Math.floor(tick / st.sub) % st.beats;
      if (tick && sub === 0 && beat === 0 && st.train.on) {
        bars++;
        if (bars % Math.max(1, st.train.every) === 0 && st.bpm < st.train.target) {
          st.bpm = Math.min(st.train.target, st.bpm + Math.max(1, st.train.step));
          setTimeout(liveBpm, 0);
        }
      }
      const step = 60 / st.bpm / st.sub;
      const kind = sub ? 2 : beat === 0 && st.beats > 1 ? 0 : 1;
      click(nextTime, kind);
      queue.push({ time: nextTime, beat, sub });
      nextTime += step;
      tick++;
    }
  }
  function start() {
    audioSession('playback');
    const ac = audio();
    running = true; tick = 0; bars = 0; nextTime = ac.currentTime + 0.06; queue.length = 0;
    startBpm = st.bpm;
    schedule();
    timer = setInterval(schedule, 25);
    requestAnimationFrame(draw);
    save();
    render();
  }
  function stop() {
    if (running) ueben?.logBpm(st.bpm);
    running = false; clearInterval(timer); timer = null; queue.length = 0;
    if (st.train.on && startBpm) st.bpm = startBpm; // Trainer beginnt beim nächsten Mal wieder beim Starttempo
    render();
  }
  let lastBeat = -1;
  function draw() {
    if (!running) { lastBeat = -1; paintBeat(-1); return; }
    const now = audio().currentTime;
    let cur = null;
    while (queue.length && queue[0].time <= now) cur = queue.shift();
    if (cur && cur.sub === 0) { lastBeat = cur.beat; paintBeat(cur.beat); }
    requestAnimationFrame(draw);
  }
  function paintBeat(b) {
    for (const [i, d] of dots.entries()) d.classList.toggle('on', i === b);
    pill.classList.toggle('flash', b >= 0);
    if (b >= 0) { pill.classList.toggle('accent', b === 0); setTimeout(() => pill.classList.remove('flash'), 90); }
  }
  const setBpm = (v) => { st.bpm = Math.max(20, Math.min(300, Math.round(v))); if (running) { startBpm = st.bpm; bars = 0; if (!st.train.on) save(); } render(); };
  let liveEls = null;
  function liveBpm() {
    if (pill.childNodes[1]) pill.childNodes[1].textContent = String(st.bpm);
    if (liveEls) { liveEls.bpm.textContent = st.bpm; liveEls.name.textContent = tempoName(st.bpm); liveEls.slider.value = st.bpm; }
  }
  let taps = [];
  function tap() {
    const t = performance.now();
    taps = taps.filter((x) => t - x < 2500);
    taps.push(t);
    if (taps.length >= 2) {
      const iv = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
      setBpm(60000 / iv);
    }
  }

  /* ----- Stimmgerät ----- */
  let mic = null, analyser = null, buf = null, tunerOn = false, hist = [];
  async function startTuner() {
    try {
      audioSession('play-and-record');
      const ac = audio();
      mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const src = ac.createMediaStreamSource(mic);
      analyser = ac.createAnalyser();
      analyser.fftSize = 4096;
      src.connect(analyser);
      buf = new Float32Array(analyser.fftSize);
      tunerOn = true; hist = [];
      render();
      loopTuner();
    } catch (e) {
      console.error(e);
      toast('Kein Zugriff aufs Mikrofon. Bitte in den Einstellungen von Safari/iPad erlauben.', 5000);
      stopTuner();
    }
  }
  function stopTuner() {
    tunerOn = false;
    mic?.getTracks().forEach((t) => t.stop());
    mic = null; analyser = null;
    audioSession(running ? 'playback' : 'auto');
    render();
  }
  let lastRun = 0;
  function loopTuner(ts = 0) {
    if (!tunerOn || !analyser) return;
    if (ts - lastRun > 45) {
      lastRun = ts;
      analyser.getFloatTimeDomainData(buf);
      const r = detectPitch(buf.subarray(buf.length - 3072), audio().sampleRate);
      if (r) { hist.push(r.freq); if (hist.length > 5) hist.shift(); showPitch([...hist].sort((a, b) => a - b)[hist.length >> 1]); }
      else { hist = []; showPitch(null); }
    }
    requestAnimationFrame(loopTuner);
  }
  function noteOf(freq) {
    const midi = 69 + 12 * Math.log2(freq / st.a4);
    const near = Math.round(midi);
    const shown = near + TRANSPOSE[st.trans];
    return { name: NAMES[((shown % 12) + 12) % 12], oct: Math.floor(shown / 12) - 1, cents: Math.round((midi - near) * 100) };
  }
  let tView = null;
  function showPitch(freq) {
    if (!tView) return;
    if (!freq) { tView.root.classList.add('idle'); return; }
    const n = noteOf(freq);
    tView.root.classList.remove('idle');
    tView.note.textContent = n.name;
    tView.oct.textContent = n.oct;
    tView.cents.textContent = `${n.cents > 0 ? '+' : ''}${n.cents} Cent`;
    tView.freq.textContent = `${freq.toFixed(1)} Hz`;
    tView.needle.style.left = `${50 + Math.max(-50, Math.min(50, n.cents))}%`;
    const ok = Math.abs(n.cents) <= 5;
    tView.root.classList.toggle('intune', ok);
    tView.hint.textContent = ok ? 'Stimmt' : n.cents < 0 ? 'zu tief' : 'zu hoch';
  }
  // Referenzton
  let tone = null;
  function playTone(written, octave) {
    stopTone();
    audioSession('playback');
    const ac = audio();
    const semis = NAMES.indexOf(written) - TRANSPOSE[st.trans];
    const midi = (octave + 1) * 12 + semis;
    const f = st.a4 * 2 ** ((midi - 69) / 12);
    const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain();
    o.type = 'triangle'; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f * 2;
    const g2 = ac.createGain(); g2.gain.value = 0.25;
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.35 * st.vol + 0.05, ac.currentTime + 0.05);
    o.connect(g); o2.connect(g2).connect(g); g.connect(ac.destination);
    o.start(); o2.start();
    tone = { o, o2, g };
    render();
    setTimeout(() => { if (tone?.o === o) stopTone(); }, 4000);
  }
  function stopTone() {
    if (!tone) return;
    const ac = audio(), { o, o2, g } = tone;
    tone = null;
    g.gain.cancelScheduledValues(ac.currentTime);
    g.gain.setValueAtTime(g.gain.value, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.08);
    o.stop(ac.currentTime + 0.1); o2.stop(ac.currentTime + 0.1);
    render();
  }

  /* ----- Oberfläche ----- */
  const panel = h('div', { id: 'practice', hidden: true, role: 'dialog', 'aria-label': 'Metronom und Stimmgerät' });
  const pill = h('button', { id: 'metro-pill', hidden: true, onclick: () => open('metro') });
  document.body.append(panel, pill);
  let tab = 'metro', dots = [];
  const hooks = { panelOpen: () => !panel.hidden, openPanel: () => open('play'), rerender: () => render() };
  const player = makePlayer({ h, icon, toast, getScore, getScores, saveScore, db, onChange: hooks });
  const ueben = makeUeben({ h, icon, toast, settings, getScore, getScores, saveScore, db, share, rerender: () => { if (tab === 'ueben') render(); } });
  let refNote = 'B', refOct = 3;

  function render() {
    const s = getScore();
    liveEls = null;
    pill.hidden = !(running && panel.hidden);
    pill.replaceChildren(h('span', { class: 'pill-dot' }), `${st.bpm}`, h('span', { class: 'pill-stop', onclick: (e) => { e.stopPropagation(); stop(); } }, '■'));
    if (panel.hidden) return;
    const head = h('div', { class: 'pr-head' },
      tab === 'play' || tab === 'ueben'
        ? h('div', { class: 'pr-title' }, tab === 'play' ? 'Mitspielen' : 'Üben')
        : h('div', { class: 'pr-tabs' },
          h('button', { class: tab === 'metro' ? 'active' : '', onclick: () => { tab = 'metro'; render(); } }, 'Metronom'),
          h('button', { class: tab === 'tuner' ? 'active' : '', onclick: () => { tab = 'tuner'; render(); } }, 'Stimmgerät')),
      h('button', { class: 'btn icon small', 'aria-label': 'Schließen', onclick: close }, icon('x')));
    let body;
    if (tab === 'ueben') {
      body = ueben.render();
    } else if (tab === 'play') {
      body = player.render();
    } else if (tab === 'metro') {
      dots = Array.from({ length: st.beats }, (_, i) => h('span', { class: `beat${i === 0 && st.beats > 1 ? ' first' : ''}` }));
      const slider = h('input', { type: 'range', min: 30, max: 250, value: st.bpm, oninput: () => { st.bpm = +slider.value; bpmEl.textContent = st.bpm; nameEl.textContent = tempoName(st.bpm); }, onchange: () => setBpm(+slider.value) });
      const bpmEl = h('div', { class: 'pr-bpm' }, st.bpm);
      const nameEl = h('div', { class: 'pr-sub' }, tempoName(st.bpm));
      const beatsSel = h('select', { 'aria-label': 'Schläge pro Takt', onchange: () => { st.beats = +beatsSel.value; if (running) save(); render(); } },
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 12].map((b) => h('option', { value: b }, b === 1 ? 'ohne Betonung' : `${b} Schläge`)));
      beatsSel.value = st.beats;
      const subSel = h('select', { 'aria-label': 'Unterteilung', onchange: () => { st.sub = +subSel.value; if (running) save(); } },
        [[1, 'Viertel'], [2, 'Achtel'], [3, 'Triolen'], [4, 'Sechzehntel']].map(([v, l]) => h('option', { value: v }, l)));
      subSel.value = st.sub;
      const vol = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: st.vol, 'aria-label': 'Lautstärke', oninput: () => { st.vol = +vol.value; }, onchange: save });
      liveEls = { bpm: bpmEl, name: nameEl, slider };
      const num = (key, min, max, label) => {
        const el = h('input', { type: 'number', inputmode: 'numeric', min, max, value: st.train[key], 'aria-label': label,
          onchange: () => { st.train[key] = Math.max(min, Math.min(max, Math.round(+el.value || min))); el.value = st.train[key]; saveTrain(); } });
        return el;
      };
      const trainOn = h('input', { type: 'checkbox', checked: st.train.on, onchange: () => {
        st.train.on = trainOn.checked;
        if (st.train.on && st.train.target <= st.bpm) st.train.target = Math.min(300, st.bpm + 20);
        saveTrain(); render();
      } });
      const trainer = h('div', { class: `pr-train${st.train.on ? ' on' : ''}` },
        h('label', { class: 'pr-train-head' }, trainOn, h('span', {}, h('b', {}, 'Tempo-Trainer'), h('small', {}, st.train.on ? (running ? ` · Start ${startBpm}, Ziel ${st.train.target}` : ` · von ${st.bpm} bis ${st.train.target}`) : ' · langsam anfangen, von selbst schneller werden'))),
        st.train.on ? h('div', { class: 'pr-train-row' },
          'alle', num('every', 1, 64, 'Takte'), 'Takte um', num('step', 1, 20, 'BPM'), 'schneller, bis', num('target', 30, 300, 'Ziel-Tempo')) : null);
      body = h('div', { class: 'pr-body' },
        h('div', { class: 'pr-tempo' },
          h('button', { class: 'btn round', 'aria-label': 'Langsamer', onclick: () => setBpm(st.bpm - 1) }, '−'),
          h('div', {}, bpmEl, nameEl),
          h('button', { class: 'btn round', 'aria-label': 'Schneller', onclick: () => setBpm(st.bpm + 1) }, '+')),
        slider,
        h('div', { class: 'pr-dots' }, dots),
        h('div', { class: 'pr-row' }, beatsSel, subSel),
        h('div', { class: 'pr-row' },
          h('button', { class: 'btn', onclick: tap }, 'Tippen (Tap)'),
          h('button', { class: `btn ${running ? 'danger' : 'primary'} pr-go`, onclick: () => (running ? stop() : start()) }, running ? 'Stopp' : 'Start')),
        trainer,
        h('label', { class: 'pr-vol' }, h('span', {}, 'Lautstärke'), vol),
        s ? h('p', { class: 'pr-note' }, `Das Tempo wird für „${s.title}“ gemerkt.`) : null);
    } else {
      const a4 = h('div', { class: 'pr-a4' }, `${st.a4} Hz`);
      const transSel = h('select', { 'aria-label': 'Anzeige', onchange: () => { st.trans = transSel.value; save(); render(); } },
        [['C', 'Klingend (C)'], ['B', 'B-Instrument (Tenorhorn, Bariton, Trompete)'], ['Es', 'Es-Instrument (Altsaxofon, Es-Horn)'], ['F', 'F-Instrument (Horn)']].map(([v, l]) => h('option', { value: v }, l)));
      transSel.value = st.trans;
      const noteSel = h('select', { 'aria-label': 'Referenzton', onchange: () => { refNote = noteSel.value; } }, NAMES.map((n) => h('option', { value: n }, n)));
      noteSel.value = refNote;
      const octSel = h('select', { 'aria-label': 'Oktave', onchange: () => { refOct = +octSel.value; } }, [2, 3, 4, 5].map((o) => h('option', { value: o }, `Oktave ${o}`)));
      octSel.value = refOct;
      tView = {
        root: h('div', { class: 'pr-tuner idle' }),
        note: h('span', { class: 'pr-note-name' }, '–'), oct: h('sub', {}, ''),
        cents: h('div', { class: 'pr-sub' }, ''), freq: h('div', { class: 'pr-sub' }, ''), hint: h('div', { class: 'pr-hint' }, ''),
        needle: h('div', { class: 'pr-needle' }),
      };
      tView.root.append(
        h('div', { class: 'pr-big' }, tView.note, tView.oct),
        tView.hint,
        h('div', { class: 'pr-scale' }, h('div', { class: 'pr-zone' }), h('span', { class: 'l' }, '−50'), h('span', { class: 'c' }, '0'), h('span', { class: 'r' }, '+50'), tView.needle),
        h('div', { class: 'pr-row pr-meta' }, tView.cents, tView.freq));
      body = h('div', { class: 'pr-body' },
        tView.root,
        h('button', { class: `btn ${tunerOn ? 'danger' : 'primary'} pr-go`, onclick: () => (tunerOn ? stopTuner() : startTuner()) }, tunerOn ? 'Mikrofon aus' : 'Mikrofon an'),
        h('div', { class: 'pr-row' },
          h('span', { class: 'pr-label' }, 'Kammerton a¹'),
          h('button', { class: 'btn round small', onclick: () => { st.a4 = Math.max(415, st.a4 - 1); save(); render(); } }, '−'), a4,
          h('button', { class: 'btn round small', onclick: () => { st.a4 = Math.min(466, st.a4 + 1); save(); render(); } }, '+')),
        h('label', { class: 'pr-field' }, h('span', {}, 'Anzeige'), transSel),
        h('div', { class: 'pr-row' },
          h('span', { class: 'pr-label' }, 'Referenzton'), noteSel, octSel,
          h('button', { class: 'btn', onclick: () => (tone ? stopTone() : playTone(refNote, refOct)) }, tone ? 'Stopp' : 'Spielen')));
    }
    panel.replaceChildren(head, body);
  }
  function open(which) {
    const s = getScore();
    if (s?.metro && !running) Object.assign(st, s.metro);
    if (which) tab = which;
    panel.hidden = false;
    render();
  }
  function close() {
    panel.hidden = true;
    setTimeout(() => player.update(), 0);
    tView = null;
    if (tunerOn) stopTuner();
    stopTone();
    render();
  }
  // Beim Wechsel des Stücks dessen Tempo übernehmen
  function scoreChanged() {
    const s = getScore();
    if (s?.metro && !running) Object.assign(st, s.metro);
    player.scoreChanged();
    render();
  }
  let lastTool = 'metro';
  function toggle(which) {
    if (panel.hidden) return open(which);
    if (which && which !== tab) return open(which);
    close();
  }
  return {
    open, close, toggle, scoreChanged, isOpen: () => !panel.hidden,
    // Metronom-Knopf: Metronom/Stimmgerät; Musik-Knopf: Mitspielen
    flush: () => ueben.flush(),
    // Drei Fenster: Metronom/Stimmgerät, Mitspielen, Üben
    toggleTools: () => { const isTool = tab === 'metro' || tab === 'tuner'; if (isTool) lastTool = tab; toggle(isTool && !panel.hidden ? undefined : lastTool); },
    toggleMusic: () => { if (tab === 'metro' || tab === 'tuner') lastTool = tab; toggle('play'); },
    toggleUeben: () => { if (tab === 'metro' || tab === 'tuner') lastTool = tab; toggle('ueben'); },
  };
}
