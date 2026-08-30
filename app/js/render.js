// Resa del corpo di un canto. Usata sia dalla vista a schermo sia dalla stampa,
// così la pagina stampata è identica a quella che il coro vede sul telefono.

import { el } from './ui.js';
import { transposeCell, prefersFlat } from './chords.js';

const SECTION_LABELS = {
  rit: 'Ritornello',
  ponte: 'Ponte',
  bridge: 'Ponte',
  intro: 'Introduzione',
  finale: 'Finale',
  coda: 'Coda',
  strumentale: 'Strumentale',
  strofa: 'Strofa',
};

/**
 * @param {object} song
 * @param {object} opts  transpose (semitoni), showChords, className
 * @returns {HTMLElement} contenitore .song-body
 */
export function renderSongBody(song, { transpose = 0, showChords = true, className = '' } = {}) {
  const flat = prefersFlat(song.key ? transposeCell(song.key, transpose) : '');
  const body = el('div', { class: `song-body ${showChords ? '' : 'no-chords'} ${className}`.trim() });

  for (const sec of song.sections || []) {
    const wrap = el('div', { class: `song-section ${sec.label === 'rit' ? 'rit' : ''}`.trim() });
    const label = SECTION_LABELS[sec.label];
    if (label && showChords !== 'labels-off') {
      wrap.append(el('span', { class: 'lbl', text: label }));
    }
    for (const line of sec.lines || []) {
      const ln = el('div', { class: `song-line ${line.instr ? 'instr' : ''}`.trim() });
      const segs = line.s || [];
      if (!segs.length) { ln.append(el('span', { class: 'seg' }, [el('span', { class: 'tx', text: ' ' })])); }
      for (const seg of segs) {
        const chord = seg.c ? transposeCell(seg.c, transpose, flat) : '';
        ln.append(el('span', { class: 'seg' }, [
          el('span', { class: 'ch', text: chord || ' ' }),
          el('span', { class: 'tx', text: seg.t || (seg.c ? ' ' : '') }),
        ]));
      }
      wrap.append(ln);
    }
    body.append(wrap);
  }

  if (!(song.sections || []).length) {
    body.append(el('p', { class: 'empty', text: 'Questo canto non ha ancora testo. Aprilo in modifica per aggiungerlo.' }));
  }
  return body;
}

/** Testo semplice con accordi sopra, per l'editor e l'esportazione. */
export function songToText(song, transpose = 0) {
  const flat = prefersFlat(song.key || '');
  const out = [];
  for (const sec of song.sections || []) {
    if (sec.label && sec.label !== 'strumentale') out.push(`[${sec.label}]`);
    for (const line of sec.lines || []) {
      let chordLine = '';
      let textLine = '';
      for (const seg of line.s || []) {
        const c = seg.c ? transposeCell(seg.c, transpose, flat) : '';
        const t = seg.t || '';
        // due spazi minimi dopo un accordo: dentro una cella gli accordi impilati
        // restano separati da uno solo, così la rilettura non li confonde.
        const width = Math.max(c ? c.length + 2 : 0, t.length);
        chordLine += c ? c.padEnd(width) : ' '.repeat(t.length);
        textLine += t.padEnd(c ? width : t.length);
      }
      const hasChords = Boolean(chordLine.trim());
      if (hasChords) out.push(chordLine.replace(/\s+$/, ''));
      // una riga di soli accordi non emette la riga di testo vuota, che
      // altrimenti al rientro spezzerebbe la sezione in due
      if (textLine.trim() || !hasChords) out.push(textLine.replace(/\s+$/, ''));
    }
    out.push('');
  }
  // niente trim(): toglierebbe l'indentazione della prima riga di accordi,
  // spostando il primo accordo del canto a inizio riga.
  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/[ \t]*\n+$/, '');
}

/**
 * Ricostruisce le sezioni dal testo dell'editor: righe di accordi alternate a
 * righe di testo, blocchi separati da riga vuota, `[rit]` per l'etichetta.
 */
export function textToSong(text) {
  const CHORD_RE = /^(SOL|DO|RE|MI|FA|LA|SI)([#b]?)([^\s/]*)(\/(SOL|DO|RE|MI|FA|LA|SI)[#b]?)?$/;
  const isChordLine = (l) => {
    const toks = l.trim().split(/\s+/).filter(Boolean);
    return toks.length > 0 && toks.every((t) => CHORD_RE.test(t));
  };

  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const sections = [];
  let cur = null;
  const flush = () => {
    if (cur && cur.lines.length) {
      // un blocco di soli accordi è uno stacco strumentale
      if (!cur.label && cur.lines.every((l) => l.instr)) cur.label = 'strumentale';
      sections.push(cur);
    }
    cur = null;
  };
  const ensure = (label = null) => { if (!cur) cur = { label, lines: [] }; return cur; };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { flush(); continue; }

    const tag = /^\s*\[([a-zà-ù ]+)\]\s*$/i.exec(line);
    if (tag) { flush(); ensure(tag[1].trim().toLowerCase()); continue; }

    if (isChordLine(line)) {
      // Accordi separati da un solo spazio = impilati sulla stessa sillaba.
      const chords = [];
      const re = /\S+(?: \S+)*/g;
      let m;
      while ((m = re.exec(line))) chords.push([m.index, m[0]]);
      const next = lines[i + 1] !== undefined ? lines[i + 1].replace(/\s+$/, '') : '';
      if (next.trim() && !isChordLine(next)) {
        ensure().lines.push({ s: buildSegments(next, chords) });
        i++;
      } else {
        ensure().lines.push({ s: chords.map(([, c]) => ({ c })), instr: true });
      }
      continue;
    }
    ensure().lines.push({ s: [{ t: line.trim() }] });
  }
  flush();
  return sections;
}

/**
 * Aggancia ogni accordo all'inizio di parola più vicino, come fa l'importer del
 * catalogo. Serve anche a rendere reversibile il passaggio testo→dati: due
 * accordi sulla stessa parola tornano in un'unica cella invece di spezzarla.
 */
function buildSegments(lyric, chords) {
  const shift = lyric.length - lyric.replace(/^\s+/, '').length;
  const body = lyric.trim();
  if (!chords.length) return [{ t: body }];

  const starts = [];
  const wordRe = /\S+/g;
  let w;
  while ((w = wordRe.exec(body))) starts.push(w.index);

  const placed = [];
  const leading = [];   // accordi di anacrusi, prima che il testo cominci
  const trailing = [];
  let last = -1;
  for (const [col0, ch] of chords) {
    const col = col0 - shift;
    if (col < 0) { leading.push(ch); continue; }
    const near = starts.filter((s) => s >= last);
    if (col >= body.length || !near.length) { trailing.push(ch); continue; }
    const snap = near.reduce((best, s) => (
      Math.abs(s - col) < Math.abs(best - col) ? s : best
    ), near[0]);
    if (placed.length && placed[placed.length - 1][0] === snap) placed[placed.length - 1][1].push(ch);
    else placed.push([snap, [ch]]);
    last = snap;
  }

  const segs = leading.map((c) => ({ c }));
  if (!placed.length) segs.push({ t: body });
  else {
    if (placed[0][0] > 0) segs.push({ t: body.slice(0, placed[0][0]) });
    placed.forEach(([col, chs], i) => {
      const end = i + 1 < placed.length ? placed[i + 1][0] : body.length;
      segs.push({ c: chs.join(' '), t: body.slice(col, end) });
    });
  }
  for (const c of trailing) segs.push({ c });
  return segs;
}
