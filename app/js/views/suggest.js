// Riquadro "Letture e canti suggeriti" della scaletta, e suggerimenti per una
// singola casella. La logica sta in liturgy.js; qui c'è solo la presentazione.

import { el, clear, formatDate } from '../ui.js';
import { store, MOMENTS, momentLabel, seasonLabel } from '../store.js';
import {
  scaricaLetture, lettureInCache, letturaDisponibile, suggerisci, tempoLiturgico, PARTI,
} from '../liturgy.js';

/** Il salmo ha riferimenti lunghissimi: per l'elenco basta il numero. */
function rifBreve(id, rif) {
  if (!rif) return '';
  return id === 'PS' ? rif.replace(/^(Sal\s+[^,]+),.*$/, '$1') : rif;
}

function perche(err, data) {
  if (!navigator.onLine) return 'Senza collegamento non si possono scaricare le letture.';
  if (err && err.message === 'fuori-finestra') {
    const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
    const [y, m, d] = data.split('-').map(Number);
    const giorno = new Date(y, m - 1, d);
    if (giorno > oggi) {
      const da = new Date(giorno); da.setDate(da.getDate() - 29);
      return `Le letture di questa data si potranno scaricare dal ${formatDate(da.toISOString().slice(0, 10), { weekday: false })}.`;
    }
    return 'Questa data è troppo lontana nel passato per scaricarne le letture.';
  }
  return 'Non sono riuscito a scaricare le letture. Riprova più tardi.';
}

/**
 * @param {object} sl     scaletta
 * @param {object} opts   onAdd(song, moment) aggiunge un canto alla scaletta
 */
export function suggestionsCard(sl, { onAdd }) {
  const card = el('section', { class: 'card lit' });
  const corpo = el('div', { class: 'lit-body' });
  const testa = el('button', {
    class: 'lit-head', type: 'button',
    onclick: () => apri(corpo.hidden),
  }, [
    el('span', { class: 'lit-title', text: 'Letture e canti suggeriti' }),
    el('span', { class: 'rhythm-chev', 'aria-hidden': 'true', html: '&#9662;' }),
  ]);
  card.append(testa, corpo);

  function apri(si) {
    corpo.hidden = !si;
    card.classList.toggle('open', si);
    testa.setAttribute('aria-expanded', si ? 'true' : 'false');
    store.setPref('litOpen', si);
  }
  apri(store.prefs.litOpen !== false);

  const disegna = (letture, errore) => {
    clear(corpo);
    const tempo = tempoLiturgico(sl.date);
    const presenti = new Set(sl.items.map((i) => `${i.moment}|${i.songId}`));

    corpo.append(el('div', { class: 'lit-day' }, [
      el('span', { class: 'lit-dayname', text: letture ? letture.titolo : formatDate(sl.date) }),
      el('span', { class: 'pill tag', text: seasonLabel(tempo) }),
    ]));

    if (letture) {
      const rif = PARTI.map((p) => rifBreve(p.id, letture.rif[p.id])).filter(Boolean);
      corpo.append(el('p', { class: 'lit-refs', text: rif.join(' · ') }));

      const testi = el('details', { class: 'lit-read' }, [el('summary', { text: 'Leggi le letture' })]);
      for (const p of PARTI) {
        if (!letture.testo[p.id]) continue;
        testi.append(
          el('h4', {}, [p.nome, el('span', { text: ` · ${letture.rif[p.id] || ''}` })]),
          el('p', { text: letture.testo[p.id] }),
        );
      }
      testi.append(el('p', { class: 'lit-credit', text: 'Testi © Conferenza Episcopale Italiana, tramite Evangelizo.' }));
      corpo.append(testi);
    } else if (errore) {
      corpo.append(el('p', { class: 'lit-msg', text: perche(errore, sl.date) }));
    } else {
      corpo.append(el('p', { class: 'lit-msg', text: 'Scarico le letture…' }));
    }

    const r = suggerisci({ songs: store.songs, data: sl.date, letture });
    const box = el('div', { class: 'lit-sugg' });
    let qualcosa = false;

    for (const m of MOMENTS) {
      const lista = r.perMomento[m.id] || [];
      const nota = r.avvertenze[m.id];
      if (!lista.length && !nota) continue;
      qualcosa = true;
      box.append(el('div', { class: 'lit-moment' }, [
        el('span', { class: 'lit-mlabel', text: m.label }),
        nota ? el('p', { class: 'lit-note', text: nota }) : null,
        lista.length ? el('div', { class: 'lit-songs' }, lista.map((x) => {
          const gia = presenti.has(`${m.id}|${x.song.id}`);
          return el('button', {
            class: `lit-song ${gia ? 'in' : ''}`.trim(), type: 'button', disabled: gia,
            title: gia ? 'Già nella scaletta' : `Aggiungi a ${m.label}`,
            onclick: () => onAdd(x.song, m.id),
          }, [
            el('span', { class: 'lit-st', text: x.song.title }),
            x.motivi.length
              ? el('span', { class: 'lit-why', text: x.motivi.join(' · ') })
              : el('span', { class: 'lit-why', text: `adatto a: ${seasonLabel(tempo).toLowerCase()}` }),
            el('span', { class: 'lit-add', 'aria-hidden': 'true', html: gia ? '&#10003;' : '+' }),
          ]);
        })) : null,
      ]));
    }

    if (qualcosa) {
      corpo.append(el('p', {
        class: 'lit-intro',
        text: letture
          ? 'Canti che riprendono parole delle letture: sotto ogni titolo, le parole in comune. Tocca un canto per aggiungerlo.'
          : 'In attesa delle letture, ecco i canti adatti al tempo liturgico.',
      }));
      corpo.append(box);
    } else if (letture) {
      corpo.append(el('p', { class: 'lit-msg', text: 'Nessun canto del repertorio riprende da vicino queste letture.' }));
    }
  };

  const giaPronte = lettureInCache(sl.date);
  if (giaPronte) {
    disegna(giaPronte, null);
  } else if (!letturaDisponibile(sl.date) || !navigator.onLine) {
    disegna(null, letturaDisponibile(sl.date) ? new Error('offline') : new Error('fuori-finestra'));
  } else {
    disegna(null, null);
    scaricaLetture(sl.date).then((l) => disegna(l, null), (e) => disegna(null, e));
  }

  return card;
}

/** Suggerimenti per una casella della scaletta, usati nell'elenco dei canti. */
export async function suggerimentiPerCasella(sl, moment, quanti = 5) {
  let letture = lettureInCache(sl.date);
  if (!letture && letturaDisponibile(sl.date) && navigator.onLine) {
    try { letture = await scaricaLetture(sl.date); } catch (e) { letture = null; }
  }
  const r = suggerisci({ songs: store.songs, data: sl.date, letture, quanti });
  return { lista: r.perMomento[moment] || [], letture, nota: r.avvertenze[moment] || null };
}

export { momentLabel };
