// Metronomo e nota di riferimento (Web Audio). Nessun file audio: tutto sintetizzato,
// così l'app resta leggera e funziona identica offline.

import { chordNotes, midiToHz } from './chords.js';

let ctx = null;

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** Va chiamata dentro un gesto dell'utente: iOS non avvia l'audio altrimenti. */
export function unlockAudio() {
  const c = ac();
  if (!c) return;
  const b = c.createBuffer(1, 1, 22050);
  const s = c.createBufferSource();
  s.buffer = b;
  s.connect(c.destination);
  s.start(0);
}

// ---------------------------------------------------------------- metronomo

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;

/**
 * Metronomo a crome: due passi per ogni movimento. Sui movimenti batte il clic;
 * se c'è un modello di pennata ("D-DU-UDU": D giù, U su, X stoppata, - pausa)
 * su ogni passo suona anche la pennata corrispondente.
 */
export class Metronome {
  constructor(onBeat, onStep) {
    this.bpm = 100;
    this.meter = 4;
    this.pattern = null;
    this.running = false;
    this.onBeat = onBeat || (() => {});
    this.onStep = onStep || (() => {});
    this._step = 0;
    this._next = 0;
    this._timer = null;
  }

  start(bpm, meter, pattern = null) {
    const c = ac();
    if (!c) return false;
    if (bpm) this.bpm = bpm;
    if (meter) this.meter = meter;
    this.pattern = pattern || null;
    this.running = true;
    this._step = 0;
    this._next = c.currentTime + 0.06;
    this._timer = setInterval(() => this._tick(), LOOKAHEAD_MS);
    return true;
  }

  stop() {
    this.running = false;
    clearInterval(this._timer);
    this._timer = null;
    this.onBeat(-1, false);
    this.onStep(-1);
  }

  toggle(bpm, meter, pattern = null) {
    if (this.running) { this.stop(); return false; }
    return this.start(bpm, meter, pattern);
  }

  setBpm(bpm) {
    this.bpm = bpm;
  }

  setPattern(pattern) {
    this.pattern = pattern || null;
  }

  _tick() {
    const c = ac();
    if (!c || !this.running) return;
    while (this._next < c.currentTime + SCHEDULE_AHEAD) {
      const perBattuta = this.meter * 2;
      const passo = this._step % perBattuta;
      const sulMovimento = passo % 2 === 0;
      const beatIndex = passo / 2;
      const accent = passo === 0;
      const segno = this.pattern ? this.pattern[passo] : null;

      // con la pennata attiva il clic resta, ma più discreto
      if (sulMovimento) this._click(this._next, accent, this.pattern ? 0.45 : 1);
      if (segno && segno !== '-') this._strum(this._next, segno);

      const delay = Math.max(0, (this._next - c.currentTime) * 1000);
      setTimeout(() => {
        if (!this.running) return;
        if (sulMovimento) this.onBeat(beatIndex, accent);
        this.onStep(passo);
      }, delay);
      this._next += 60 / this.bpm / 2;
      this._step++;
    }
  }

  _click(time, accent, volume = 1) {
    const c = ac();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'square';
    osc.frequency.value = accent ? 1600 : 1050;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime((accent ? 0.5 : 0.28) * volume, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.055);
    osc.connect(gain).connect(c.destination);
    osc.start(time);
    osc.stop(time + 0.07);
  }

  /**
   * Pennata di sintesi: un soffio di rumore filtrato. Basta a sentire il
   * disegno ritmico — giù più pieno, su più chiaro, stoppata secca — senza
   * pretendere di imitare una chitarra vera.
   */
  _strum(time, segno) {
    const c = ac();
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c);
    const filtro = c.createBiquadFilter();
    const gain = c.createGain();
    const tipo = {
      D: { f: 1400, q: 0.9, vol: 0.55, dur: 0.16 },
      U: { f: 2600, q: 1.2, vol: 0.32, dur: 0.1 },
      X: { f: 700, q: 2.5, vol: 0.5, dur: 0.035 },
    }[segno] || null;
    if (!tipo) return;
    filtro.type = 'bandpass';
    filtro.frequency.value = tipo.f;
    filtro.Q.value = tipo.q;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(tipo.vol, time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + tipo.dur);
    src.connect(filtro).connect(gain).connect(c.destination);
    src.start(time);
    src.stop(time + tipo.dur + 0.02);
  }
}

let rumore = null;
function noiseBuffer(c) {
  if (rumore) return rumore;
  rumore = c.createBuffer(1, Math.floor(c.sampleRate * 0.25), c.sampleRate);
  const d = rumore.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return rumore;
}

// ------------------------------------------------------- nota di riferimento

let pitchStop = null;

/**
 * Suona la tonalità per intonare: prima le note arpeggiate, poi l'accordo tenuto.
 * Timbro dolce (triangolo + filtro) per non risultare aggressivo in chiesa.
 */
export function playKey(key, { arpeggio = true, hold = 2.2 } = {}) {
  const c = ac();
  if (!c) return false;
  stopKey();

  const notes = chordNotes(key);
  if (!notes.length) return false;

  const master = c.createGain();
  master.gain.value = 0.0001;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 2400;
  master.connect(filter).connect(c.destination);

  const t0 = c.currentTime + 0.04;
  const step = arpeggio ? 0.16 : 0;
  const end = t0 + step * notes.length + hold;
  const voices = [];

  notes.forEach((midi, i) => {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'triangle';
    osc.frequency.value = midiToHz(midi);
    const on = t0 + step * i;
    g.gain.setValueAtTime(0.0001, on);
    g.gain.exponentialRampToValueAtTime(0.22, on + 0.05);
    g.gain.setValueAtTime(0.22, end - 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(g).connect(master);
    osc.start(on);
    osc.stop(end + 0.05);
    voices.push(osc);
  });

  master.gain.setValueAtTime(0.9, t0);
  pitchStop = () => {
    const now = c.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    voices.forEach((v) => { try { v.stop(now + 0.15); } catch (e) { /* già fermo */ } });
    pitchStop = null;
  };
  setTimeout(() => { if (pitchStop) pitchStop = null; }, (end - c.currentTime + 0.2) * 1000);
  return true;
}

export function stopKey() {
  if (pitchStop) pitchStop();
}

// ------------------------------------------------------------------ tap tempo

export class TapTempo {
  constructor(timeoutMs = 2500) {
    this.taps = [];
    this.timeoutMs = timeoutMs;
  }

  /** Restituisce il BPM stimato, o null finché i battiti non bastano. */
  tap() {
    const now = performance.now();
    if (this.taps.length && now - this.taps[this.taps.length - 1] > this.timeoutMs) {
      this.taps = [];
    }
    this.taps.push(now);
    if (this.taps.length > 8) this.taps.shift();
    if (this.taps.length < 3) return null;

    const gaps = [];
    for (let i = 1; i < this.taps.length; i++) gaps.push(this.taps[i] - this.taps[i - 1]);
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const bpm = Math.round(60000 / avg);
    return bpm >= 30 && bpm <= 260 ? bpm : null;
  }

  get count() { return this.taps.length; }

  reset() { this.taps = []; }
}
