// Spostamento degli accordi: il testo resta fermo, gli accordi si trascinano
// sulla parola giusta. Nei documenti originali erano allineati a occhio, con
// spazi, e capita che siano finiti sulla parola accanto.
//
// Due modi di spostarli, perché sul telefono il trascinamento non è sempre
// comodo: trascinare l'accordo, oppure toccarlo e poi toccare la parola.
// Con un accordo selezionato, le frecce lo spostano di una parola alla volta.
// Ci si sposta solo dentro la stessa riga: è quasi sempre lì l'errore, e così
// scorrendo la pagina col dito non si rischia di portare un accordo altrove.

import { el, clear, toast, confirmDialog } from '../ui.js';
import { store } from '../store.js';
import { lineToModel, modelToLine } from '../render.js';
import { transposeCell, prefersFlat } from '../chords.js';
import { navigate } from '../router.js';

export function chordMoveView(root, song, { transpose = 0, setlistId = null } = {}) {
  clear(root);
  root.classList.remove('wide');

  const flat = prefersFlat(song.key ? transposeCell(song.key, transpose) : '');
  const nome = (c) => transposeCell(c, transpose, flat);

  // modello di lavoro: sezioni -> righe -> {text, words, tokens}
  let n = 0;
  const sezioni = (song.sections || []).map((sec) => ({
    label: sec.label,
    righe: (sec.lines || []).map((line) => lineToModel(line, n++)),
  }));
  const righe = sezioni.flatMap((s) => s.righe);
  // si confrontano le righe ricostruite: conta il risultato, non il percorso
  const firma = () => JSON.stringify(righe.map((r) => modelToLine(r)));
  const iniziale = firma();

  let scelto = null;       // {riga, id} dell'accordo selezionato
  const nodiRiga = new Map();

  const tornaAlCanto = () => {
    const q = setlistId ? `?sl=${setlistId}` : '';
    navigate(`#/canto/${encodeURIComponent(song.id)}${q}`);
  };
  const modificato = () => firma() !== iniziale;

  // ------------------------------------------------------------ barra in alto
  const frecce = el('div', { class: 'cm-nudge', hidden: true }, [
    el('button', { class: 'btn small', type: 'button', html: '&#9664;&nbsp; parola prima', onclick: () => sposta(-1) }),
    el('button', { class: 'btn small', type: 'button', html: 'parola dopo&nbsp; &#9654;', onclick: () => sposta(1) }),
    el('button', { class: 'btn small ghost', type: 'button', text: 'Fatto', onclick: () => seleziona(null) }),
  ]);

  root.append(el('div', { class: 'cm-bar' }, [
    el('div', { class: 'cm-bar-top' }, [
      el('button', {
        class: 'btn ghost', type: 'button', text: 'Annulla',
        onclick: async () => {
          if (modificato() && !(await confirmDialog('Lasciare le modifiche?', 'Gli spostamenti fatti finora andranno persi.', { danger: true, okLabel: 'Lascia' }))) return;
          tornaAlCanto();
        },
      }),
      el('div', { class: 'cm-title' }, [
        el('strong', { text: 'Sposta gli accordi' }),
        el('span', { text: song.title }),
      ]),
      el('button', { class: 'btn primary', type: 'button', text: 'Salva', onclick: salva }),
    ]),
    el('p', {
      class: 'cm-hint',
      text: 'Trascina un accordo sulla parola giusta, oppure toccalo e poi tocca la parola. Il testo non cambia.',
    }),
    frecce,
  ]));

  // ----------------------------------------------------------------- corpo
  const corpo = el('div', { class: 'cm-body song-body' });
  for (const sec of sezioni) {
    const box = el('div', { class: `song-section ${sec.label === 'rit' ? 'rit' : ''}`.trim() });
    if (sec.label === 'rit') box.append(el('span', { class: 'lbl', text: 'Ritornello' }));
    for (const r of sec.righe) {
      const nodo = el('div', { class: 'cm-line' });
      nodiRiga.set(r, nodo);
      disegnaRiga(r);
      box.append(nodo);
    }
    corpo.append(box);
  }
  root.append(corpo);

  function disegnaRiga(r) {
    const nodo = nodiRiga.get(r);
    clear(nodo);
    nodo.classList.toggle('instr', r.instr);
    const W = r.words.length;

    // per una riga di soli accordi non c'è una parola su cui spostarli
    if (r.instr || !W) {
      nodo.append(el('span', { class: 'cm-static', text: r.tokens.map((t) => nome(t.c)).join('  ') }));
      return;
    }

    const casella = (slot, testo, extra = '') => {
      const acc = r.tokens.filter((t) => t.slot === slot);
      const box = el('span', { class: `cm-word ${extra}`.trim(), dataset: { slot: String(slot) } }, [
        el('span', { class: 'cm-chips' }, acc.map((t) => el('button', {
          class: `cm-chip ${scelto && scelto.id === t.id ? 'sel' : ''}`.trim(), type: 'button',
          dataset: { id: t.id }, text: nome(t.c),
          'aria-label': `Accordo ${nome(t.c)}: trascinalo o toccalo per spostarlo`,
        }))),
        el('span', { class: 'cm-tx', text: testo }),
      ]);
      return box;
    };

    if (r.tokens.some((t) => t.slot < 0)) nodo.append(casella(-1, '·', 'cm-edge'));
    r.words.forEach((w, j) => {
      const fine = j + 1 < W ? r.words[j + 1].start : r.text.length;
      nodo.append(casella(j, r.text.slice(w.start, fine)));
    });
    nodo.append(casella(W, 'fine riga', 'cm-edge cm-end'));
  }

  // ---------------------------------------------------------- interazione
  function rigaDi(node) {
    const lineNode = node && node.closest('.cm-line');
    if (!lineNode) return null;
    for (const [r, n2] of nodiRiga) if (n2 === lineNode) return r;
    return null;
  }

  function token(r, id) {
    return r.tokens.find((t) => t.id === id);
  }

  function muovi(r, id, slot) {
    const t = token(r, id);
    if (!t) return;
    const max = r.words.length;
    t.slot = Math.max(-1, Math.min(max, slot));
    // in coda all'elenco: diventa l'ultimo accordo della parola di arrivo
    r.tokens = [...r.tokens.filter((x) => x !== t), t];
    disegnaRiga(r);
  }

  function seleziona(sel) {
    const prima = scelto;
    scelto = sel;
    frecce.hidden = !sel;
    if (prima && (!sel || prima.riga !== sel.riga)) disegnaRiga(prima.riga);
    if (sel) disegnaRiga(sel.riga);
  }

  function sposta(delta) {
    if (!scelto) return;
    const t = token(scelto.riga, scelto.id);
    if (t) muovi(scelto.riga, scelto.id, t.slot + delta);
  }

  // trascinamento con i pointer events: funzionano uguali con dito e mouse
  let drag = null;

  corpo.addEventListener('pointerdown', (e) => {
    const chip = e.target.closest('.cm-chip');
    if (!chip) return;
    e.preventDefault();
    chip.setPointerCapture(e.pointerId);
    drag = { chip, id: chip.dataset.id, riga: rigaDi(chip), x: e.clientX, y: e.clientY, moving: false, ghost: null, over: null };
  });

  corpo.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.moving && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
    if (!drag.moving) {
      drag.moving = true;
      drag.ghost = el('span', { class: 'cm-ghost', text: drag.chip.textContent });
      document.body.append(drag.ghost);
      drag.chip.classList.add('dragging');
    }
    drag.ghost.style.left = `${e.clientX}px`;
    drag.ghost.style.top = `${e.clientY}px`;
    const sotto = document.elementFromPoint(e.clientX, e.clientY);
    const parola = sotto && sotto.closest('.cm-word');
    const valida = parola && rigaDi(parola) === drag.riga ? parola : null;
    if (drag.over !== valida) {
      if (drag.over) drag.over.classList.remove('over');
      if (valida) valida.classList.add('over');
      drag.over = valida;
    }
  });

  const fine = (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.ghost) d.ghost.remove();
    d.chip.classList.remove('dragging');
    if (d.over) d.over.classList.remove('over');

    if (!d.moving) {
      // un tocco: seleziona (o deseleziona) l'accordo
      seleziona(scelto && scelto.id === d.id ? null : { riga: d.riga, id: d.id });
      return;
    }
    if (e.type === 'pointerup' && d.over) {
      muovi(d.riga, d.id, Number(d.over.dataset.slot));
      if (scelto && scelto.id === d.id) seleziona({ riga: d.riga, id: d.id });
    }
  };
  corpo.addEventListener('pointerup', fine);
  corpo.addEventListener('pointercancel', fine);

  // con un accordo selezionato, toccare una parola della stessa riga lo sposta lì
  corpo.addEventListener('click', (e) => {
    if (!scelto || e.target.closest('.cm-chip')) return;
    const parola = e.target.closest('.cm-word');
    if (!parola) return;
    if (rigaDi(parola) !== scelto.riga) {
      toast('Gli accordi si spostano dentro la stessa riga');
      return;
    }
    muovi(scelto.riga, scelto.id, Number(parola.dataset.slot));
  });

  // ------------------------------------------------------------------ salva
  function salva() {
    if (!modificato()) { tornaAlCanto(); return; }
    const sections = sezioni.map((sec, i) => ({
      ...song.sections[i],
      lines: sec.righe.map((r) => modelToLine(r)),
    }));
    store.patchSong(song.id, { sections });
    toast('Accordi salvati');
    tornaAlCanto();
  }
}
