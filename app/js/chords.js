// Accordi in notazione italiana: analisi, trasposizione, frequenze.

const SHARP = ['DO', 'DO#', 'RE', 'RE#', 'MI', 'FA', 'FA#', 'SOL', 'SOL#', 'LA', 'LA#', 'SI'];
const FLAT  = ['DO', 'REb', 'RE', 'MIb', 'MI', 'FA', 'SOLb', 'SOL', 'LAb', 'LA', 'SIb', 'SI'];

const PITCH = {
  DO: 0, RE: 2, MI: 4, FA: 5, SOL: 7, LA: 9, SI: 11,
};

// SOL prima di SI/LA: l'ordine conta, "SOL" non deve essere letto come "SI"+resto.
const ROOT_RE = /^(SOL|DO|RE|MI|FA|LA|SI)([#b♯♭]?)/;

/** Scompone "LAm7/DO#" -> {root:'LA', alt:'', suffix:'m7', bass:'DO#'} oppure null. */
export function parseChord(text) {
  if (!text) return null;
  const m = ROOT_RE.exec(text.trim());
  if (!m) return null;
  let rest = text.trim().slice(m[0].length);
  let bass = null;
  const slash = rest.indexOf('/');
  if (slash >= 0) {
    const b = ROOT_RE.exec(rest.slice(slash + 1));
    if (b) bass = b[0];
    rest = rest.slice(0, slash);
  }
  const alt = m[2].replace('♯', '#').replace('♭', 'b');
  return { root: m[1], alt, suffix: rest, bass };
}

/** Una cella può contenere più accordi separati da spazio ("DO SOL"). */
export function splitCell(cell) {
  return String(cell || '').trim().split(/\s+/).filter(Boolean);
}

function semitone(root, alt) {
  let n = PITCH[root];
  if (alt === '#') n += 1;
  else if (alt === 'b') n -= 1;
  return ((n % 12) + 12) % 12;
}

function spell(n, preferFlat) {
  n = ((n % 12) + 12) % 12;
  return preferFlat ? FLAT[n] : SHARP[n];
}

/** Trasposizione di `steps` semitoni, preservando suffissi e basso. */
export function transposeChord(text, steps, preferFlat = false) {
  const c = parseChord(text);
  if (!c) return text;
  const root = spell(semitone(c.root, c.alt) + steps, preferFlat);
  let out = root + c.suffix;
  if (c.bass) {
    const b = parseChord(c.bass);
    out += '/' + spell(semitone(b.root, b.alt) + steps, preferFlat);
  }
  return out;
}

export function transposeCell(cell, steps, preferFlat = false) {
  if (!steps) return cell;
  return splitCell(cell).map((c) => transposeChord(c, steps, preferFlat)).join(' ');
}

/** Le tonalità con bemolli si scrivono con i bemolli anche dopo la trasposizione. */
export function prefersFlat(keyText) {
  const c = parseChord(keyText || '');
  if (!c) return false;
  if (c.alt === 'b') return true;
  const n = semitone(c.root, c.alt);
  const minor = isMinor(c.suffix);
  // FA maggiore, SIb, MIb, LAb… e le relative minori
  return minor ? [2, 5, 7, 10, 0].includes(n) && c.alt === 'b' : [5, 10, 3, 8, 1].includes(n);
}

export function isMinor(suffix) {
  return /^(m|min|-)(?!aj)/.test(suffix || '');
}

/** Nome leggibile della tonalità: "LAm" -> "LA minore". */
export function keyLabel(text) {
  const c = parseChord(text || '');
  if (!c) return '—';
  return c.root + c.alt + (isMinor(c.suffix) ? ' minore' : ' maggiore');
}

/** Intervalli della triade suggerita dal suffisso. */
export function chordIntervals(suffix) {
  const s = suffix || '';
  if (/^(dim|°)/.test(s)) return [0, 3, 6];
  if (/^(aug|\+)/.test(s)) return [0, 4, 8];
  if (/^sus2/.test(s)) return [0, 2, 7];
  if (/^sus4?/.test(s)) return [0, 5, 7];
  const base = isMinor(s) ? [0, 3, 7] : [0, 4, 7];
  if (/(^|[^a-z])7/.test(s) && !/maj7|7\+/.test(s)) return [...base, 10];
  if (/maj7|7\+/.test(s)) return [...base, 11];
  return base;
}

/** Frequenza in Hz di un numero MIDI (LA4 = 69 = 440 Hz). */
export function midiToHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Note MIDI dell'accordo di riferimento, in una tessitura comoda per intonare
 * (DO3–SI3, cioè attorno al centro della voce corale).
 */
export function chordNotes(text) {
  const c = parseChord(text || '');
  if (!c) return [];
  const root = 48 + semitone(c.root, c.alt); // DO3 = 48
  return chordIntervals(c.suffix).map((i) => root + i);
}

export function tonicNote(text) {
  const notes = chordNotes(text);
  return notes.length ? notes[0] : null;
}

export const KEY_OPTIONS = (() => {
  const out = [];
  for (const n of SHARP) { out.push(n); out.push(n + 'm'); }
  return out;
})();
