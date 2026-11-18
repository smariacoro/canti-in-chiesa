// Scorrimento automatico del testo, per suonare e cantare senza toccare il telefono.
//
// La velocità va da 1 a 10 ed è salvata per ogni canto su questo dispositivo:
// dipende dalla dimensione del testo e dallo schermo, quindi non ha senso
// passarla agli altri. Viene comunque moltiplicata per lo zoom, così
// ingrandendo il testo le righe continuano a passare allo stesso ritmo.
//
// Toccando lo schermo lo scorrimento si ferma finché si tiene il dito giù,
// e riprende da solo poco dopo: si può tornare indietro di una riga senza
// dover cercare il pulsante.

import { el, toast } from './ui.js';
import { store } from './store.js';

export const VEL_MIN = 1;
export const VEL_MAX = 10;
const VEL_DEFAULT = 4;
const RIPRESA_MS = 1200;

/** Pixel al secondo per un livello: progressione geometrica, da ~6 a ~60. */
function pxAlSecondo(livello) {
  const zoom = Number(store.prefs.songScale) || 1;
  return 4.5 * Math.pow(1.3, livello) * zoom;
}

const chiave = (songId) => `scroll.${songId}`;

export function velocita(songId) {
  const v = Number(store.prefs[chiave(songId)]);
  return v >= VEL_MIN && v <= VEL_MAX ? v : VEL_DEFAULT;
}

let attivo = null; // un solo scorrimento alla volta in tutta l'app

/**
 * Pulsante "Scorri" più il pannellino fisso che compare mentre scorre.
 * Restituisce il pulsante da mettere nella barra degli strumenti.
 */
export function autoscrollButton(songId, { className = 'pill' } = {}) {
  const btn = el('button', {
    class: className, type: 'button',
    title: 'Scorrimento automatico del testo',
    'aria-pressed': 'false',
    html: '<span class="k">&#8675;</span><span>Scorri</span>',
    onclick: () => (attivo && attivo.songId === songId ? fermaScorrimento() : avvia(songId, btn)),
  });
  return btn;
}

export function fermaScorrimento() {
  if (!attivo) return;
  const a = attivo;
  attivo = null;
  cancelAnimationFrame(a.raf);
  clearTimeout(a.ripresa);
  window.removeEventListener('touchstart', a.onDown);
  window.removeEventListener('touchend', a.onUp);
  window.removeEventListener('touchcancel', a.onUp);
  window.removeEventListener('wheel', a.onWheel);
  document.removeEventListener('keydown', a.onKey, true);
  a.panel.remove();
  if (a.btn.isConnected) {
    a.btn.classList.remove('active');
    a.btn.setAttribute('aria-pressed', 'false');
  }
}

/** Vero mentre un canto sta scorrendo. */
export function scorrimentoAttivo() {
  return Boolean(attivo);
}

function avvia(songId, btn) {
  fermaScorrimento();
  if (document.documentElement.scrollHeight - window.innerHeight < 40) {
    toast('Il canto è già tutto sullo schermo');
    return;
  }
  const a = {
    songId, btn,
    livello: velocita(songId),
    raf: 0, ultimo: 0, resto: 0,
    pausa: false, ripresa: 0,
  };

  const valore = el('span', { class: 'as-val' });
  const paintVal = () => { valore.textContent = String(a.livello); };
  const cambia = (d) => {
    a.livello = Math.max(VEL_MIN, Math.min(VEL_MAX, a.livello + d));
    store.setPref(chiave(songId), a.livello);
    paintVal();
  };
  paintVal();

  a.panel = el('div', { class: 'autoscroll', role: 'group', 'aria-label': 'Scorrimento automatico' }, [
    el('button', { type: 'button', 'aria-label': 'Più lento', text: '−', onclick: () => cambia(-1) }),
    el('span', { class: 'as-label' }, [el('small', { text: 'velocità' }), valore]),
    el('button', { type: 'button', 'aria-label': 'Più veloce', text: '+', onclick: () => cambia(1) }),
    el('button', { type: 'button', class: 'as-stop', 'aria-label': 'Ferma lo scorrimento', html: '&#9632;', onclick: fermaScorrimento }),
  ]);
  document.body.append(a.panel);

  // il dito sul pannello serve a premere i pulsanti, non a mettere in pausa
  const fuoriPannello = (e) => !(e.target instanceof Node && a.panel.contains(e.target));
  a.onDown = (e) => {
    if (!fuoriPannello(e)) return;
    a.pausa = true;
    clearTimeout(a.ripresa);
  };
  a.onUp = (e) => {
    if (!fuoriPannello(e)) return;
    clearTimeout(a.ripresa);
    a.ripresa = setTimeout(() => { a.pausa = false; a.ultimo = 0; }, RIPRESA_MS);
  };
  a.onWheel = () => {
    a.pausa = true;
    clearTimeout(a.ripresa);
    a.ripresa = setTimeout(() => { a.pausa = false; a.ultimo = 0; }, RIPRESA_MS);
  };
  a.onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); fermaScorrimento(); }
  };
  window.addEventListener('touchstart', a.onDown, { passive: true });
  window.addEventListener('touchend', a.onUp, { passive: true });
  window.addEventListener('touchcancel', a.onUp, { passive: true });
  window.addEventListener('wheel', a.onWheel, { passive: true });
  document.addEventListener('keydown', a.onKey, true);

  const passo = (t) => {
    if (attivo !== a) return;
    if (!a.btn.isConnected) { fermaScorrimento(); return; } // si è cambiata pagina
    if (!a.pausa && !document.querySelector('.modal-backdrop')) {
      if (a.ultimo) {
        // il resto accumula le frazioni di pixel: a velocità basse un frame
        // vale meno di un pixel, e arrotondando non si muoverebbe mai
        a.resto += pxAlSecondo(a.livello) * Math.min(0.1, (t - a.ultimo) / 1000);
        const px = Math.floor(a.resto);
        if (px > 0) {
          a.resto -= px;
          window.scrollBy(0, px);
        }
        const fine = document.documentElement.scrollHeight - window.innerHeight - 2;
        if (window.scrollY >= fine) { fermaScorrimento(); return; }
      }
      a.ultimo = t;
    } else {
      a.ultimo = 0;
    }
    a.raf = requestAnimationFrame(passo);
  };

  attivo = a;
  btn.classList.add('active');
  btn.setAttribute('aria-pressed', 'true');
  a.raf = requestAnimationFrame(passo);
}
