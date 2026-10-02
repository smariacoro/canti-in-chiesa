// Vista di un canto: testo con accordi, trasposizione, zoom, tonalità di
// riferimento, metronomo, arrangiamento per organo, modifica.

import { el, clear, toast, modal, confirmDialog } from '../ui.js';
import { store, MOMENTS, SEASONS, momentLabel, seasonLabel } from '../store.js';
import { renderSongBody, songToText, textToSong } from '../render.js';
import { transposeCell, keyLabel, prefersFlat } from '../chords.js';
import { Metronome, TapTempo, playKey, stopKey, unlockAudio } from '../audio.js';
import { navigate, back } from '../router.js';
import { renderScore, organTemplate, singleStaffTemplate, ABC_LEGEND } from '../score.js';
import { normalizzaPennata, vuoto, compatto, conteggio, modelli, SEGNI, SIMBOLO, NOME } from '../rhythm.js';
import { sync, isConfigured } from '../sync.js';
import { chordMoveView } from './chordmove.js';

const metro = new Metronome(onBeat, onStep);
let beatDots = null;
let stepCells = null;
let wakeLock = null;

function onStep(i) {
  if (!stepCells) return;
  stepCells.forEach((c, k) => c.classList.toggle('now', k === i));
}

function onBeat(index, accent) {
  if (!beatDots) return;
  [...beatDots.children].forEach((d, i) => {
    d.classList.toggle('on', i === index);
    d.classList.toggle('accent', i === index && accent);
  });
}

export async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (e) { /* non supportato o negato: pazienza */ }
}

export function songView(root, params, id) {
  const song = store.song(id);
  clear(root);
  root.classList.remove('wide');
  metro.stop();
  stopKey();

  if (!song) {
    root.append(el('div', { class: 'empty' }, [
      el('strong', { text: 'Canto non trovato' }),
      el('button', { class: 'btn', type: 'button', text: 'Torna ai canti', onclick: () => navigate('#/canti'), style: 'margin-top:1rem' }),
    ]));
    return;
  }

  keepAwake(true);
  const transKey = `transpose.${song.id}`;
  let transpose = Number(store.prefs[transKey] || 0);
  let showChords = store.prefs.showChords !== false;

  const slId = params.get('sl');
  const setlist = slId ? store.setlist(slId) : null;

  if (params.get('sposta')) {
    chordMoveView(root, song, { transpose, setlistId: slId });
    return;
  }

  const repaint = () => songView(root, params, id);

  // ------------------------------------------------------------- intestazione
  const head = el('div', { class: 'song-head' }, [
    el('div', { style: 'display:flex;align-items:flex-start;gap:.4rem' }, [
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Indietro', html: '&#8592;', onclick: () => back('#/canti') }),
      el('h2', { text: song.title, style: 'flex:1;padding-top:.35rem' }),
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Altre azioni', html: '&#8942;', onclick: () => menu(song, repaint, transpose, { apriRitmo: () => ritmo.apri(), slId }) }),
    ]),
  ]);

  const meta = el('div', { class: 'song-meta' });

  // tonalità: toccandola si sente l'accordo per intonare
  const shownKey = song.key ? transposeCell(song.key, transpose, prefersFlat(song.key)) : null;
  meta.append(el('button', {
    class: 'pill', type: 'button',
    title: shownKey ? `Ascolta ${keyLabel(shownKey)}` : 'Imposta la tonalità',
    onclick: () => {
      unlockAudio();
      if (!shownKey) { editSong(song, repaint); return; }
      if (playKey(shownKey)) toast(`Tonalità: ${keyLabel(shownKey)}`);
    },
  }, [
    el('span', { class: 'k', html: '&#9834;' }),
    el('span', { text: shownKey || 'tonalità' }),
  ]));

  // bpm: toccandolo parte il ritmo (clic, più la pennata se impostata);
  // se la velocità manca si apre il pannello per impostarla
  const bpmPill = el('button', { class: 'pill', type: 'button' });
  const paintBpm = () => {
    const r = ritmo ? ritmo.stato : { bpm: song.bpm };
    clear(bpmPill);
    bpmPill.classList.toggle('active', metro.running);
    bpmPill.append(
      el('span', { class: 'k', html: metro.running ? '&#9632;' : '&#9654;' }),
      el('span', { text: r.bpm ? `${r.bpm} bpm` : 'bpm' }),
    );
  };
  bpmPill.addEventListener('click', () => {
    if (!ritmo.stato.bpm) { ritmo.apri(); return; }
    toggleRitmo();
  });
  meta.append(bpmPill);

  // ascolto su YouTube: il video salvato se c'è, altrimenti una ricerca già
  // impostata. È l'unica funzione che ha bisogno della rete, quindi senza
  // collegamento lo diciamo invece di far aprire una pagina di errore.
  meta.append(el('a', {
    class: `pill ${navigator.onLine ? '' : 'offline'}`.trim(),
    href: videoUrl(song), target: '_blank', rel: 'noopener',
    title: song.video ? 'Ascolta il canto su YouTube' : 'Cerca il canto su YouTube',
    onclick: (e) => {
      if (navigator.onLine) return;
      e.preventDefault();
      e.currentTarget.classList.add('offline');
      toast('Per ascoltare il canto serve internet. Il testo e gli accordi restano disponibili.', 4000);
    },
    html: `<span class="k">&#9654;&#xFE0E;</span><span>${song.video ? 'Ascolta' : 'Cerca'}</span>`,
  }));

  for (const m of song.moments) meta.append(el('span', { class: 'pill tag', text: momentLabel(m) }));
  for (const s of song.seasons) meta.append(el('span', { class: 'pill tag', text: seasonLabel(s) }));
  if (song.capo) meta.append(el('span', { class: 'pill tag', text: `capotasto ${song.capo}` }));

  head.append(meta);
  root.append(head);

  // ------------------------------------------------------------------ toolbar
  const toolbar = el('div', { class: 'toolbar' });

  toolbar.append(stepper(
    'Trasporta di un semitono',
    () => (transpose > 0 ? `+${transpose}` : String(transpose)),
    (delta) => {
      transpose = Math.max(-11, Math.min(11, transpose + delta));
      store.setPref(transKey, transpose);
      repaint();
    },
    () => { transpose = 0; store.setPref(transKey, 0); repaint(); },
  ));

  toolbar.append(stepper(
    'Dimensione del testo',
    () => `${Math.round(store.prefs.songScale * 100)}%`,
    (delta) => {
      const v = Math.max(0.7, Math.min(2.6, +(store.prefs.songScale + delta * 0.1).toFixed(2)));
      store.setPref('songScale', v);
      document.documentElement.style.setProperty('--song-scale', v);
      body.style.fontSize = `calc(1rem * ${v})`;
    },
    () => {
      store.setPref('songScale', 1);
      document.documentElement.style.setProperty('--song-scale', 1);
      body.style.fontSize = 'calc(1rem * 1)';
    },
    'Aa',
  ));

  toolbar.append(el('button', {
    class: `pill ${showChords ? 'active' : ''}`, type: 'button',
    text: 'Accordi',
    'aria-pressed': showChords ? 'true' : 'false',
    onclick: (e) => {
      showChords = !showChords;
      store.setPref('showChords', showChords);
      body.classList.toggle('no-chords', !showChords);
      e.currentTarget.classList.toggle('active', showChords);
      e.currentTarget.setAttribute('aria-pressed', showChords ? 'true' : 'false');
    },
  }));

  toolbar.append(el('button', {
    class: 'pill', type: 'button',
    html: '&#127929; Organo',
    title: 'Arrangiamento per organo',
    onclick: () => organModal(song, repaint, transpose),
  }));

  const metroBox = el('div', { class: 'metro', style: 'width:100%' });
  const paintMetro = () => {
    clear(metroBox);
    if (!metro.running) { beatDots = null; return; }
    const r = ritmo.stato;
    beatDots = el('div', { class: 'beat-dots' });
    for (let i = 0; i < r.meter; i++) beatDots.append(el('span', { class: 'beat-dot' }));
    metroBox.append(
      beatDots,
      el('span', { style: 'font-size:.8rem;color:var(--ink-soft)', text: `${r.bpm} bpm · ${r.meter}/4` }),
      el('button', { class: 'btn small ghost', type: 'button', text: 'Ferma', onclick: () => toggleRitmo(false) }),
    );
  };
  toolbar.append(metroBox);
  root.append(toolbar);

  // ---------------------------------------------------------------- ritmo
  function toggleRitmo(accendi = !metro.running) {
    unlockAudio();
    const r = ritmo.stato;
    if (!accendi || !r.bpm) metro.stop();
    else metro.start(r.bpm, r.meter, vuoto(r.strum) ? null : r.strum);
    paintBpm();
    paintMetro();
    ritmo.paintPlay();
  }
  const ritmo = rhythmPanel(song, {
    onChange: () => { paintBpm(); if (metro.running) paintMetro(); },
    onToggle: () => toggleRitmo(),
  });
  root.append(ritmo.el);
  paintBpm();

  // --------------------------------------------------------------------- corpo
  const body = renderSongBody(song, { transpose, showChords });
  root.append(body);

  if (song.notes) {
    root.append(el('div', {
      class: 'card',
      style: 'padding:.8rem;margin-top:1rem;font-size:.9rem;color:var(--ink-soft);white-space:pre-wrap',
      text: song.notes,
    }));
  }

  // ------------------------------------------------- navigazione nella scaletta
  if (setlist) {
    const idx = setlist.items.findIndex((i) => i.songId === song.id);
    if (idx >= 0) {
      const prev = setlist.items[idx - 1];
      const next = setlist.items[idx + 1];
      const go = (item) => navigate(`#/canto/${encodeURIComponent(item.songId)}?sl=${setlist.id}`);
      root.append(el('div', { style: 'display:flex;gap:.5rem;margin-top:1.5rem;align-items:center' }, [
        prev ? el('button', { class: 'btn', type: 'button', html: '&#8592; Precedente', onclick: () => go(prev) }) : el('span', { style: 'flex:1' }),
        el('button', {
          class: 'btn ghost', type: 'button', style: 'flex:1',
          text: `${idx + 1} di ${setlist.items.length}`,
          onclick: () => navigate(`#/scaletta/${setlist.id}`),
        }),
        next ? el('button', { class: 'btn', type: 'button', html: 'Successivo &#8594;', onclick: () => go(next) }) : el('span', { style: 'flex:1' }),
      ]));
    }
  }
}

/**
 * Indirizzo per ascoltare il canto. Se nessuno ha ancora salvato un video si
 * apre una ricerca YouTube già impostata: funziona da subito su tutti gli 82
 * canti, senza dover incollare link a mano uno per uno.
 */
export function videoUrl(song) {
  if (song.video) return song.video;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${song.title} canto liturgico`)}`;
}

/** Accetta un link completo, un link breve o il solo codice del video. */
function normalizeVideo(input) {
  const v = String(input || '').trim();
  if (!v) return null;
  if (/^[\w-]{11}$/.test(v)) return `https://www.youtube.com/watch?v=${v}`;
  if (/^https?:\/\//i.test(v)) return v;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(v)}`;
}

export function leaveSong() {
  metro.stop();
  stopKey();
  beatDots = null;
  stepCells = null;
  keepAwake(false);
}

// ------------------------------------------------------------------ controlli

function stepper(title, value, onDelta, onReset, prefix = '') {
  const val = el('span', { class: 'val' });
  const paint = () => { val.textContent = (prefix ? `${prefix} ` : '') + value(); };
  paint();
  val.addEventListener('click', () => { onReset(); paint(); });
  return el('div', { class: 'stepper', title }, [
    el('button', { type: 'button', text: '−', 'aria-label': `${title}: diminuisci`, onclick: () => { onDelta(-1); paint(); } }),
    val,
    el('button', { type: 'button', text: '+', 'aria-label': `${title}: aumenta`, onclick: () => { onDelta(1); paint(); } }),
  ]);
}

// ------------------------------------------------------------ pannello ritmo
//
// Velocità, tempo e pennata della chitarra. Le modifiche finiscono sul canto,
// che si sincronizza per intero: chi le imposta le passa a tutto il coro.

const BPM_MIN = 30;
const BPM_MAX = 240;

function rhythmPanel(song, { onChange, onToggle }) {
  const stato = {
    bpm: song.bpm || null,
    meter: song.meter || 4,
    strum: song.strum ? normalizzaPennata(song.strum, song.meter || 4) : null,
  };
  const tap = new TapTempo();
  let timer = null;

  const salva = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const patch = {
        bpm: stato.bpm,
        meter: stato.meter,
        strum: vuoto(stato.strum) ? null : stato.strum,
      };
      store.patchSong(song.id, patch);
      // le altre azioni della pagina leggono `song`: va tenuto allineato
      Object.assign(song, patch);
    }, 500);
  };

  const card = el('section', { class: 'rhythm card' });
  const summary = el('span', { class: 'rhythm-sum' });
  const head = el('button', {
    class: 'rhythm-head', type: 'button',
    onclick: () => setAperto(body.hidden),
  }, [
    el('span', { class: 'rhythm-title', text: 'Ritmo' }),
    summary,
    el('span', { class: 'rhythm-chev', 'aria-hidden': 'true', html: '&#9662;' }),
  ]);
  const body = el('div', { class: 'rhythm-body' });
  card.append(head, body);

  function setAperto(aperto) {
    body.hidden = !aperto;
    head.setAttribute('aria-expanded', aperto ? 'true' : 'false');
    card.classList.toggle('open', aperto);
    store.setPref('rhythmOpen', aperto);
  }

  function paintSummary() {
    const parti = [
      stato.bpm ? `${stato.bpm} bpm` : 'velocità da impostare',
      `${stato.meter}/4`,
      compatto(stato.strum, stato.meter) || 'pennata da impostare',
    ];
    summary.textContent = parti.join(' · ');
  }

  // --- velocità: − / + con pressione prolungata, più il tap ---
  const valore = el('span', { class: 'rhythm-bpm' });
  const hint = el('span', { class: 'rhythm-hint' });
  const paintBpmVal = () => {
    valore.textContent = stato.bpm ? String(stato.bpm) : '–';
  };

  const setBpm = (v) => {
    stato.bpm = Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(v)));
    if (metro.running) metro.setBpm(stato.bpm);
    paintBpmVal();
    paintSummary();
    paintPlay();
    onChange();
    salva();
  };
  const passo = (delta) => setBpm((stato.bpm || 80) + delta);

  const tasto = (segno, delta) => {
    let attesa = null;
    let ripeti = null;
    const ferma = () => { clearTimeout(attesa); clearInterval(ripeti); };
    return el('button', {
      class: 'btn rhythm-step', type: 'button', text: segno,
      'aria-label': delta > 0 ? 'Aumenta la velocità' : 'Diminuisci la velocità',
      onpointerdown: (e) => {
        e.preventDefault();
        passo(delta);
        // tenendo premuto accelera, così da 70 a 100 non servono trenta tocchi
        attesa = setTimeout(() => { ripeti = setInterval(() => passo(delta), 70); }, 420);
      },
      onpointerup: ferma,
      onpointerleave: ferma,
      onpointercancel: ferma,
      onclick: (e) => { if (e.detail === 0) passo(delta); },   // tastiera
    });
  };

  const batti = el('button', {
    class: 'btn rhythm-tap', type: 'button', text: 'Batti il tempo',
    onclick: () => {
      unlockAudio();
      const v = tap.tap();
      if (v) { setBpm(v); hint.textContent = 'continua a battere per affinare'; }
      else hint.textContent = tap.count < 3 ? `ancora ${3 - tap.count}…` : '';
    },
  });

  // --- tempo ---
  const tempi = el('div', { class: 'chips' });
  const paintTempi = () => {
    clear(tempi);
    for (const m of [2, 3, 4, 6]) {
      tempi.append(el('button', {
        class: 'chip', type: 'button', text: `${m}/4`,
        'aria-pressed': stato.meter === m ? 'true' : 'false',
        onclick: () => {
          if (stato.meter === m) return;
          stato.meter = m;
          if (stato.strum) stato.strum = normalizzaPennata(stato.strum, m);
          paintTempi(); paintGriglia(); paintModelli(); paintSummary(); onChange(); salva();
          if (metro.running) onToggle(), onToggle();
        },
      }));
    }
  };

  // --- pennata ---
  const griglia = el('div', { class: 'strum' });
  const paintGriglia = () => {
    clear(griglia);
    const p = normalizzaPennata(stato.strum, stato.meter);
    const etichette = conteggio(stato.meter);
    stepCells = [];
    [...p].forEach((segno, i) => {
      const cella = el('button', {
        class: `strum-cell ${i % 2 === 0 ? 'beat' : ''} s-${segno === '-' ? 'rest' : segno}`, type: 'button',
        'aria-label': `${etichette[i]}: ${NOME[segno]}. Tocca per cambiare`,
        onclick: () => {
          const ora = normalizzaPennata(stato.strum, stato.meter);
          const prossimo = SEGNI[(SEGNI.indexOf(ora[i]) + 1) % SEGNI.length];
          stato.strum = ora.slice(0, i) + prossimo + ora.slice(i + 1);
          if (metro.running) metro.setPattern(vuoto(stato.strum) ? null : stato.strum);
          paintGriglia(); paintModelli(); paintSummary(); salva();
        },
      }, [
        el('span', { class: 'strum-sym', text: SIMBOLO[segno] }),
        el('span', { class: 'strum-count', text: etichette[i] }),
      ]);
      stepCells.push(cella);
      griglia.append(cella);
    });
  };

  const modelliBox = el('div', { class: 'chips' });
  const paintModelli = () => {
    clear(modelliBox);
    for (const m of modelli(stato.meter)) {
      modelliBox.append(el('button', {
        class: 'chip', type: 'button', text: m.nome,
        'aria-pressed': stato.strum === m.p ? 'true' : 'false',
        onclick: () => {
          stato.strum = m.p;
          if (metro.running) metro.setPattern(stato.strum);
          paintGriglia(); paintModelli(); paintSummary(); salva();
        },
      }));
    }
    if (!vuoto(stato.strum)) {
      modelliBox.append(el('button', {
        class: 'chip', type: 'button', text: 'Svuota',
        onclick: () => {
          stato.strum = null;
          if (metro.running) metro.setPattern(null);
          paintGriglia(); paintModelli(); paintSummary(); salva();
        },
      }));
    }
  };

  // --- prova ---
  const prova = el('button', { class: 'btn primary rhythm-play', type: 'button', onclick: () => onToggle() });
  function paintPlay() {
    prova.disabled = !stato.bpm;
    prova.innerHTML = metro.running ? '&#9632;&nbsp; Ferma' : '&#9654;&#xFE0E;&nbsp; Prova il ritmo';
    prova.title = stato.bpm ? '' : 'Prima imposta la velocità';
  }

  const nota = el('p', {
    class: 'rhythm-note',
    text: isConfigured() && sync.signedIn
      ? 'Le modifiche si salvano da sole e arrivano a tutto il coro.'
      : 'Le modifiche si salvano da sole su questo dispositivo. Con l’accesso arrivano anche agli altri.',
  });

  body.append(
    el('div', { class: 'rhythm-row' }, [
      el('span', { class: 'rhythm-label', text: 'Velocità' }),
      el('div', { class: 'rhythm-speed' }, [
        tasto('−', -1),
        el('div', { class: 'rhythm-bpmbox' }, [valore, el('span', { class: 'rhythm-unit', text: 'bpm' })]),
        tasto('+', 1),
        batti,
      ]),
      hint,
    ]),
    el('div', { class: 'rhythm-row' }, [
      el('span', { class: 'rhythm-label', text: 'Tempo' }),
      tempi,
    ]),
    el('div', { class: 'rhythm-row' }, [
      el('span', { class: 'rhythm-label', text: 'Pennata della chitarra' }),
      griglia,
      el('p', { class: 'rhythm-legend', text: '↓ giù, ↑ su, × stoppata, · pausa. Tocca una casella per cambiarla.' }),
      modelliBox,
    ]),
    el('div', { class: 'rhythm-row rhythm-actions' }, [prova]),
    nota,
  );

  paintBpmVal(); paintTempi(); paintGriglia(); paintModelli(); paintSummary(); paintPlay();
  setAperto(Boolean(store.prefs.rhythmOpen));

  return {
    el: card,
    stato,
    paintPlay,
    apri: () => { setAperto(true); card.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  };
}

// --------------------------------------------------------------------- azioni

function menu(song, repaint, transpose = 0, { apriRitmo = null, slId = null } = {}) {
  modal(song.title, (close) => {
    const item = (label, icon, fn, cls = '') => el('button', {
      class: `btn ${cls}`, type: 'button', style: 'width:100%;justify-content:flex-start',
      html: `${icon}&nbsp;&nbsp;${label}`,
      onclick: () => { close(); fn(); },
    });
    const rows = [
      item('Modifica canto', '&#9998;', () => editSong(song, repaint)),
      item('Arrangiamento per organo', '&#127929;', () => organModal(song, repaint, transpose)),
      item('Aggiungi a una scaletta', '&#128197;', () => addToSetlistDialog(song)),
      item(song.video ? 'Ascolta il canto' : 'Cerca il canto su YouTube', '&#9654;&#xFE0E;', () => {
        if (!navigator.onLine) { toast('Per ascoltare il canto serve internet.', 4000); return; }
        window.open(videoUrl(song), '_blank', 'noopener');
      }),
      item(song.video ? 'Cambia il link del video' : 'Salva il link di un video', '&#128279;',
        () => videoDialog(song, repaint)),
      item('Sposta gli accordi', '&#8596;', () => {
        const q = new URLSearchParams({ sposta: '1' });
        if (slId) q.set('sl', slId);
        navigate(`#/canto/${encodeURIComponent(song.id)}?${q}`);
      }),
      apriRitmo ? item('Ritmo e velocità', '&#9833;', apriRitmo) : null,
      item('Stampa questo canto', '&#128424;&#xFE0F;', () => navigate(`#/stampa?canto=${encodeURIComponent(song.id)}`)),
    ];
    if (store.isModified(song.id)) {
      rows.push(item('Ripristina la versione originale', '&#8634;', async () => {
        if (await confirmDialog('Ripristinare?', 'Le modifiche fatte a questo canto verranno perse.', { danger: true, okLabel: 'Ripristina' })) {
          store.resetSong(song.id);
          toast('Canto ripristinato');
          repaint();
        }
      }, 'danger'));
    } else if (song.custom) {
      rows.push(item('Elimina canto', '&#128465;&#xFE0F;', async () => {
        if (await confirmDialog('Eliminare?', `"${song.title}" verrà rimosso.`, { danger: true, okLabel: 'Elimina' })) {
          store.deleteSong(song.id);
          toast('Canto eliminato');
          navigate('#/canti');
        }
      }, 'danger'));
    }
    return el('div', { style: 'display:flex;flex-direction:column;gap:.4rem' }, rows.filter(Boolean));
  });
}

/** Salva il link del video, così il coro trova sempre la stessa versione. */
function videoDialog(song, repaint) {
  modal('Video del canto', (close) => {
    const input = el('input', {
      class: 'input', type: 'url', inputmode: 'url', spellcheck: 'false',
      value: song.video || '', placeholder: 'Incolla qui il link di YouTube',
    });
    return el('div', {}, [
      el('p', {
        style: 'color:var(--ink-soft);font-size:.9rem;margin-bottom:.8rem',
        text: 'Cerca su YouTube la versione che cantate voi e incolla qui il suo indirizzo: da quel momento il pulsante «Ascolta» porterà tutto il coro a quella, invece che a una ricerca generica.',
      }),
      el('label', { class: 'field' }, [el('span', { text: 'Indirizzo del video' }), input]),
      el('div', { class: 'modal-foot' }, [
        song.video ? el('button', {
          class: 'btn danger', type: 'button', text: 'Togli',
          onclick: () => { store.patchSong(song.id, { video: null }); close(); toast('Link rimosso'); repaint(); },
        }) : null,
        el('button', { class: 'btn ghost', type: 'button', text: 'Annulla', onclick: () => close() }),
        el('button', {
          class: 'btn primary', type: 'button', text: 'Salva',
          onclick: () => {
            store.patchSong(song.id, { video: normalizeVideo(input.value) });
            close();
            toast('Link salvato');
            repaint();
          },
        }),
      ]),
    ]);
  });
}

async function addToSetlistDialog(song) {
  const lists = store.setlists;
  const chosen = await modal('Aggiungi a una scaletta', (close) => el('div', {}, [
    lists.length
      ? el('div', { style: 'display:flex;flex-direction:column;gap:.4rem' }, lists.slice(0, 12).map((sl) => el('button', {
        class: 'btn', type: 'button', style: 'width:100%;justify-content:flex-start',
        text: `${sl.date} · ${sl.title || 'Scaletta'}`,
        onclick: () => close(sl.id),
      })))
      : el('p', { style: 'color:var(--ink-faint)', text: 'Non hai ancora nessuna scaletta.' }),
    el('div', { class: 'modal-foot' }, [
      el('button', { class: 'btn', type: 'button', text: 'Nuova scaletta', onclick: () => close('__new__') }),
    ]),
  ]));

  if (!chosen) return;
  if (chosen === '__new__') { navigate('#/scalette?nuova=1'); return; }

  const sl = store.setlist(chosen);
  if (!sl) return;
  const moment = song.moments[0] || null;
  store.saveSetlist({ ...sl, items: [...sl.items, { songId: song.id, moment, note: '' }] });
  toast('Aggiunto alla scaletta');
}

// ---------------------------------------------------------------- organo

function organModal(song, repaint, transpose = 0) {
  modal(`Organo · ${song.title}`, (close) => {
    const organ = song.organ;
    const view = el('div');
    const has = organ && (organ.text || organ.registration || organ.abc);

    if (has) {
      if (organ.registration) {
        view.append(el('div', { class: 'field' }, [
          el('span', { text: 'Registrazione' }),
          el('div', { style: 'font-weight:600', text: organ.registration }),
        ]));
      }
      if (organ.abc) {
        const box = el('div', { class: 'score' });
        view.append(el('div', { class: 'field' }, [
          el('span', { text: transpose ? `Spartito · trasportato di ${transpose > 0 ? '+' : ''}${transpose}` : 'Spartito' }),
          box,
        ]));
        renderScore(box, organ.abc, { transpose });
      }
      if (organ.text) {
        view.append(el('div', { class: 'field' }, [
          el('span', { text: 'Note' }),
          el('div', { class: 'organ-body', text: organ.text }),
        ]));
      }
    } else {
      view.append(el('div', { class: 'empty' }, [
        el('strong', { text: 'Nessun arrangiamento per organo' }),
        el('span', { text: 'Qui puoi scrivere lo spartito, la registrazione e le note per l’organista.' }),
      ]));
    }

    view.append(el('div', { class: 'modal-foot' }, [
      el('button', { class: 'btn ghost', type: 'button', text: 'Chiudi', onclick: () => close() }),
      el('button', {
        class: 'btn primary', type: 'button', text: has ? 'Modifica' : 'Aggiungi',
        onclick: () => { close(); editOrgan(song, repaint, transpose); },
      }),
    ]));
    return view;
  }, { wide: true });
}

function editOrgan(song, repaint, transpose = 0) {
  const organ = song.organ || {};
  modal(`Organo · ${song.title}`, (close) => {
    const reg = el('input', { class: 'input', value: organ.registration || '', placeholder: 'es. Principale 8’ + Flauto 4’' });
    const abc = el('textarea', {
      class: 'input', style: 'min-height:11rem', spellcheck: 'false',
      placeholder: 'Scrivi qui lo spartito in notazione ABC, oppure premi «Inserisci modello».',
      value: organ.abc || '',
    });
    const txt = el('textarea', {
      class: 'input', style: 'min-height:6rem',
      placeholder: 'Registrazione dei tempi, indicazioni per l’organista, appunti…',
      value: organ.text || '',
    });

    const preview = el('div', { class: 'score' });
    const status = el('p', { style: 'font-size:.8rem;color:var(--ink-faint);min-height:1.1rem' });

    let timer = null;
    const draw = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (!abc.value.trim()) { preview.replaceChildren(); status.textContent = ''; return; }
        status.textContent = 'Disegno lo spartito…';
        const r = await renderScore(preview, abc.value, { transpose });
        status.textContent = r.ok ? 'Spartito aggiornato.' : '';
      }, 350);
    };
    abc.addEventListener('input', draw);
    draw();

    const legend = el('div', {
      style: 'display:flex;flex-wrap:wrap;gap:.35rem;margin-bottom:.5rem',
    }, ABC_LEGEND.map(([it, en]) => el('span', {
      class: 'pill tag', style: 'font-size:.78rem;min-height:1.9rem',
      text: `${it} = ${en}`,
    })));

    return el('div', {}, [
      el('label', { class: 'field' }, [el('span', { text: 'Registrazione' }), reg]),

      el('div', { class: 'field' }, [
        el('span', { text: 'Spartito (notazione ABC)' }),
        legend,
        el('p', {
          style: 'font-size:.83rem;color:var(--ink-soft);margin-bottom:.5rem',
          text: 'Le note si scrivono con le lettere inglesi. Maiuscola = ottava centrale, minuscola = ottava sopra, la virgola dopo la nota la abbassa di un’ottava. Il numero dopo la nota ne allunga la durata (G2), la barra | separa le battute.',
        }),
        el('div', { class: 'btn-row', style: 'margin-bottom:.5rem' }, [
          el('button', {
            class: 'btn small', type: 'button', text: 'Inserisci modello per organo',
            onclick: () => { abc.value = organTemplate(song); draw(); },
          }),
          el('button', {
            class: 'btn small ghost', type: 'button', text: 'Modello a un rigo',
            onclick: () => { abc.value = singleStaffTemplate(song); draw(); },
          }),
        ]),
        abc,
        status,
        preview,
      ]),

      el('label', { class: 'field' }, [el('span', { text: 'Note per l’organista' }), txt]),

      el('div', { class: 'modal-foot' }, [
        organ.text || organ.registration || organ.abc
          ? el('button', {
            class: 'btn danger', type: 'button', text: 'Elimina',
            onclick: () => { store.patchSong(song.id, { organ: null }); close(); toast('Arrangiamento eliminato'); repaint(); },
          })
          : null,
        el('button', { class: 'btn ghost', type: 'button', text: 'Annulla', onclick: () => close() }),
        el('button', {
          class: 'btn primary', type: 'button', text: 'Salva',
          onclick: () => {
            const value = (reg.value.trim() || txt.value.trim() || abc.value.trim())
              ? {
                registration: reg.value.trim(),
                abc: abc.value.replace(/\s+$/, ''),
                text: txt.value.replace(/\s+$/, ''),
              }
              : null;
            store.patchSong(song.id, { organ: value });
            close();
            toast('Arrangiamento salvato');
            repaint();
          },
        }),
      ]),
    ]);
  }, { wide: true });
}

// ------------------------------------------------------------- modifica canto

export function editSong(song, repaint) {
  modal(song.id ? 'Modifica canto' : 'Nuovo canto', (close) => {
    const title = el('input', { class: 'input', value: song.title || '', placeholder: 'Titolo del canto' });
    const key = el('input', { class: 'input', value: song.key || '', placeholder: 'es. SOL, LAm, MIb' });
    const bpm = el('input', { class: 'input', type: 'number', inputmode: 'numeric', min: '30', max: '260', value: song.bpm || '', placeholder: '—' });
    const meter = el('select', { class: 'input' }, [2, 3, 4, 6].map((n) => el('option', { value: String(n), text: `${n}/4`, selected: (song.meter || 4) === n })));
    const capo = el('input', { class: 'input', type: 'number', inputmode: 'numeric', min: '0', max: '11', value: song.capo || 0 });
    const notes = el('textarea', { class: 'input', style: 'min-height:4rem;font-family:inherit', value: song.notes || '', placeholder: 'Note per il coro' });
    const video = el('input', { class: 'input', type: 'url', inputmode: 'url', spellcheck: 'false', value: song.video || '', placeholder: 'Link YouTube (facoltativo)' });
    const text = el('textarea', { class: 'input', style: 'min-height:16rem', value: songToText(song) });

    const momentBoxes = MOMENTS.map((m) => {
      const cb = el('input', { type: 'checkbox', class: 'pick', checked: (song.moments || []).includes(m.id) });
      return { id: m.id, cb, node: el('label', { style: 'display:flex;align-items:center;gap:.5rem;min-height:2.4rem' }, [cb, m.label]) };
    });
    const seasonBoxes = SEASONS.map((s) => {
      const cb = el('input', { type: 'checkbox', class: 'pick', checked: (song.seasons || []).includes(s.id) });
      return { id: s.id, cb, node: el('label', { style: 'display:flex;align-items:center;gap:.5rem;min-height:2.4rem' }, [cb, s.label]) };
    });

    const grid = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));gap:.4rem .8rem';

    return el('div', {}, [
      el('label', { class: 'field' }, [el('span', { text: 'Titolo' }), title]),
      el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(6rem,1fr));gap:.6rem' }, [
        el('label', { class: 'field' }, [el('span', { text: 'Tonalità' }), key]),
        el('label', { class: 'field' }, [el('span', { text: 'BPM' }), bpm]),
        el('label', { class: 'field' }, [el('span', { text: 'Tempo' }), meter]),
        el('label', { class: 'field' }, [el('span', { text: 'Capotasto' }), capo]),
      ]),
      el('div', { class: 'field' }, [el('span', { text: 'Momenti della messa' }), el('div', { style: grid }, momentBoxes.map((b) => b.node))]),
      el('div', { class: 'field' }, [el('span', { text: 'Tempo liturgico' }), el('div', { style: grid }, seasonBoxes.map((b) => b.node))]),
      el('label', { class: 'field' }, [el('span', { text: 'Video (YouTube)' }), video]),
      el('label', { class: 'field' }, [el('span', { text: 'Note' }), notes]),
      el('label', { class: 'field' }, [
        el('span', { text: 'Testo e accordi — gli accordi vanno sulla riga sopra, allineati alla sillaba. Usa [rit] per marcare il ritornello.' }),
        text,
      ]),
      el('div', { class: 'modal-foot' }, [
        el('button', { class: 'btn ghost', type: 'button', text: 'Annulla', onclick: () => close() }),
        el('button', {
          class: 'btn primary', type: 'button', text: 'Salva',
          onclick: () => {
            const t = title.value.trim();
            if (!t) { toast('Serve almeno il titolo'); title.focus(); return; }
            const updated = {
              ...song,
              title: t,
              key: key.value.trim() || null,
              bpm: bpm.value ? Number(bpm.value) : null,
              meter: Number(meter.value) || 4,
              capo: Number(capo.value) || 0,
              notes: notes.value.trim(),
              video: normalizeVideo(video.value),
              moments: momentBoxes.filter((b) => b.cb.checked).map((b) => b.id),
              seasons: seasonBoxes.filter((b) => b.cb.checked).map((b) => b.id),
              sections: textToSong(text.value),
            };
            if (song.id) store.saveSong(updated);
            else store.newSong(updated);
            close();
            toast('Canto salvato');
            if (repaint) repaint();
          },
        }),
      ]),
    ]);
  }, { wide: true });
}
