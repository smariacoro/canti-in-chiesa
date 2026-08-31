// Modalità messa: la scaletta a schermo pieno, un canto alla volta.
//
// Durante la celebrazione servono poche cose e grandi: il canto, il modo di
// passare al successivo e l'elenco per saltare dove serve. Tutto il resto
// (barre, schede, menu di modifica) sparisce.

import { el, clear, toast, modal } from '../ui.js';
import { store, momentLabel } from '../store.js';
import { renderSongBody } from '../render.js';
import { transposeCell, keyLabel, prefersFlat } from '../chords.js';
import { Metronome, playKey, stopKey, unlockAudio } from '../audio.js';
import { navigate } from '../router.js';
import { keepAwake } from './song.js';

const metro = new Metronome();
let swipeTarget = null;
let onKeyDown = null;

export function playView(root, params, id) {
  const sl = store.setlist(id);
  clear(root);
  root.classList.remove('wide');
  metro.stop();
  stopKey();

  if (!sl || !sl.items.length) {
    document.body.classList.remove('playing');
    root.append(el('div', { class: 'empty' }, [
      el('strong', { text: sl ? 'Questa scaletta è vuota' : 'Scaletta non trovata' }),
      el('button', {
        class: 'btn', type: 'button', text: 'Torna alle scalette', style: 'margin-top:1rem',
        onclick: () => navigate('#/scalette'),
      }),
    ]));
    return;
  }

  document.body.classList.add('playing');
  keepAwake(true);

  const total = sl.items.length;
  const index = Math.max(0, Math.min(total - 1, Number(params.get('i') || 0)));
  const item = sl.items[index];
  const song = store.song(item.songId);

  const go = (i) => navigate(`#/messa/${sl.id}?i=${Math.max(0, Math.min(total - 1, i))}`);
  const esci = () => { leavePlay(); navigate(`#/scaletta/${sl.id}`); };

  // ------------------------------------------------------------ barra in alto
  root.append(el('div', { class: 'play-bar' }, [
    el('button', {
      class: 'icon-btn', type: 'button', 'aria-label': 'Esci dalla modalità messa',
      html: '&times;', onclick: esci,
    }),
    el('button', {
      class: 'play-count', type: 'button',
      title: 'Elenco dei canti',
      onclick: () => elenco(sl, index, go),
      html: `<span>${index + 1} di ${total}</span> <span class="caret">&#9662;</span>`,
    }),
    el('span', {
      class: 'play-moment',
      text: item.moment ? momentLabel(item.moment) : 'Extra',
    }),
  ]));

  if (!song) {
    root.append(el('div', { class: 'empty' }, [el('strong', { text: 'Canto non più disponibile' })]));
    root.append(navFooter(index, total, go, esci));
    return;
  }

  const transKey = `transpose.${song.id}`;
  let transpose = Number(store.prefs[transKey] || 0);
  const showChords = store.prefs.showChords !== false;
  const shownKey = song.key ? transposeCell(song.key, transpose, prefersFlat(song.key)) : null;

  // -------------------------------------------------------------- il canto
  root.append(el('h2', { class: 'play-title', text: song.title }));

  const strumenti = el('div', { class: 'play-tools' }, [
    shownKey ? el('button', {
      class: 'pill', type: 'button', title: `Ascolta ${keyLabel(shownKey)}`,
      onclick: () => { unlockAudio(); playKey(shownKey); },
      html: `<span class="k">&#9834;</span><span>${shownKey}</span>`,
    }) : null,
    song.bpm ? el('button', {
      class: 'pill', type: 'button', title: 'Metronomo',
      onclick: (e) => {
        unlockAudio();
        const on = metro.toggle(song.bpm, song.meter || 4);
        e.currentTarget.classList.toggle('active', on !== false && metro.running);
      },
      html: `<span class="k">&#9654;</span><span>${song.bpm}</span>`,
    }) : null,
    el('button', {
      class: 'pill', type: 'button', 'aria-label': 'Riduci il testo',
      text: 'A−', onclick: () => zoom(-1),
    }),
    el('button', {
      class: 'pill', type: 'button', 'aria-label': 'Ingrandisci il testo',
      text: 'A+', onclick: () => zoom(1),
    }),
  ]);
  root.append(strumenti);

  const body = renderSongBody(song, { transpose, showChords });
  root.append(body);

  function zoom(delta) {
    const v = Math.max(0.7, Math.min(2.6, +(store.prefs.songScale + delta * 0.1).toFixed(2)));
    store.setPref('songScale', v);
    document.documentElement.style.setProperty('--song-scale', v);
  }

  if (item.note) {
    root.append(el('p', { class: 'play-note', text: item.note }));
  }

  root.append(navFooter(index, total, go, esci));

  // ------------------------------------------- scorrimento laterale e tastiera
  attachSwipe(root, index, total, go);

  document.removeEventListener('keydown', onKeyDown);
  onKeyDown = (e) => {
    if (document.querySelector('.modal-backdrop')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); go(index + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(index - 1); }
    else if (e.key === 'Escape') esci();
  };
  document.addEventListener('keydown', onKeyDown);
}

export function leavePlay() {
  document.body.classList.remove('playing');
  metro.stop();
  stopKey();
  keepAwake(false);
  document.removeEventListener('keydown', onKeyDown);
  onKeyDown = null;
  if (swipeTarget) {
    swipeTarget.removeEventListener('touchstart', swipeTarget._onStart);
    swipeTarget.removeEventListener('touchend', swipeTarget._onEnd);
    swipeTarget = null;
  }
}

// ------------------------------------------------------------------ pezzi

function navFooter(index, total, go, esci) {
  const ultimo = index === total - 1;
  return el('div', { class: 'play-nav' }, [
    el('button', {
      class: 'btn', type: 'button', html: '&#8592;', 'aria-label': 'Canto precedente',
      disabled: index === 0, onclick: () => go(index - 1),
    }),
    el('div', { class: 'play-dots' }, Array.from({ length: total }, (_, i) => el('span', {
      class: `play-dot ${i === index ? 'on' : ''}`.trim(),
    }))),
    ultimo
      ? el('button', { class: 'btn primary', type: 'button', text: 'Fine', onclick: esci })
      : el('button', {
        class: 'btn primary', type: 'button', html: 'Avanti &#8594;',
        onclick: () => go(index + 1),
      }),
  ]);
}

function elenco(sl, index, go) {
  modal(sl.title || 'Scaletta', (close) => {
    const wrap = el('div', { style: 'display:flex;flex-direction:column;gap:.2rem' });
    let lastMoment = '__x__';
    sl.items.forEach((item, i) => {
      if (item.moment !== lastMoment) {
        lastMoment = item.moment;
        wrap.append(el('div', {
          class: 'sl-moment',
          text: item.moment ? momentLabel(item.moment) : 'Canti extra',
        }));
      }
      const song = store.song(item.songId);
      wrap.append(el('button', {
        class: `play-jump ${i === index ? 'on' : ''}`.trim(), type: 'button',
        onclick: () => { close(); go(i); },
      }, [
        el('span', { class: 'num', text: String(i + 1) }),
        el('span', { style: 'flex:1;text-align:left', text: song ? song.title : '(canto rimosso)' }),
        song && song.key ? el('span', { class: 'badge-key', text: song.key }) : null,
      ]));
    });
    return wrap;
  });
}

/** Scorrimento orizzontale, ma solo se il gesto è chiaramente laterale. */
function attachSwipe(target, index, total, go) {
  if (swipeTarget) {
    swipeTarget.removeEventListener('touchstart', swipeTarget._onStart);
    swipeTarget.removeEventListener('touchend', swipeTarget._onEnd);
  }
  let x0 = 0;
  let y0 = 0;
  let t0 = 0;

  const onStart = (e) => {
    if (e.touches.length !== 1) return;
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
    t0 = Date.now();
  };
  const onEnd = (e) => {
    if (!t0 || !e.changedTouches.length) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    const dt = Date.now() - t0;
    t0 = 0;
    // deve essere ampio, orizzontale e rapido: durante la lettura si scorre in verticale
    if (dt > 700 || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2) return;
    if (dx < 0 && index < total - 1) go(index + 1);
    else if (dx > 0 && index > 0) go(index - 1);
    else if (dx < 0) toast('È l’ultimo canto della scaletta');
  };

  target.addEventListener('touchstart', onStart, { passive: true });
  target.addEventListener('touchend', onEnd, { passive: true });
  target._onStart = onStart;
  target._onEnd = onEnd;
  swipeTarget = target;
}
