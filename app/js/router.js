// Router minimale basato sull'hash: funziona anche aperto da file:// e su
// GitHub Pages senza configurazione lato server.

let onRoute = () => {};
let depth = 0;

export function parseHash(hash = location.hash) {
  const raw = String(hash || '').replace(/^#/, '') || '/canti';
  const [pathPart, queryPart] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean);
  return {
    path: parts.map(decodeURIComponent),
    params: new URLSearchParams(queryPart || ''),
  };
}

export function navigate(hash, { replace = false } = {}) {
  if (location.hash === hash) { onRoute(parseHash()); return; }
  if (replace) history.replaceState(null, '', hash);
  else { depth++; location.hash = hash; }
}

/** Torna indietro, ma senza uscire dall'app se si è entrati da un link diretto. */
export function back(fallback = '#/canti') {
  if (depth > 0) { depth--; history.back(); }
  else navigate(fallback, { replace: true });
}

export function startRouter(handler) {
  onRoute = handler;
  window.addEventListener('hashchange', () => onRoute(parseHash()));
  onRoute(parseHash());
}
