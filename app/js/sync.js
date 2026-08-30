// Sincronizzazione con Supabase via REST (nessun SDK da scaricare).
//
// Regole: l'app funziona sempre in locale; la rete è un extra. Le modifiche
// fatte offline restano marcate "dirty" e partono da sole appena c'è campo.
// In caso di conflitto vince la scrittura con updatedAt più recente.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { store } from './store.js';

const AUTH_KEY = 'cic.auth.v1';

export const isConfigured = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

class Sync extends EventTarget {
  constructor() {
    super();
    this.session = null;
    this.state = 'offline';
    this.lastError = null;
    this._busy = false;
    this._queued = false;
  }

  init() {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      if (raw) this.session = JSON.parse(raw);
    } catch (e) { this.session = null; }

    if (!isConfigured()) { this._set('disabled'); return; }
    this._set(this.session ? (navigator.onLine ? 'ok' : 'offline') : 'signed-out');

    window.addEventListener('online', () => this.sync());
    window.addEventListener('offline', () => this._set('offline'));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.sync();
    });
    store.addEventListener('change', () => this._debouncedSync());
    setInterval(() => this.sync(), 5 * 60 * 1000);
    this.sync();
  }

  get user() { return this.session ? this.session.user : null; }
  get signedIn() { return Boolean(this.session && this.session.access_token); }

  _set(state, error = null) {
    this.state = state;
    this.lastError = error;
    this.dispatchEvent(new CustomEvent('state', { detail: { state, error } }));
  }

  _debouncedSync() {
    clearTimeout(this._t);
    this._t = setTimeout(() => this.sync(), 1500);
  }

  // ------------------------------------------------------------------ chiamate

  async _fetch(path, { method = 'GET', body, headers = {}, auth = true, retry = true } = {}) {
    const h = {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      ...headers,
    };
    if (auth && this.session) h.Authorization = `Bearer ${this.session.access_token}`;

    const res = await fetch(SUPABASE_URL.replace(/\/$/, '') + path, {
      method,
      headers: h,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (res.status === 401 && auth && retry && this.session && this.session.refresh_token) {
      const ok = await this._refresh();
      if (ok) return this._fetch(path, { method, body, headers, auth, retry: false });
    }
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).message || (await res.text()); } catch (e) { /* corpo vuoto */ }
      throw new Error(detail || `Errore ${res.status}`);
    }
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  // ---------------------------------------------------------------- autenticazione

  async signIn(email, password) {
    const data = await this._fetch('/auth/v1/token?grant_type=password', {
      method: 'POST', body: { email, password }, auth: false,
    });
    this._store(data);
    await this.sync();
    return this.user;
  }

  async signUp(email, password, name) {
    const data = await this._fetch('/auth/v1/signup', {
      method: 'POST',
      body: { email, password, data: { name: name || '' } },
      auth: false,
    });
    // con la conferma email attiva la sessione non arriva subito
    if (data && data.access_token) { this._store(data); await this.sync(); }
    return data;
  }

  async signOut() {
    try { await this._fetch('/auth/v1/logout', { method: 'POST' }); } catch (e) { /* offline: pazienza */ }
    this.session = null;
    localStorage.removeItem(AUTH_KEY);
    this._set('signed-out');
  }

  async resetPassword(email) {
    return this._fetch('/auth/v1/recover', { method: 'POST', body: { email }, auth: false });
  }

  _store(data) {
    if (!data || !data.access_token) return;
    this.session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      user: data.user ? { id: data.user.id, email: data.user.email, name: (data.user.user_metadata || {}).name || '' } : null,
    };
    localStorage.setItem(AUTH_KEY, JSON.stringify(this.session));
    this._set('ok');
  }

  async _refresh() {
    try {
      const data = await this._fetch('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST', body: { refresh_token: this.session.refresh_token }, auth: false,
      });
      this._store(data);
      return true;
    } catch (e) {
      this.session = null;
      localStorage.removeItem(AUTH_KEY);
      this._set('signed-out');
      return false;
    }
  }

  // ------------------------------------------------------------------- sync

  async sync() {
    if (!isConfigured() || !this.signedIn) return false;
    if (!navigator.onLine) { this._set('offline'); return false; }
    if (this._busy) { this._queued = true; return false; }

    this._busy = true;
    this._set('syncing');
    try {
      await this._push();
      await this._pull();
      this._set(store.pending.length ? 'pending' : 'ok');
      return true;
    } catch (e) {
      console.warn('Sincronizzazione fallita', e);
      this._set('error', e.message);
      return false;
    } finally {
      this._busy = false;
      if (this._queued) { this._queued = false; setTimeout(() => this.sync(), 400); }
    }
  }

  async _push() {
    const songs = Object.values(store.state.songs).filter((s) => s.dirty);
    const setlists = Object.values(store.state.setlists).filter((s) => s.dirty);

    if (songs.length) {
      const rows = songs.map((s) => ({ id: s.id, data: stripLocal(s), updated_at: s.updatedAt }));
      await this._upsert('songs', rows);
      songs.forEach((s) => store.markClean('song', s.id));
    }
    if (setlists.length) {
      const rows = setlists.map((s) => ({ id: s.id, data: stripLocal(s), updated_at: s.updatedAt }));
      await this._upsert('setlists', rows);
      setlists.forEach((s) => store.markClean('setlist', s.id));
    }
    await this._upsert('app_state', [{
      key: 'hidden', data: { ids: store.state.hidden }, updated_at: new Date().toISOString(),
    }]);
  }

  _upsert(table, rows) {
    return this._fetch(`/rest/v1/${table}`, {
      method: 'POST',
      body: rows,
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    });
  }

  async _pull() {
    const since = store.state.pulledAt || '1970-01-01T00:00:00Z';
    const q = `?select=id,data,updated_at&updated_at=gt.${encodeURIComponent(since)}&order=updated_at.asc`;
    const [songRows, setlistRows, stateRows] = await Promise.all([
      this._fetch(`/rest/v1/songs${q}`),
      this._fetch(`/rest/v1/setlists${q}`),
      this._fetch('/rest/v1/app_state?select=key,data,updated_at'),
    ]);

    const stamps = [
      ...(songRows || []).map((r) => r.updated_at),
      ...(setlistRows || []).map((r) => r.updated_at),
    ].filter(Boolean).sort();

    const hiddenRow = (stateRows || []).find((r) => r.key === 'hidden');

    store.applyRemote({
      songs: (songRows || []).map((r) => ({ ...r.data, id: r.id, updatedAt: r.updated_at })),
      setlists: (setlistRows || []).map((r) => ({ ...r.data, id: r.id, updatedAt: r.updated_at })),
      hidden: hiddenRow && Array.isArray(hiddenRow.data.ids) ? hiddenRow.data.ids : null,
      pulledAt: stamps.length ? stamps[stamps.length - 1] : store.state.pulledAt,
    });
  }
}

function stripLocal(rec) {
  const { dirty, ...rest } = rec;
  return rest;
}

export const sync = new Sync();
