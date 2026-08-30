// Impostazioni: aspetto, zoom dei comandi, account condiviso, dati.

import { el, clear, toast, modal, confirmDialog, download, pickFile } from '../ui.js';
import { store } from '../store.js';
import { sync, isConfigured } from '../sync.js';
import { navigate } from '../router.js';
import { editSong } from './song.js';
import { PARISH_NAME } from '../../config.js';

export function settingsView(root) {
  clear(root);
  root.classList.remove('wide');
  const repaint = () => settingsView(root);

  root.append(el('div', { style: 'display:flex;align-items:center;gap:.4rem;margin-bottom:.8rem' }, [
    el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Indietro', html: '&#8592;', onclick: () => history.back() }),
    el('h2', { text: 'Impostazioni', style: 'flex:1;font-size:1.2rem' }),
  ]));

  // ------------------------------------------------------------------ aspetto
  root.append(group('Aspetto', [
    field('Tema', chips(
      [['auto', 'Automatico'], ['light', 'Chiaro'], ['dark', 'Scuro']],
      store.prefs.theme,
      (v) => { store.setPref('theme', v); applyTheme(); repaint(); },
    )),
    field('Dimensione dei comandi', scaleRow('uiScale', (v) => {
      document.documentElement.style.setProperty('--ui-scale', v);
    })),
    field('Dimensione del testo dei canti', scaleRow('songScale', (v) => {
      document.documentElement.style.setProperty('--song-scale', v);
    })),
  ]));

  // ------------------------------------------------------------------ account
  const accountRows = [];
  if (!isConfigured()) {
    accountRows.push(el('p', { style: 'color:var(--ink-soft);font-size:.88rem' },
      ['La condivisione non è ancora attiva. Le scalette e le modifiche restano su questo dispositivo. ',
        el('br'),
        el('span', { style: 'color:var(--ink-faint)', text: 'Per attivarla, inserisci i dati del progetto Supabase in config.js (istruzioni nel file).' })]));
  } else if (sync.signedIn) {
    const u = sync.user || {};
    accountRows.push(el('div', { style: 'display:flex;align-items:center;gap:.7rem;margin-bottom:.7rem' }, [
      el('div', {
        style: 'width:2.4rem;height:2.4rem;border-radius:50%;background:var(--accent-soft);color:var(--chord);display:grid;place-items:center;font-weight:700',
        text: (u.name || u.email || '?').slice(0, 1).toUpperCase(),
      }),
      el('div', { style: 'flex:1;min-width:0' }, [
        el('div', { style: 'font-weight:650', text: u.name || 'Corista' }),
        el('div', { style: 'font-size:.8rem;color:var(--ink-faint)', text: u.email || '' }),
      ]),
    ]));
    accountRows.push(el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn', type: 'button', text: 'Sincronizza ora', onclick: async () => { toast(await sync.sync() ? 'Sincronizzato' : 'Sincronizzazione non riuscita'); repaint(); } }),
      el('button', { class: 'btn ghost', type: 'button', text: 'Esci', onclick: async () => { await sync.signOut(); toast('Uscito'); repaint(); } }),
    ]));
    accountRows.push(el('p', {
      style: 'font-size:.8rem;color:var(--ink-faint);margin-top:.6rem',
      text: syncLabel(),
    }));
  } else {
    accountRows.push(el('p', { style: 'color:var(--ink-soft);font-size:.88rem;margin-bottom:.7rem', text: 'Accedi per condividere scalette e modifiche con tutto il coro.' }));
    accountRows.push(el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn primary', type: 'button', text: 'Accedi', onclick: () => authDialog('signin', repaint) }),
      el('button', { class: 'btn', type: 'button', text: 'Crea account', onclick: () => authDialog('signup', repaint) }),
    ]));
  }
  root.append(group('Coro condiviso', accountRows));

  // --------------------------------------------------------------------- dati
  root.append(group('Canti e dati', [
    el('div', { class: 'btn-row' }, [
      el('button', {
        class: 'btn', type: 'button', html: '+&nbsp; Nuovo canto',
        onclick: () => editSong({ title: '', moments: [], seasons: [], sections: [] }, () => navigate('#/canti')),
      }),
      el('button', {
        class: 'btn', type: 'button', text: 'Esporta un backup',
        onclick: () => {
          const data = store.exportAll();
          download(`canti-in-chiesa-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2));
          toast('Backup esportato');
        },
      }),
      el('button', {
        class: 'btn', type: 'button', text: 'Importa un backup',
        onclick: async () => {
          const f = await pickFile();
          if (!f) return;
          try {
            const n = store.importAll(JSON.parse(f.text));
            toast(`Importati ${n} elementi`);
            repaint();
          } catch (e) {
            toast(`Import non riuscito: ${e.message}`);
          }
        },
      }),
    ]),
    el('p', {
      style: 'font-size:.8rem;color:var(--ink-faint);margin-top:.6rem',
      text: `${store.songs.length} canti · ${store.setlists.length} scalette · ${store.pending.length} modifiche da sincronizzare`,
    }),
    el('div', { class: 'btn-row', style: 'margin-top:.7rem' }, [
      el('button', {
        class: 'btn danger small', type: 'button', text: 'Azzera modifiche locali',
        onclick: async () => {
          if (await confirmDialog('Azzerare?', 'Tutte le modifiche ai canti, le scalette e le preferenze salvate su questo dispositivo verranno cancellate. Il catalogo originale resta.', { danger: true, okLabel: 'Azzera' })) {
            localStorage.removeItem('cic.state.v2');
            location.reload();
          }
        },
      }),
    ]),
  ]));

  // -------------------------------------------------------------------- info
  root.append(group('Informazioni', [
    el('p', { style: 'font-size:.88rem;color:var(--ink-soft)' }, [
      el('strong', { text: 'Canti in Chiesa' }), el('br'),
      PARISH_NAME, el('br'),
      el('span', { style: 'color:var(--ink-faint)', text: 'Funziona anche senza rete: i canti sono salvati sul dispositivo.' }),
    ]),
    el('div', { class: 'btn-row', style: 'margin-top:.7rem' }, [
      el('button', {
        class: 'btn small ghost', type: 'button', text: 'Cerca aggiornamenti',
        onclick: async () => {
          if (!('serviceWorker' in navigator)) return toast('Non supportato');
          const reg = await navigator.serviceWorker.getRegistration();
          if (!reg) return toast('Nessun aggiornamento');
          await reg.update();
          toast('Controllo completato');
        },
      }),
    ]),
  ]));
}

function syncLabel() {
  const map = {
    ok: 'Tutto sincronizzato.',
    syncing: 'Sincronizzazione in corso…',
    pending: 'Ci sono modifiche in attesa di essere inviate.',
    offline: 'Nessuna rete: le modifiche partiranno appena torna il campo.',
    error: `Ultimo tentativo non riuscito: ${sync.lastError || ''}`,
    'signed-out': 'Non hai effettuato l’accesso.',
    disabled: 'Sincronizzazione non configurata.',
  };
  return map[sync.state] || '';
}

function group(title, children) {
  return el('section', { style: 'margin-bottom:1.5rem' }, [
    el('div', { class: 'section-title', style: 'margin-left:.1rem' }, [el('span', { text: title })]),
    el('div', { class: 'card', style: 'padding:.9rem' }, children),
  ]);
}

function field(label, control) {
  return el('div', { style: 'margin-bottom:.9rem' }, [
    el('div', { style: 'font-size:.8rem;font-weight:650;color:var(--ink-soft);margin-bottom:.35rem', text: label }),
    control,
  ]);
}

function chips(options, current, onPick) {
  return el('div', { class: 'chips' }, options.map(([id, label]) => el('button', {
    class: 'chip', type: 'button', text: label,
    'aria-pressed': current === id ? 'true' : 'false',
    onclick: () => onPick(id),
  })));
}

function scaleRow(key, apply) {
  const readout = el('span', { style: 'min-width:3.5rem;text-align:center;font-weight:700;font-size:.85rem' });
  const paint = () => { readout.textContent = `${Math.round(store.prefs[key] * 100)}%`; };
  const bump = (delta) => {
    const v = Math.max(0.7, Math.min(2.6, +(store.prefs[key] + delta).toFixed(2)));
    store.setPref(key, v);
    apply(v);
    paint();
  };
  paint();
  return el('div', { style: 'display:flex;align-items:center;gap:.5rem' }, [
    el('button', { class: 'btn small', type: 'button', text: '−', 'aria-label': 'Riduci', onclick: () => bump(-0.1) }),
    readout,
    el('button', { class: 'btn small', type: 'button', text: '+', 'aria-label': 'Aumenta', onclick: () => bump(0.1) }),
    el('button', { class: 'btn small ghost', type: 'button', text: 'Ripristina', onclick: () => { store.setPref(key, 1); apply(1); paint(); } }),
  ]);
}

export function applyTheme() {
  const t = store.prefs.theme;
  const root = document.documentElement;
  if (t === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
}

function authDialog(mode, repaint) {
  modal(mode === 'signup' ? 'Crea account' : 'Accedi', (close) => {
    const name = el('input', { class: 'input', placeholder: 'Come ti chiami', autocomplete: 'name' });
    const email = el('input', { class: 'input', type: 'email', placeholder: 'email@esempio.it', autocomplete: 'email', inputmode: 'email' });
    const pass = el('input', { class: 'input', type: 'password', placeholder: 'Password', autocomplete: mode === 'signup' ? 'new-password' : 'current-password' });
    const msg = el('p', { style: 'font-size:.85rem;color:var(--warn);min-height:1.2rem' });
    const submit = el('button', { class: 'btn primary', type: 'submit', text: mode === 'signup' ? 'Crea account' : 'Accedi' });

    const form = el('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        msg.textContent = '';
        submit.disabled = true;
        try {
          if (mode === 'signup') {
            const res = await sync.signUp(email.value.trim(), pass.value, name.value.trim());
            if (res && !res.access_token) {
              msg.style.color = 'var(--ok)';
              msg.textContent = 'Ti abbiamo inviato una email di conferma. Aprila, poi accedi.';
              submit.disabled = false;
              return;
            }
            toast(`Benvenuto${name.value ? `, ${name.value.trim()}` : ''}`);
          } else {
            await sync.signIn(email.value.trim(), pass.value);
            toast('Accesso effettuato');
          }
          close();
          repaint();
        } catch (err) {
          msg.style.color = 'var(--warn)';
          msg.textContent = traduci(err.message);
          submit.disabled = false;
        }
      },
    }, [
      mode === 'signup' ? el('label', { class: 'field' }, [el('span', { text: 'Nome' }), name]) : null,
      el('label', { class: 'field' }, [el('span', { text: 'Email' }), email]),
      el('label', { class: 'field' }, [el('span', { text: 'Password' }), pass]),
      msg,
      el('div', { class: 'modal-foot' }, [
        mode === 'signin'
          ? el('button', {
            class: 'btn ghost small', type: 'button', text: 'Password dimenticata',
            onclick: async () => {
              if (!email.value.trim()) { msg.textContent = 'Scrivi prima la tua email.'; return; }
              try { await sync.resetPassword(email.value.trim()); msg.style.color = 'var(--ok)'; msg.textContent = 'Email di recupero inviata.'; }
              catch (e2) { msg.textContent = traduci(e2.message); }
            },
          })
          : null,
        el('button', { class: 'btn ghost', type: 'button', text: 'Annulla', onclick: () => close() }),
        submit,
      ]),
    ]);
    return form;
  });
}

/** Aperta quando si torna dall'email di recupero password. */
export function newPasswordDialog() {
  return modal('Scegli una nuova password', (close) => {
    const pass = el('input', { class: 'input', type: 'password', autocomplete: 'new-password', placeholder: 'Almeno 6 caratteri' });
    const msg = el('p', { style: 'font-size:.85rem;color:var(--warn);min-height:1.2rem' });
    const submit = el('button', { class: 'btn primary', type: 'submit', text: 'Salva password' });

    return el('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        msg.textContent = '';
        submit.disabled = true;
        try {
          await sync.setPassword(pass.value);
          toast('Password aggiornata');
          close(true);
        } catch (err) {
          msg.textContent = traduci(err.message);
          submit.disabled = false;
        }
      },
    }, [
      el('p', { style: 'color:var(--ink-soft);margin-bottom:.8rem', text: 'Sei entrato dal link ricevuto per email. Imposta la password che userai d’ora in poi.' }),
      el('label', { class: 'field' }, [el('span', { text: 'Nuova password' }), pass]),
      msg,
      el('div', { class: 'modal-foot' }, [
        el('button', { class: 'btn ghost', type: 'button', text: 'Più tardi', onclick: () => close(false) }),
        submit,
      ]),
    ]);
  });
}

function traduci(message = '') {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return 'Email o password non corretti.';
  if (m.includes('already registered')) return 'Questa email è già registrata: prova ad accedere.';
  if (m.includes('password')) return 'La password deve avere almeno 6 caratteri.';
  if (m.includes('failed to fetch')) return 'Nessuna connessione al server.';
  return message || 'Qualcosa è andato storto.';
}
