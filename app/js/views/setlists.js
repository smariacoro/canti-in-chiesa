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
    el('button', { class: 'btn', type: 'button', html: '&#128424;&nbsp; Stampa', onclick: () => navigate(`#/stampa?scaletta=${sl.id}`) }),
  ]));

  if (!sl.items.length) {
    root.append(el('div', { class: 'empty' }, [
      el('strong', { text: 'Scaletta vuota' }),
      el('span', { text: 'Aggiungi i canti scegliendo il momento della messa a cui appartengono.' }),
    ]));
  } else {
    const wrap = el('div', { class: 'card', style: 'overflow:hidden;margin-top:.3rem' });
    let lastMoment = '__none__';
    sl.items.forEach((item, i) => {
      if (item.moment !== lastMoment) {
        lastMoment = item.moment;
        wrap.append(el('div', {
          style: 'padding:.5rem .75rem .25rem;font-size:.7rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--gold)',
          text: item.moment ? momentLabel(item.moment) : 'Altro',
        }));
      }
      wrap.append(itemRow(sl, item, i, repaint));
    });
    root.append(wrap);

    root.append(el('p', {
      style: 'color:var(--ink-faint);font-size:.78rem;margin-top:.7rem;text-align:center',
      text: 'Tocca un canto per aprirlo; da lì puoi passare al successivo senza tornare indietro.',
    }));
  }

  if (sl.notes) {
    root.append(el('div', {
      class: 'card', style: 'padding:.8rem;margin-top:1rem;font-size:.9rem;color:var(--ink-soft);white-space:pre-wrap', text: sl.notes,
    }));
  }
}

function itemRow(sl, item, index, repaint) {
  const song = store.song(item.songId);
  const move = (delta) => {
    const items = [...sl.items];
    const j = index + delta;
    if (j < 0 || j >= items.length) return;
    [items[index], items[j]] = [items[j], items[index]];
    store.saveSetlist({ ...sl, items });
    repaint();
  };

  const open = () => {
    if (song) navigate(`#/canto/${encodeURIComponent(song.id)}?sl=${sl.id}`);
  };

  return el('div', { class: 'sl-item' }, [
    el('span', { class: 'num', text: String(index + 1) }),
    el('div', {
      class: 'grow', role: 'button', tabindex: '0', onclick: open,
      onkeydown: (e) => { if (e.key === 'Enter') open(); },
    }, [
      el('div', { class: 't', text: song ? song.title : '(canto rimosso)' }),
      el('div', { class: 'm', text: song ? [song.key, song.bpm ? `${song.bpm} bpm` : null].filter(Boolean).join(' · ') : '' }),
    ]),
    el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Sposta su', html: '&#9650;', style: 'min-width:2.2rem;font-size:.7rem', onclick: () => move(-1) }),
    el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Sposta giù', html: '&#9660;', style: 'min-width:2.2rem;font-size:.7rem', onclick: () => move(1) }),
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
      item('Elimina scaletta', '&#128465;', async () => {
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
