// Vista di un canto: testo con accordi, trasposizione, zoom, tonalità di
// riferimento, metronomo, arrangiamento per organo, modifica.

import { el, clear, toast, modal, confirmDialog } from '../ui.js';
import { store, MOMENTS, SEASONS, momentLabel, seasonLabel } from '../store.js';
import { renderSongBody, songToText, textToSong } from '../render.js';
import { transposeCell, keyLabel, prefersFlat } from '../chords.js';
import { Metronome, TapTempo, playKey, stopKey, unlockAudio } from '../audio.js';
import { navigate, back } from '../router.js';
import { renderScore, organTemplate, singleStaffTemplate, ABC_LEGEND } from '../score.js';

const metro = new Metronome(onBeat);
let beatDots = null;
let wakeLock = null;

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

  const repaint = () => songView(root, params, id);

  // ------------------------------------------------------------- intestazione
  const head = el('div', { class: 'song-head' }, [
    el('div', { style: 'display:flex;align-items:flex-start;gap:.4rem' }, [
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Indietro', html: '&#8592;', onclick: () => back('#/canti') }),
      el('h2', { text: song.title, style: 'flex:1;padding-top:.35rem' }),
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Altre azioni', html: '&#8942;', onclick: () => menu(song, repaint, transpose) }),
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

  // bpm: toccandolo parte il metronomo
  const bpmPill = el('button', { class: 'pill', type: 'button' });
  const paintBpm = () => {
    clear(bpmPill);
    bpmPill.classList.toggle('active', metro.running);
    bpmPill.append(
      el('span', { class: 'k', html: metro.running ? '&#9632;' : '&#9654;' }),
      el('span', { text: song.bpm ? `${song.bpm} bpm` : 'bpm' }),
    );
  };
  bpmPill.addEventListener('click', () => {
    unlockAudio();
    if (!song.bpm) { tapTempoDialog(song, repaint); return; }
    if (metro.running) { metro.stop(); beatDots = null; }
    else { metro.start(song.bpm, song.meter || 4); }
    paintBpm();
    paintMetro();
  });
  paintBpm();
  meta.append(bpmPill);

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
    beatDots = el('div', { class: 'beat-dots' });
    for (let i = 0; i < (song.meter || 4); i++) beatDots.append(el('span', { class: 'beat-dot' }));
    metroBox.append(
      beatDots,
      el('span', { style: 'font-size:.8rem;color:var(--ink-soft)', text: `${song.bpm} bpm · ${song.meter || 4}/4` }),
      el('button', { class: 'btn small ghost', type: 'button', text: 'Ferma', onclick: () => { metro.stop(); beatDots = null; paintBpm(); paintMetro(); } }),
    );
  };
  toolbar.append(metroBox);
  root.append(toolbar);

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

export function leaveSong() {
  metro.stop();
  stopKey();
  beatDots = null;
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

// --------------------------------------------------------------------- azioni

function menu(song, repaint, transpose = 0) {
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
      item('Batti il tempo (bpm)', '&#9201;', () => tapTempoDialog(song, repaint)),
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
    return el('div', { style: 'display:flex;flex-direction:column;gap:.4rem' }, rows);
  });
}

function tapTempoDialog(song, repaint) {
  const tap = new TapTempo();
  let bpm = song.bpm || null;
  modal('Batti il tempo', (close) => {
    const readout = el('div', {
      style: 'text-align:center;font-size:2.6rem;font-weight:700;line-height:1.1;margin:.5rem 0',
      text: bpm ? String(bpm) : '– –',
    });
    const hint = el('p', {
      style: 'text-align:center;color:var(--ink-faint);font-size:.85rem;margin-bottom:1rem',
      text: 'Tocca il pulsante a tempo con il canto, almeno tre volte.',
    });
    const padBtn = el('button', {
      class: 'btn primary', type: 'button',
      style: 'width:100%;min-height:7rem;font-size:1.1rem',
      text: 'BATTI',
      onclick: () => {
        unlockAudio();
        const v = tap.tap();
        if (v) { bpm = v; readout.textContent = String(v); }
        else readout.textContent = '·'.repeat(Math.max(1, tap.count));
      },
    });
    return el('div', {}, [
      readout, hint, padBtn,
      el('div', { class: 'modal-foot' }, [
        el('button', { class: 'btn ghost', type: 'button', text: 'Annulla', onclick: () => close() }),
        el('button', {
          class: 'btn primary', type: 'button', text: 'Salva',
          onclick: () => {
            if (bpm) { store.patchSong(song.id, { bpm }); toast(`${bpm} bpm salvati`); }
            close();
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
