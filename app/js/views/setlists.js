// Scalette: elenco per data e dettaglio della singola celebrazione.

import { el, clear, toast, modal, confirmDialog, formatDate, dayMonth, relativeDay, nextSunday } from '../ui.js';
import { store, MOMENTS, momentLabel } from '../store.js';
import { navigate } from '../router.js';

export function setlistsView(root, params) {
  clear(root);
  root.classList.remove('wide');

  if (params.get('nuova')) {
    history.replaceState(null, '', '#/scalette');
    setTimeout(() => newSetlist(), 0);
  }

  root.append(el('div', { style: 'display:flex;align-items:center;gap:.5rem;margin-bottom:.6rem' }, [
    el('h2', { text: 'Scalette', style: 'flex:1;font-size:1.2rem' }),
    el('button', { class: 'btn primary', type: 'button', html: '+&nbsp; Nuova', onclick: () => newSetlist() }),
  ]));

  const lists = store.setlists;
  if (!lists.length) {
    root.append(el('div', { class: 'empty' }, [
      el('strong', { text: 'Nessuna scaletta' }),
      el('span', { text: 'Crea la scaletta della prossima messa: durante la celebrazione avrai i canti già pronti, in ordine.' }),
    ]));
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = lists.filter((s) => s.date >= today).reverse();
  const past = lists.filter((s) => s.date < today);

  if (upcoming.length) {
    root.append(el('div', { class: 'section-title' }, [el('span', { text: 'In programma' })]));
    root.append(el('div', {}, upcoming.map((s, i) => row(s, i === 0))));
  }
  if (past.length) {
    root.append(el('div', { class: 'section-title' }, [el('span', { text: 'Passate' }), el('span', { class: 'count', text: String(past.length) })]));
    root.append(el('div', {}, past.map((s) => row(s, false))));
  }
}

function row(sl, isNext) {
  const { d, m } = dayMonth(sl.date);
  const rel = relativeDay(sl.date);
  return el('div', {
    class: `setlist-row ${isNext ? 'next' : ''}`.trim(), role: 'button', tabindex: '0',
    onclick: () => navigate(`#/scaletta/${sl.id}`),
    onkeydown: (e) => { if (e.key === 'Enter') navigate(`#/scaletta/${sl.id}`); },
  }, [
    el('div', { class: 'setlist-date' }, [
      el('div', { class: 'd', text: d }),
      el('div', { class: 'm', text: m }),
    ]),
    el('div', { class: 'grow' }, [
      el('div', { class: 't', text: sl.title || 'Messa' }),
      el('div', { class: 's', text: `${sl.items.length} cant${sl.items.length === 1 ? 'o' : 'i'}${rel ? ` · ${rel}` : ''}` }),
    ]),
    el('span', { style: 'color:var(--ink-faint)', html: '&#8250;' }),
  ]);
}

export function newSetlist(prefill = {}) {
  modal('Nuova scaletta', (close) => {
    const date = el('input', { class: 'input', type: 'date', value: prefill.date || nextSunday() });
    const title = el('input', { class: 'input', value: prefill.title || '', placeholder: 'es. Messa delle 11, Veglia pasquale' });
    const save = () => {
      const sl = store.saveSetlist({ date: date.value, title: title.value.trim(), items: [] });
      close();
      navigate(`#/scaletta/${sl.id}`);
    };
    return el('div', {}, [
      el('label', { class: 'field' }, [el('span', { text: 'Data' }), date]),
      el('label', { class: 'field' }, [el('span', { text: 'Titolo (facoltativo)' }), title]),
      el('div', { class: 'modal-foot' }, [
        el('button', { class: 'btn ghost', type: 'button', text: 'Annulla', onclick: () => close() }),
        el('button', { class: 'btn primary', type: 'button', text: 'Crea', onclick: save }),
      ]),
    ]);
  });
}

// ------------------------------------------------------------------- dettaglio

export function setlistView(root, params, id) {
  const sl = store.setlist(id);
  clear(root);
  root.classList.remove('wide');

  if (!sl) {
    root.append(el('div', { class: 'empty' }, [
      el('strong', { text: 'Scaletta non trovata' }),
      el('button', { class: 'btn', type: 'button', text: 'Torna alle scalette', style: 'margin-top:1rem', onclick: () => navigate('#/scalette') }),
    ]));
    return;
  }

  const repaint = () => setlistView(root, params, id);

  root.append(el('div', { style: 'display:flex;align-items:flex-start;gap:.4rem;margin-bottom:.3rem' }, [
    el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Indietro', html: '&#8592;', onclick: () => navigate('#/scalette') }),
    el('div', { style: 'flex:1;padding-top:.3rem' }, [
      el('h2', { text: sl.title || 'Messa', style: 'font-size:1.25rem' }),
      el('p', { style: 'color:var(--ink-faint);font-size:.85rem', text: formatDate(sl.date) }),
    ]),
    el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Altre azioni', html: '&#8942;', onclick: () => setlistMenu(sl, repaint) }),
  ]));

  root.append(el('div', { class: 'btn-row', style: 'margin:.8rem 0' }, [
    el('button', { class: 'btn primary', type: 'button', html: '+&nbsp; Aggiungi canti', onclick: () => navigate(`#/canti?aggiungi=${sl.id}`) }),
    el('button', { class: 'btn', type: 'button', html: '&#128424;&#xFE0F;&nbsp; Stampa', onclick: () => navigate(`#/stampa?scaletta=${sl.id}`) }),
  ]));

  // La messa ha una sua struttura fissa: ogni momento è una casella che aspetta
  // il suo canto. Restano visibili anche vuote, così si vede cosa manca ancora.
  const groups = new Map(MOMENTS.map((m) => [m.id, []]));
  const extras = [];
  sl.items.forEach((item, index) => {
    if (item.moment && groups.has(item.moment)) groups.get(item.moment).push({ item, index });
    else extras.push({ item, index });
  });

  const coperti = MOMENTS.filter((m) => groups.get(m.id).length).length;
  root.append(el('div', {
    class: 'coverage', 'aria-label': `${coperti} momenti su ${MOMENTS.length} hanno un canto`,
  }, [
    el('div', { class: 'coverage-bar' }, MOMENTS.map((m) => el('span', {
      class: `coverage-tick ${groups.get(m.id).length ? 'on' : ''}`.trim(),
      title: m.label,
    }))),
    el('span', {
      class: 'coverage-text',
      text: coperti === MOMENTS.length
        ? 'Tutti i momenti hanno un canto'
        : `${coperti} moment${coperti === 1 ? 'o' : 'i'} su ${MOMENTS.length}`,
    }),
  ]));

  const wrap = el('div', { class: 'card', style: 'overflow:hidden;margin-top:.6rem' });
  let numero = 0;

  for (const m of MOMENTS) {
    const group = groups.get(m.id);
    wrap.append(el('div', { class: 'sl-moment' }, [
      el('span', { text: m.label }),
      group.length > 1 ? el('span', { class: 'sl-count', text: `${group.length} canti` }) : null,
    ]));
    if (!group.length) {
      wrap.append(el('button', {
        class: 'sl-empty', type: 'button',
        onclick: () => navigate(`#/canti?aggiungi=${sl.id}&momento=${m.id}`),
      }, [el('span', { text: `+  Scegli il canto per ${m.label.toLowerCase()}` })]));
      continue;
    }
    group.forEach((g, pos) => {
      numero++;
      wrap.append(itemRow(sl, g, numero, repaint, {
        group, pos, extra: pos > 0,
      }));
    });
  }

  wrap.append(el('div', { class: 'sl-moment' }, [
    el('span', { text: 'Canti extra' }),
    extras.length ? el('span', { class: 'sl-count', text: `${extras.length}` }) : null,
  ]));
  extras.forEach((g, pos) => {
    numero++;
    wrap.append(itemRow(sl, g, numero, repaint, { group: extras, pos, extra: false }));
  });
  wrap.append(el('button', {
    class: 'sl-empty', type: 'button',
    onclick: () => navigate(`#/canti?aggiungi=${sl.id}&momento=extra`),
  }, [el('span', { text: '+  Aggiungi un canto fuori schema' })]));

  root.append(wrap);

  root.append(el('p', {
    style: 'color:var(--ink-faint);font-size:.78rem;margin-top:.7rem;text-align:center',
    text: 'Tocca un canto per aprirlo; da lì passi al successivo senza tornare indietro.',
  }));

  if (sl.notes) {
    root.append(el('div', {
      class: 'card', style: 'padding:.8rem;margin-top:1rem;font-size:.9rem;color:var(--ink-soft);white-space:pre-wrap', text: sl.notes,
    }));
  }
}

function itemRow(sl, entry, numero, repaint, { group, pos, extra }) {
  const { item, index } = entry;
  const song = store.song(item.songId);

  // Lo spostamento avviene dentro il momento: scambiare canti fra momenti
  // diversi non avrebbe senso, li rimescolerebbe soltanto.
  const move = (delta) => {
    const other = group[pos + delta];
    if (!other) return;
    const items = [...sl.items];
    [items[index], items[other.index]] = [items[other.index], items[index]];
    store.saveSetlist({ ...sl, items });
    repaint();
  };

  const open = () => {
    if (song) navigate(`#/canto/${encodeURIComponent(song.id)}?sl=${sl.id}`);
  };

  const meta = song ? [song.key, song.bpm ? `${song.bpm} bpm` : null].filter(Boolean).join(' · ') : '';

  return el('div', { class: 'sl-item' }, [
    el('span', { class: 'num', text: String(numero) }),
    el('div', {
      class: 'grow', role: 'button', tabindex: '0', onclick: open,
      onkeydown: (e) => { if (e.key === 'Enter') open(); },
    }, [
      el('div', { class: 't' }, [
        song ? song.title : '(canto rimosso)',
        extra ? el('span', { class: 'sl-extra', text: 'extra' }) : null,
      ]),
      meta ? el('div', { class: 'm', text: meta }) : null,
    ]),
    group.length > 1 ? el('button', {
      class: 'icon-btn', type: 'button', 'aria-label': 'Sposta su', html: '&#9650;',
      style: 'min-width:2.2rem;font-size:.7rem', disabled: pos === 0, onclick: () => move(-1),
    }) : null,
    group.length > 1 ? el('button', {
      class: 'icon-btn', type: 'button', 'aria-label': 'Sposta giù', html: '&#9660;',
      style: 'min-width:2.2rem;font-size:.7rem', disabled: pos === group.length - 1, onclick: () => move(1),
    }) : null,
    el('button', {
      class: 'icon-btn', type: 'button', 'aria-label': 'Togli dalla scaletta', html: '&times;', style: 'min-width:2.2rem',
      onclick: () => {
        store.saveSetlist({ ...sl, items: sl.items.filter((_, i) => i !== index) });
        toast('Rimosso dalla scaletta');
        repaint();
      },
    }),
  ]);
}

function setlistMenu(sl, repaint) {
  modal(sl.title || 'Scaletta', (close) => {
    const item = (label, icon, fn, cls = '') => el('button', {
      class: `btn ${cls}`, type: 'button', style: 'width:100%;justify-content:flex-start',
      html: `${icon}&nbsp;&nbsp;${label}`,
      onclick: () => { close(); fn(); },
    });
    return el('div', { style: 'display:flex;flex-direction:column;gap:.4rem' }, [
      item('Modifica data e titolo', '&#9998;', () => editSetlist(sl, repaint)),
      item('Riordina secondo la messa', '&#8645;', () => {
        const rank = (m) => { const i = MOMENTS.findIndex((x) => x.id === m); return i < 0 ? 99 : i; };
        const items = [...sl.items].sort((a, b) => rank(a.moment) - rank(b.moment));
        store.saveSetlist({ ...sl, items });
        toast('Riordinata');
        repaint();
      }),
      item('Duplica', '&#128203;', () => {
        const copy = store.saveSetlist({ date: nextSunday(), title: `${sl.title || 'Messa'} (copia)`, items: sl.items, notes: sl.notes });
        navigate(`#/scaletta/${copy.id}`);
      }),
      item('Elimina scaletta', '&#128465;&#xFE0F;', async () => {
        if (await confirmDialog('Eliminare la scaletta?', 'Verrà rimossa anche dagli altri dispositivi sincronizzati.', { danger: true, okLabel: 'Elimina' })) {
          store.deleteSetlist(sl.id);
          toast('Scaletta eliminata');
          navigate('#/scalette');
        }
      }, 'danger'),
    ]);
  });
}

function editSetlist(sl, repaint) {
  modal('Modifica scaletta', (close) => {
    const date = el('input', { class: 'input', type: 'date', value: sl.date });
    const title = el('input', { class: 'input', value: sl.title || '' });
    const notes = el('textarea', { class: 'input', style: 'min-height:5rem;font-family:inherit', value: sl.notes || '', placeholder: 'Note per il coro' });
    return el('div', {}, [
      el('label', { class: 'field' }, [el('span', { text: 'Data' }), date]),
      el('label', { class: 'field' }, [el('span', { text: 'Titolo' }), title]),
      el('label', { class: 'field' }, [el('span', { text: 'Note' }), notes]),
      el('div', { class: 'modal-foot' }, [
        el('button', { class: 'btn ghost', type: 'button', text: 'Annulla', onclick: () => close() }),
        el('button', {
          class: 'btn primary', type: 'button', text: 'Salva',
          onclick: () => {
            store.saveSetlist({ ...sl, date: date.value, title: title.value.trim(), notes: notes.value });
            close();
            toast('Scaletta aggiornata');
            repaint();
          },
        }),
      ]),
    ]);
  });
}
