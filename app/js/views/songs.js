// Elenco dei canti: raggruppati per momento della messa, alfabetici dentro
// ogni gruppo, con ricerca per titolo/testo e filtri per tempo liturgico.

import { el, clear, highlight, toast, modal } from '../ui.js';
import { store, MOMENTS, SEASONS, momentLabel, seasonLabel, byTitle } from '../store.js';
import { navigate } from '../router.js';

const ui = { q: '', moment: null, seasons: [], showFilters: false };

export function songsView(root, params) {
  const addTo = params.get('aggiungi');         // id scaletta in cui inserire
  const setlist = addTo ? store.setlist(addTo) : null;
  // momento già deciso: si arriva da una casella vuota della scaletta
  const slot = setlist ? params.get('momento') : null;
  const slotMoment = slot && slot !== 'extra' ? slot : null;

  clear(root);
  root.classList.remove('wide');

  if (addTo && !setlist) {
    root.append(el('div', { class: 'empty' }, [el('strong', { text: 'Scaletta non trovata' })]));
    return;
  }

  if (setlist) {
    root.append(el('div', {
      class: 'card',
      style: 'padding:.7rem .85rem;margin-bottom:.8rem;display:flex;align-items:center;gap:.6rem',
    }, [
      el('div', { style: 'flex:1;min-width:0' }, [
        el('div', {
          style: 'font-size:.72rem;color:var(--ink-faint);font-weight:700;letter-spacing:.06em;text-transform:uppercase',
          text: slotMoment ? `Canto per ${momentLabel(slotMoment).toLowerCase()}` : slot === 'extra' ? 'Canto extra' : 'Aggiungi a',
        }),
        el('div', { style: 'font-weight:650', text: setlist.title || 'Scaletta' }),
      ]),
      el('button', {
        class: 'btn small', type: 'button', text: 'Fine',
        onclick: () => navigate(`#/scaletta/${setlist.id}`),
      }),
    ]));
  }

  // ---- ricerca ----------------------------------------------------------
  const input = el('input', {
    class: 'input', type: 'search', value: ui.q, enterkeyhint: 'search',
    placeholder: 'Cerca per titolo o parole del testo…', 'aria-label': 'Cerca un canto',
  });
  const clearBtn = el('button', {
    class: 'search-clear', type: 'button', 'aria-label': 'Cancella ricerca', html: '&times;',
    style: ui.q ? '' : 'display:none',
    onclick: () => { ui.q = ''; input.value = ''; clearBtn.style.display = 'none'; paint(); },
  });
  input.addEventListener('input', () => {
    ui.q = input.value;
    clearBtn.style.display = ui.q ? '' : 'none';
    paint();
  });

  root.append(el('div', { class: 'searchbar' }, [
    el('div', { class: 'search-wrap' }, [
      el('span', { class: 'ico', html: '&#128269;' }), input, clearBtn,
    ]),
    el('button', {
      class: 'icon-btn', type: 'button', title: 'Filtra per tempo liturgico',
      'aria-label': 'Filtra per tempo liturgico', html: '&#9776;',
      onclick: () => { ui.showFilters = !ui.showFilters; songsView(root, params); },
    }),
  ]));

  // ---- filtri -----------------------------------------------------------
  const momentChips = el('div', { class: 'chips' }, [
    chip('Tutti', ui.moment === null, () => { ui.moment = null; songsView(root, params); }),
    ...MOMENTS.map((m) => chip(
      m.label, ui.moment === m.id,
      () => { ui.moment = ui.moment === m.id ? null : m.id; songsView(root, params); },
    )),
  ]);
  if (!slotMoment) root.append(momentChips);

  if (ui.showFilters || ui.seasons.length) {
    root.append(el('div', { class: 'chips' }, SEASONS.map((s) => {
      const on = ui.seasons.includes(s.id);
      const c = chip(s.label, on, () => {
        ui.seasons = on ? ui.seasons.filter((x) => x !== s.id) : [...ui.seasons, s.id];
        songsView(root, params);
      });
      c.classList.add('season');
      return c;
    })));
  }

  const listWrap = el('div');
  root.append(listWrap);

  function paint() {
    clear(listWrap);
    const moment = slotMoment || ui.moment;
    // Riempiendo una casella non si nascondono gli altri canti: capita di
    // volerne uno "da comunione" all'offertorio. Vengono solo dopo.
    const results = store.search(ui.q, { moment: slotMoment ? null : ui.moment, seasons: ui.seasons });

    if (!results.length) {
      listWrap.append(el('div', { class: 'empty' }, [
        el('strong', { text: 'Nessun canto trovato' }),
        el('span', { text: ui.q ? 'Prova con un’altra parola, oppure togli i filtri attivi.' : 'Togli qualche filtro per vedere più canti.' }),
      ]));
      return;
    }

    // Casella della scaletta: prima i canti adatti a quel momento, poi gli altri.
    if (slotMoment) {
      const adatti = results.filter((s) => s.moments.includes(slotMoment));
      const altri = results.filter((s) => !s.moments.includes(slotMoment));
      if (adatti.length) {
        listWrap.append(el('div', { class: 'section-title' }, [
          el('span', { text: `Per ${momentLabel(slotMoment).toLowerCase()}` }),
          el('span', { class: 'count', text: `${adatti.length}` }),
        ]));
        listWrap.append(list(adatti));
      }
      if (altri.length) {
        listWrap.append(el('div', { class: 'section-title' }, [
          el('span', { text: 'Tutti gli altri canti' }),
          el('span', { class: 'count', text: `${altri.length}` }),
        ]));
        listWrap.append(list(altri));
      }
      return;
    }

    // Con ricerca o momento scelto: lista piatta. Altrimenti raggruppata.
    if (ui.q || moment) {
      listWrap.append(el('div', { class: 'section-title' }, [
        el('span', { text: moment ? momentLabel(moment) : 'Risultati' }),
        el('span', { class: 'count', text: `${results.length}` }),
      ]));
      listWrap.append(list(results));
      return;
    }

    for (const m of MOMENTS) {
      const songs = results.filter((s) => s.moments.includes(m.id)).sort(byTitle);
      if (!songs.length) continue;
      listWrap.append(el('div', { class: 'section-title' }, [
        el('span', { text: m.label }),
        el('span', { class: 'count', text: `${songs.length}` }),
      ]));
      listWrap.append(list(songs));
    }
    const orphans = results.filter((s) => !s.moments.length);
    if (orphans.length) {
      listWrap.append(el('div', { class: 'section-title' }, [
        el('span', { text: 'Senza momento' }),
        el('span', { class: 'count', text: `${orphans.length}` }),
      ]));
      listWrap.append(list(orphans));
    }
  }

  function list(songs) {
    const ul = el('ul', { class: 'song-list' });
    for (const s of songs) ul.append(row(s));
    return ul;
  }

  function row(s) {
    const meta = el('div', { class: 'm' });
    for (const m of s.moments) meta.append(el('span', { text: momentLabel(m) }));
    for (const se of s.seasons) meta.append(el('span', { text: `· ${seasonLabel(se)}` }));
    if (s.bpm) meta.append(el('span', { text: `· ${s.bpm} bpm` }));

    const title = el('div', { class: 't' });
    title.append(highlight(s.title, ui.q));

    const li = el('li', { class: 'song-row', role: 'button', tabindex: '0' }, [
      el('div', { class: 'grow' }, [title, meta]),
      s.key ? el('span', { class: 'badge-key', text: s.key }) : null,
    ]);

    const open = () => {
      if (setlist) {
        addToSetlist(setlist, s, slot);
      } else {
        navigate(`#/canto/${encodeURIComponent(s.id)}`);
      }
    };
    li.addEventListener('click', open);
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
    return li;
  }

  paint();
}

function chip(label, active, onclick) {
  return el('button', {
    class: 'chip', type: 'button', text: label,
    'aria-pressed': active ? 'true' : 'false', onclick,
  });
}

/**
 * Aggiunge il canto alla scaletta. Se si arriva da una casella vuota il momento
 * è già deciso; altrimenti si chiede, ma solo quando il canto ne ha più di uno.
 */
async function addToSetlist(setlist, song, slot = null) {
  const options = song.moments.length ? song.moments : MOMENTS.map((m) => m.id);
  let moment = options[0];

  if (slot) {
    moment = slot === 'extra' ? null : slot;
  } else if (options.length > 1) {
    moment = await modal('In quale momento?', (close) => el('div', {}, [
      el('p', { style: 'color:var(--ink-soft);margin-bottom:.7rem', text: song.title }),
      el('div', { class: 'btn-row' }, options.map((m) => el('button', {
        class: 'btn', type: 'button', text: momentLabel(m), onclick: () => close(m),
      }))),
    ]));
    if (!moment) return;
  }

  const fresh = store.setlist(setlist.id);
  if (!fresh) return;
  const items = [...fresh.items, { songId: song.id, moment, note: '' }];
  items.sort((a, b) => rank(a.moment) - rank(b.moment));
  store.saveSetlist({ ...fresh, items });
  toast(`${song.title} → ${moment ? momentLabel(moment) : 'canti extra'}`);
  // partiti da una casella vuota: si torna alla scaletta, che è il punto di arrivo
  if (slot) navigate(`#/scaletta/${fresh.id}`);
}

const rank = (id) => {
  const i = MOMENTS.findIndex((m) => m.id === id);
  return i < 0 ? 99 : i;
};
