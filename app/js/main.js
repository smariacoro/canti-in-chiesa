// Avvio dell'app: preferenze, rotte, service worker, stato di sincronizzazione.

import { $, el, toast } from './ui.js';
import { store } from './store.js';
import { sync, isConfigured } from './sync.js';
import { startRouter, parseHash, navigate } from './router.js';
import { songsView } from './views/songs.js';
import { songView, leaveSong } from './views/song.js';
import { setlistsView, setlistView } from './views/setlists.js';
import { printView } from './views/print.js';
import { settingsView, applyTheme } from './views/settings.js';
import { PARISH_NAME } from '../config.js';

const view = $('#view');
let lastPath = '';

function applyPrefs() {
  applyTheme();
  document.documentElement.style.setProperty('--ui-scale', store.prefs.uiScale || 1);
  document.documentElement.style.setProperty('--song-scale', store.prefs.songScale || 1);
}

function route({ path, params }) {
  const [head, arg] = path;
  const key = path.join('/');

  if (lastPath.startsWith('canto/') && !key.startsWith('canto/')) leaveSong();
  const changedScreen = key !== lastPath;
  lastPath = key;

  switch (head) {
    case 'canto':
      songView(view, params, arg);
      break;
    case 'scalette':
      setlistsView(view, params);
      break;
    case 'scaletta':
      setlistView(view, params, arg);
      break;
    case 'stampa':
      printView(view, params);
      break;
    case 'impostazioni':
      settingsView(view);
      break;
    case 'canti':
    default:
      songsView(view, params);
      break;
  }

  const tab = { canto: 'canti', canti: 'canti', scalette: 'scalette', scaletta: 'scalette', stampa: 'stampa' }[head] || 'canti';
  for (const a of document.querySelectorAll('.tabbar a')) {
    a.toggleAttribute('aria-current', a.dataset.tab === tab);
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
  }
  document.querySelector('.tabbar').classList.toggle('hidden', head === 'impostazioni');

  if (changedScreen) {
    window.scrollTo(0, 0);
    view.focus({ preventScroll: true });
  }
}

function paintSyncDot() {
  const dot = $('#sync-dot');
  const state = !isConfigured() ? 'offline' : sync.state === 'signed-out' ? 'offline' : sync.state;
  dot.dataset.state = { disabled: 'offline', 'signed-out': 'offline' }[state] || state;
  $('#btn-sync').title = {
    ok: 'Sincronizzato', syncing: 'Sincronizzazione…', pending: 'Modifiche in attesa',
    offline: 'Solo su questo dispositivo', error: 'Sincronizzazione non riuscita',
  }[dot.dataset.state] || 'Sincronizzazione';
}

async function boot() {
  applyPrefs();
  $('#appbar-sub').textContent = PARISH_NAME;

  try {
    await store.init();
  } catch (e) {
    $('#splash').remove();
    view.append(el('div', { class: 'empty' }, [
      el('strong', { text: 'Catalogo non caricato' }),
      el('span', { text: 'Ricarica la pagina. Se il problema resta, controlla di aver aperto l’app tramite un server (non con doppio clic sul file).' }),
    ]));
    console.error(e);
    return;
  }

  store.addEventListener('prefs', applyPrefs);
  store.addEventListener('storage-full', () => toast('Memoria del browser piena: esporta un backup e azzera le modifiche.', 6000));

  sync.init();
  sync.addEventListener('state', paintSyncDot);
  store.addEventListener('change', paintSyncDot);
  paintSyncDot();

  $('#btn-settings').addEventListener('click', () => navigate('#/impostazioni'));
  $('#btn-sync').addEventListener('click', async () => {
    if (!isConfigured() || !sync.signedIn) { navigate('#/impostazioni'); return; }
    toast(await sync.sync() ? 'Sincronizzato' : 'Sincronizzazione non riuscita');
  });

  // Un canto aperto resta aperto anche riavviando l'app: comodo durante la messa.
  if (!location.hash) navigate('#/canti', { replace: true });
  startRouter(route);

  const splash = $('#splash');
  splash.classList.add('gone');
  setTimeout(() => splash.remove(), 350);

  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            toast('Aggiornamento pronto: chiudi e riapri l’app.', 5000);
          }
        });
      });
    } catch (e) {
      console.warn('Service worker non registrato', e);
    }
  }
}

// Ricalcola la vista quando i dati cambiano da un'altra scheda o dalla sincronia.
let repaintTimer = null;
store.addEventListener('change', () => {
  clearTimeout(repaintTimer);
  repaintTimer = setTimeout(() => {
    const { path } = parseHash();
    // le viste con modali aperte non vanno ridisegnate sotto le mani dell'utente
    if (document.querySelector('.modal-backdrop')) return;
    if (path[0] === 'canti' || path[0] === 'scalette') route(parseHash());
  }, 250);
});

boot();
