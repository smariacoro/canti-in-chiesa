// Libretto stampabile: copertina, indice numerato e canti nello stesso ordine
// dell'app (momento della messa, poi titolo in ordine alfabetico).

import { el, clear, toast, formatDate } from '../ui.js';
import { store, MOMENTS, momentLabel, byTitle } from '../store.js';
import { renderSongBody } from '../render.js';
import { renderScore } from '../score.js';
import { PARISH_NAME } from '../../config.js';

const opts = {
  scope: 'tutti',      // tutti | scaletta | selezione
  setlistId: null,
  chords: true,
  twoCols: false,
  organ: false,
  cover: true,
  selection: new Set(),
};

export function printView(root, params) {
  clear(root);
  root.classList.add('wide');

  const slParam = params.get('scaletta');
  const songParam = params.get('canto');
  if (slParam) { opts.scope = 'scaletta'; opts.setlistId = slParam; }
  if (songParam) { opts.scope = 'selezione'; opts.selection = new Set([songParam]); }

  root.append(el('h2', { text: 'Stampa', style: 'font-size:1.2rem;margin-bottom:.2rem' }));
  root.append(el('p', {
    style: 'color:var(--ink-faint);font-size:.85rem;margin-bottom:1rem',
    text: 'Genera un libretto in formato A4 con copertina e indice. Dal riquadro di stampa del browser puoi anche salvarlo come PDF.',
  }));

  const body = el('div');
  root.append(body);

  function paint() {
    clear(body);

    // --- cosa stampare ---
    const scopes = [
      ['tutti', `Tutti i canti (${store.songs.length})`],
      ['scaletta', 'Una scaletta'],
      ['selezione', 'Solo i canti scelti'],
    ];
    body.append(el('div', { class: 'field' }, [
      el('span', { text: 'Cosa stampare' }),
      el('div', { class: 'chips' }, scopes.map(([id, label]) => el('button', {
        class: 'chip', type: 'button', text: label,
        'aria-pressed': opts.scope === id ? 'true' : 'false',
        onclick: () => { opts.scope = id; paint(); },
      }))),
    ]));

    if (opts.scope === 'scaletta') {
      const lists = store.setlists;
      if (!lists.length) {
        body.append(el('p', { class: 'empty', text: 'Non hai ancora nessuna scaletta.' }));
      } else {
        if (!opts.setlistId || !store.setlist(opts.setlistId)) opts.setlistId = lists[0].id;
        const sel = el('select', { class: 'input' }, lists.map((s) => el('option', {
          value: s.id, selected: s.id === opts.setlistId,
          text: `${s.date} · ${s.title || 'Messa'} (${s.items.length})`,
        })));
        sel.addEventListener('change', () => { opts.setlistId = sel.value; paint(); });
        body.append(el('label', { class: 'field' }, [el('span', { text: 'Scaletta' }), sel]));
      }
    }

    if (opts.scope === 'selezione') {
      const bar = el('div', { class: 'btn-row', style: 'margin-bottom:.5rem' }, [
        el('button', { class: 'btn small', type: 'button', text: 'Seleziona tutti', onclick: () => { store.songs.forEach((s) => opts.selection.add(s.id)); paint(); } }),
        el('button', { class: 'btn small ghost', type: 'button', text: 'Deseleziona tutti', onclick: () => { opts.selection.clear(); paint(); } }),
        el('span', { style: 'align-self:center;color:var(--ink-faint);font-size:.85rem', text: `${opts.selection.size} scelti` }),
      ]);
      body.append(bar);
      const box = el('div', { class: 'card', style: 'max-height:45vh;overflow:auto;padding:.2rem .5rem' });
      for (const m of MOMENTS) {
        const songs = store.byMoment(m.id);
        if (!songs.length) continue;
        box.append(el('div', { class: 'section-title', style: 'margin:.7rem .2rem .2rem' }, [el('span', { text: m.label })]));
        for (const s of songs) {
          const cb = el('input', {
            type: 'checkbox', class: 'pick', checked: opts.selection.has(s.id),
            onchange: (e) => {
              if (e.target.checked) opts.selection.add(s.id); else opts.selection.delete(s.id);
              bar.lastChild.textContent = `${opts.selection.size} scelti`;
            },
          });
          box.append(el('label', { class: 'song-row', style: 'cursor:pointer' }, [
            cb,
            el('div', { class: 'grow' }, [el('div', { class: 't', text: s.title })]),
            s.key ? el('span', { class: 'badge-key', text: s.key }) : null,
          ]));
        }
      }
      body.append(box);
    }

    // --- opzioni ---
    const toggle = (label, key) => el('button', {
      class: 'chip', type: 'button', text: label,
      'aria-pressed': opts[key] ? 'true' : 'false',
      onclick: (e) => {
        opts[key] = !opts[key];
        e.currentTarget.setAttribute('aria-pressed', opts[key] ? 'true' : 'false');
      },
    });
    body.append(el('div', { class: 'field', style: 'margin-top:1rem' }, [
      el('span', { text: 'Opzioni' }),
      el('div', { class: 'chips' }, [
        toggle('Accordi', 'chords'),
        toggle('Due colonne', 'twoCols'),
        toggle('Parte per organo', 'organ'),
        toggle('Copertina', 'cover'),
      ]),
    ]));

    const songs = selectedSongs();
    body.append(el('div', { class: 'btn-row', style: 'margin-top:1rem' }, [
      el('button', {
        class: 'btn primary', type: 'button', html: '&#128424;&#xFE0F;&nbsp; Stampa',
        onclick: () => doPrint(songs),
      }),
      el('span', {
        style: 'align-self:center;color:var(--ink-faint);font-size:.85rem',
        text: `${songs.length} cant${songs.length === 1 ? 'o' : 'i'}`,
      }),
    ]));

    // --- anteprima dell'indice ---
    if (songs.length) {
      const prev = el('div', { class: 'print-preview' });
      prev.append(el('div', { class: 'section-title', style: 'margin-top:0' }, [el('span', { text: 'Indice' })]));
      songs.forEach((s, i) => {
        prev.append(el('div', { style: 'display:flex;gap:.6rem;font-size:.88rem;padding:.15rem 0;border-bottom:1px dotted var(--line)' }, [
          el('span', { style: 'min-width:1.8rem;text-align:right;font-weight:700;color:var(--chord)', text: String(i + 1) }),
          el('span', { style: 'flex:1', text: s.title }),
          el('span', { style: 'color:var(--ink-faint);font-size:.8rem', text: s.key || '' }),
        ]));
      });
      body.append(prev);
    }
  }

  paint();
}

function selectedSongs() {
  if (opts.scope === 'scaletta') {
    const sl = store.setlist(opts.setlistId);
    if (!sl) return [];
    return sl.items.map((i) => store.song(i.songId)).filter(Boolean);
  }
  if (opts.scope === 'selezione') {
    return orderedCatalog().filter((s) => opts.selection.has(s.id));
  }
  return orderedCatalog();
}

/** Stesso ordinamento della lista: momento della messa, poi titolo. */
function orderedCatalog() {
  const out = [];
  const seen = new Set();
  for (const m of MOMENTS) {
    for (const s of store.byMoment(m.id).sort(byTitle)) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      out.push(s);
    }
  }
  for (const s of store.songs) if (!seen.has(s.id)) out.push(s);
  return out;
}

async function doPrint(songs) {
  if (!songs.length) { toast('Nessun canto da stampare'); return; }

  const old = document.querySelector('.print-doc');
  if (old) old.remove();

  const doc = el('div', { class: 'print-doc' });
  const sl = opts.scope === 'scaletta' ? store.setlist(opts.setlistId) : null;

  if (opts.cover) {
    doc.append(el('div', { class: 'print-cover' }, [
      el('img', { src: 'icons/logo.png', alt: '' }),
      el('h1', { text: 'Canti in Chiesa' }),
      el('p', { text: PARISH_NAME }),
      sl ? el('p', { style: 'margin-top:6mm;font-size:13pt', text: `${sl.title || 'Messa'} — ${formatDate(sl.date)}` }) : null,
      el('p', { style: 'margin-top:10mm;font-size:9pt', text: `${songs.length} canti · stampato il ${formatDate(new Date().toISOString().slice(0, 10), { weekday: false })}` }),
    ]));
  }

  // indice: numerato nell'ordine di stampa, raggruppato per momento
  const index = el('div', { class: `print-index ${songs.length > 20 ? 'two-col' : ''}`.trim() });
  index.append(el('h2', { text: 'Indice' }));

  const numbers = new Map(songs.map((s, i) => [s.id, i + 1]));
  if (sl) {
    const ol = el('ol');
    sl.items.forEach((item, i) => {
      const s = store.song(item.songId);
      if (!s) return;
      ol.append(indexRow(i + 1, s, item.moment ? momentLabel(item.moment) : ''));
    });
    index.append(ol);
  } else {
    for (const m of MOMENTS) {
      const group = songs.filter((s) => s.moments.includes(m.id));
      if (!group.length) continue;
      index.append(el('h3', { text: m.label }));
      const ol = el('ol');
      for (const s of group) ol.append(indexRow(numbers.get(s.id), s, s.key || ''));
      index.append(ol);
    }
    const orphans = songs.filter((s) => !s.moments.length);
    if (orphans.length) {
      index.append(el('h3', { text: 'Altri canti' }));
      const ol = el('ol');
      for (const s of orphans) ol.append(indexRow(numbers.get(s.id), s, s.key || ''));
      index.append(ol);
    }
  }
  doc.append(index);

  // canti
  const scores = [];
  songs.forEach((s, i) => {
    const art = el('article', { class: 'print-song' }, [
      el('h2', {}, [el('span', { class: 'num', text: `${i + 1}. ` }), s.title]),
      el('p', {
        class: 'ph',
        text: [
          s.moments.map(momentLabel).join(', '),
          s.key ? `tonalità ${s.key}` : null,
          s.bpm ? `${s.bpm} bpm` : null,
          s.capo ? `capotasto ${s.capo}` : null,
        ].filter(Boolean).join(' · '),
      }),
    ]);
    const bodyEl = renderSongBody(s, { transpose: 0, showChords: opts.chords, className: `print-body ${opts.twoCols ? 'two-col' : ''}`.trim() });
    art.append(bodyEl);

    if (opts.organ && s.organ && (s.organ.text || s.organ.registration || s.organ.abc)) {
      const organBox = el('div', { class: 'print-organ' }, [
        el('h4', { text: 'Organo' }),
        s.organ.registration ? el('p', { text: s.organ.registration }) : null,
      ]);
      if (s.organ.abc) {
        const scoreBox = el('div', { class: 'score' });
        organBox.append(scoreBox);
        // larghezza fissa: in stampa il contenitore non ha ancora una dimensione
        scores.push(renderScore(scoreBox, s.organ.abc, { staffwidth: 680 }));
      }
      if (s.organ.text) organBox.append(el('pre', { text: s.organ.text }));
      art.append(organBox);
    }
    doc.append(art);
  });

  document.body.append(doc);
  // gli spartiti vanno disegnati prima di aprire la stampa, altrimenti escono vuoti
  if (scores.length) {
    toast(`Preparo ${scores.length} spartit${scores.length === 1 ? 'o' : 'i'}…`);
    await Promise.all(scores);
  }
  const cleanup = () => { doc.remove(); window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
  setTimeout(() => window.print(), 60);
}

function indexRow(n, song, extra) {
  return el('li', {}, [
    el('span', { class: 'n', text: `${n}.` }),
    el('span', { class: 't', text: song.title }),
    el('span', { class: 'dots' }),
    el('span', { class: 'k', text: extra || '' }),
  ]);
}
