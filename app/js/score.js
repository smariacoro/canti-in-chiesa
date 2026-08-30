// Spartiti veri a partire da notazione ABC.
//
// ABC è il "LaTeX della musica": si scrive il pezzo in testo e viene disegnato
// il pentagramma. Il testo resta leggero, si trasporta e si cerca — cosa che una
// foto dello spartito non permetterebbe.
//
// La libreria (abcjs, licenza MIT) sta in app/vendor ed è caricata solo quando
// serve davvero, per non rallentare l'avvio; il service worker la tiene in cache
// così gli spartiti funzionano anche senza rete.

import { parseChord, isMinor } from './chords.js';

let loading = null;

export function loadAbcjs() {
  if (window.ABCJS) return Promise.resolve(window.ABCJS);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/abcjs-basic-min.js';
    s.async = true;
    s.onload = () => (window.ABCJS ? resolve(window.ABCJS) : reject(new Error('abcjs non caricato')));
    s.onerror = () => { loading = null; reject(new Error('Libreria degli spartiti non disponibile')); };
    document.head.append(s);
  });
  return loading;
}

/** Tonalità italiana -> lettera ABC: SIb -> Bb, LAm -> Am. */
export function keyToAbc(key) {
  const c = parseChord(key || '');
  if (!c) return 'C';
  const letters = { DO: 'C', RE: 'D', MI: 'E', FA: 'F', SOL: 'G', LA: 'A', SI: 'B' };
  return letters[c.root] + (c.alt || '') + (isMinor(c.suffix) ? 'm' : '');
}

/** Modello di partenza per l'organo: manuale e pedale. */
export function organTemplate(song) {
  const key = keyToAbc(song.key);
  const meter = `${song.meter || 4}/4`;
  return [
    'X:1',
    `T:${song.title || 'Canto'}`,
    `M:${meter}`,
    'L:1/4',
    `K:${key}`,
    'V:1 clef=treble',
    'V:2 clef=bass',
    '% Manuale — scrivi qui la melodia e gli accordi',
    '[V:1] C D E F | G2 G2 |',
    '% Pedale — la virgola abbassa di un\'ottava',
    '[V:2] C,,2 G,,2 | C,,4 |',
  ].join('\n');
}

export function singleStaffTemplate(song) {
  return [
    'X:1',
    `T:${song.title || 'Canto'}`,
    `M:${song.meter || 4}/4`,
    'L:1/4',
    `K:${keyToAbc(song.key)}`,
    'C D E F | G2 G2 |',
  ].join('\n');
}

/**
 * Disegna lo spartito dentro `container`.
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function renderScore(container, abc, { transpose = 0, staffwidth = null } = {}) {
  if (!abc || !abc.trim()) {
    container.replaceChildren();
    return { ok: true };
  }
  let ABCJS;
  try {
    ABCJS = await loadAbcjs();
  } catch (e) {
    container.replaceChildren();
    container.append(Object.assign(document.createElement('p'), {
      className: 'score-error',
      textContent: e.message,
    }));
    return { ok: false, error: e.message };
  }

  try {
    const params = {
      responsive: staffwidth ? undefined : 'resize',
      staffwidth: staffwidth || undefined,
      visualTranspose: transpose || 0,
      paddingtop: 4,
      paddingbottom: 4,
      paddingleft: 0,
      paddingright: 0,
    };
    const tunes = ABCJS.renderAbc(container, abc, params);
    if (!tunes || !tunes.length) throw new Error('Spartito non riconosciuto');
    return { ok: true };
  } catch (e) {
    container.replaceChildren();
    container.append(Object.assign(document.createElement('p'), {
      className: 'score-error',
      textContent: `Non riesco a disegnare lo spartito: ${e.message}`,
    }));
    return { ok: false, error: e.message };
  }
}

/** Promemoria delle corrispondenze, perché l'app usa la notazione italiana. */
export const ABC_LEGEND = [
  ['DO', 'C'], ['RE', 'D'], ['MI', 'E'], ['FA', 'F'],
  ['SOL', 'G'], ['LA', 'A'], ['SI', 'B'],
];
