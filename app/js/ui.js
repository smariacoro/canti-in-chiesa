// Piccoli helper condivisi: costruzione DOM, modali, toast, date in italiano.

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k in node && k !== 'list' && typeof v !== 'object') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ---------------------------------------------------------------------- toast

export function toast(message, ms = 2200) {
  const root = $('#toast-root');
  const node = el('div', { class: 'toast', text: message });
  root.append(node);
  setTimeout(() => {
    node.style.opacity = '0';
    node.style.transition = 'opacity .2s';
    setTimeout(() => node.remove(), 220);
  }, ms);
}

// --------------------------------------------------------------------- modali

let openModals = 0;

/**
 * Apre un pannello modale. `build(close)` riceve la funzione di chiusura e
 * restituisce il contenuto. Risolve con il valore passato a close().
 */
export function modal(title, build, { wide = false } = {}) {
  return new Promise((resolve) => {
    const root = $('#modal-root');
    const backdrop = el('div', { class: 'modal-backdrop' });
    const panel = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
    if (wide) panel.style.maxWidth = '860px';

    let done = false;
    const close = (value) => {
      if (done) return;
      done = true;
      backdrop.remove();
      openModals--;
      if (!openModals) document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(undefined); };

    const head = el('div', { class: 'modal-head' }, [
      el('h3', { text: title }),
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Chiudi', onclick: () => close(undefined), html: '&times;' }),
    ]);
    panel.append(head);
    const body = build(close);
    if (body) panel.append(body);

    backdrop.append(panel);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(undefined); });
    document.addEventListener('keydown', onKey);
    root.append(backdrop);
    openModals++;
    document.body.style.overflow = 'hidden';

    const focusable = panel.querySelector('input, textarea, select, button.primary');
    if (focusable) setTimeout(() => focusable.focus(), 60);
  });
}

export function confirmDialog(title, message, { danger = false, okLabel = 'Conferma' } = {}) {
  return modal(title, (close) => el('div', {}, [
    el('p', { text: message, style: 'color:var(--ink-soft);margin-bottom:.5rem' }),
    el('div', { class: 'modal-foot' }, [
      el('button', { class: 'btn ghost', type: 'button', text: 'Annulla', onclick: () => close(false) }),
      el('button', {
        class: `btn ${danger ? 'danger' : 'primary'}`, type: 'button', text: okLabel,
        onclick: () => close(true),
      }),
    ]),
  ])).then((v) => v === true);
}

// ----------------------------------------------------------------------- date

const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const DAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

function parseDate(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  return y ? new Date(y, m - 1, d) : null;
}

export function formatDate(iso, { weekday = true } = {}) {
  const dt = parseDate(iso);
  if (!dt) return '—';
  const base = `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
  return weekday ? `${DAYS[dt.getDay()]} ${base}` : base;
}

export function dayMonth(iso) {
  const dt = parseDate(iso);
  if (!dt) return { d: '—', m: '' };
  return { d: String(dt.getDate()), m: MONTHS[dt.getMonth()].slice(0, 3) };
}

export function relativeDay(iso) {
  const dt = parseDate(iso);
  if (!dt) return '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((dt - today) / 86400000);
  if (diff === 0) return 'oggi';
  if (diff === 1) return 'domani';
  if (diff === -1) return 'ieri';
  if (diff > 1 && diff <= 14) return `fra ${diff} giorni`;
  return '';
}

/** Domenica successiva a partire da oggi (data predefinita di una nuova scaletta). */
export function nextSunday() {
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  return d.toISOString().slice(0, 10);
}

// -------------------------------------------------------------------- varie

export function highlight(text, query) {
  if (!query) return document.createTextNode(text);
  const frag = document.createDocumentFragment();
  const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const hay = norm(text);
  const terms = norm(query).split(/\s+/).filter(Boolean);
  const marks = [];
  for (const t of terms) {
    let i = hay.indexOf(t);
    while (i >= 0) { marks.push([i, i + t.length]); i = hay.indexOf(t, i + t.length); }
  }
  if (!marks.length) return document.createTextNode(text);
  marks.sort((a, b) => a[0] - b[0]);
  let pos = 0;
  for (const [a, b] of marks) {
    if (a < pos) continue;
    if (a > pos) frag.append(text.slice(pos, a));
    frag.append(el('mark', { text: text.slice(a, b) }));
    pos = b;
  }
  if (pos < text.length) frag.append(text.slice(pos));
  return frag;
}

export function download(filename, content, type = 'application/json') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickFile(accept = 'application/json') {
  return new Promise((resolve) => {
    const input = el('input', { type: 'file', accept, style: 'display:none' });
    input.addEventListener('change', () => {
      const f = input.files[0];
      input.remove();
      if (!f) return resolve(null);
      const r = new FileReader();
      r.onload = () => resolve({ name: f.name, text: String(r.result) });
      r.onerror = () => resolve(null);
      r.readAsText(f);
    });
    document.body.append(input);
    input.click();
  });
}
