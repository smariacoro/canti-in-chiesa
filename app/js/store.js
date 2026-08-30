// Stato dell'app: catalogo di base (in bundle) + modifiche locali + scalette.
// Tutto vive in localStorage, così l'app è pienamente utilizzabile senza rete;
// la sincronizzazione è un livello opzionale sopra questo (vedi sync.js).

const KEY = 'cic.state.v2';

export const MOMENTS = [
  { id: 'ingresso',   label: 'Ingresso' },
  { id: 'gloria',     label: 'Gloria' },
  { id: 'vangelo',    label: 'Al Vangelo' },
  { id: 'offertorio', label: 'Offertorio' },
  { id: 'santo',      label: 'Santo' },
  { id: 'comunione',  label: 'Comunione' },
  { id: 'finale',     label: 'Finale' },
];

export const SEASONS = [
  { id: 'avvento',    label: 'Avvento' },
  { id: 'natale',     label: 'Natale' },
  { id: 'quaresima',  label: 'Quaresima' },
  { id: 'palme',      label: 'Palme' },
  { id: 'pasqua',     label: 'Pasqua' },
  { id: 'pentecoste', label: 'Pentecoste' },
  { id: 'ordinario',  label: 'Tempo ordinario' },
  { id: 'mariano',    label: 'Mariano' },
  { id: 'santi',      label: 'Santi e patroni' },
  { id: 'defunti',    label: 'Defunti' },
];

export const momentLabel = (id) => (MOMENTS.find((m) => m.id === id) || {}).label || id;
export const seasonLabel = (id) => (SEASONS.find((s) => s.id === id) || {}).label || id;

const momentRank = (id) => {
  const i = MOMENTS.findIndex((m) => m.id === id);
  return i < 0 ? 99 : i;
};

/** Confronto testuale insensibile ad accenti e maiuscole, per ricerca e ordinamento. */
export function fold(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, "'")
    .toLowerCase();
}

const collator = new Intl.Collator('it', { sensitivity: 'base', numeric: true });
export const byTitle = (a, b) => collator.compare(a.title, b.title);

export function uid(prefix = 'x') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

const nowIso = () => new Date().toISOString();

const DEFAULT_PREFS = {
  theme: 'auto',
  uiScale: 1,
  songScale: 1,
  showChords: true,
  user: null,
};

function emptyState() {
  return { songs: {}, setlists: {}, hidden: [], prefs: { ...DEFAULT_PREFS }, pulledAt: null };
}

class Store extends EventTarget {
  constructor() {
    super();
    this.base = [];
    this.state = emptyState();
    this._merged = null;
  }

  // ---------------------------------------------------------------- caricamento

  async init() {
    this._load();
    const res = await fetch('data/songs.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('Catalogo non disponibile');
    const data = await res.json();
    this.base = data.songs.map(normalizeSong);
    this._merged = null;
    this._emit();
  }

  _load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.state = { ...emptyState(), ...JSON.parse(raw) };
      this.state.prefs = { ...DEFAULT_PREFS, ...(this.state.prefs || {}) };
    } catch (e) {
      console.warn('Stato locale illeggibile, riparto da zero', e);
      this.state = emptyState();
    }
  }

  _save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch (e) {
      console.error('Salvataggio locale fallito', e);
      this.dispatchEvent(new CustomEvent('storage-full'));
    }
  }

  _emit() {
    this._merged = null;
    this.dispatchEvent(new CustomEvent('change'));
  }

  // -------------------------------------------------------------------- canti

  /** Catalogo di base con sopra le modifiche locali, ordinato per titolo. */
  get songs() {
    if (!this._merged) {
      const map = new Map();
      for (const s of this.base) map.set(s.id, s);
      for (const [id, s] of Object.entries(this.state.songs)) map.set(id, normalizeSong(s));
      for (const id of this.state.hidden) map.delete(id);
      this._merged = [...map.values()].sort(byTitle);
    }
    return this._merged;
  }

  song(id) {
    return this.songs.find((s) => s.id === id) || null;
  }

  /** Canti di un momento della messa, in ordine alfabetico di titolo. */
  byMoment(moment) {
    return this.songs.filter((s) => s.moments.includes(moment)).sort(byTitle);
  }

  saveSong(song) {
    const s = normalizeSong({ ...song, updatedAt: nowIso(), dirty: true });
    this.state.songs[s.id] = s;
    this.state.hidden = this.state.hidden.filter((h) => h !== s.id);
    this._save();
    this._emit();
    return s;
  }

  /** Aggiorna solo alcuni campi, partendo dalla versione attualmente visibile. */
  patchSong(id, patch) {
    const cur = this.song(id);
    if (!cur) return null;
    return this.saveSong({ ...cur, ...patch });
  }

  newSong(fields = {}) {
    const title = (fields.title || 'Nuovo canto').trim();
    return this.saveSong({
      id: uid('c'),
      title,
      moments: fields.moments || [],
      seasons: fields.seasons || [],
      key: fields.key || null,
      bpm: fields.bpm || null,
      meter: fields.meter || 4,
      capo: 0,
      sections: fields.sections || [],
      organ: null,
      notes: '',
      custom: true,
    });
  }

  deleteSong(id) {
    const isBase = this.base.some((s) => s.id === id);
    delete this.state.songs[id];
    if (isBase && !this.state.hidden.includes(id)) this.state.hidden.push(id);
    this._save();
    this._emit();
  }

  /** Ripristina un canto di base alla versione originale del catalogo. */
  resetSong(id) {
    if (!this.base.some((s) => s.id === id)) return false;
    delete this.state.songs[id];
    this.state.hidden = this.state.hidden.filter((h) => h !== id);
    this._save();
    this._emit();
    return true;
  }

  isModified(id) {
    return Boolean(this.state.songs[id]) && this.base.some((s) => s.id === id);
  }

  search(query, { moment = null, seasons = [] } = {}) {
    const q = fold(query).trim();
    const terms = q ? q.split(/\s+/) : [];
    let list = this.songs;
    if (moment) list = list.filter((s) => s.moments.includes(moment));
    if (seasons.length) list = list.filter((s) => seasons.every((x) => s.seasons.includes(x)));
    if (!terms.length) return list;
    return list
      .map((s) => ({ s, score: score(s, terms) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || byTitle(a.s, b.s))
      .map((r) => r.s);
  }

  // ----------------------------------------------------------------- scalette

  get setlists() {
    return Object.values(this.state.setlists)
      .filter((s) => !s.deleted)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }

  setlist(id) {
    const s = this.state.setlists[id];
    return s && !s.deleted ? s : null;
  }

  saveSetlist(sl) {
    const rec = {
      id: sl.id || uid('s'),
      date: sl.date || new Date().toISOString().slice(0, 10),
      title: (sl.title || '').trim(),
      items: (sl.items || []).map((i) => ({ songId: i.songId, moment: i.moment || null, note: i.note || '' })),
      notes: sl.notes || '',
      deleted: false,
      updatedAt: nowIso(),
      dirty: true,
    };
    this.state.setlists[rec.id] = rec;
    this._save();
    this._emit();
    return rec;
  }

  deleteSetlist(id) {
    const cur = this.state.setlists[id];
    if (!cur) return;
    // tombstone: serve a propagare la cancellazione agli altri dispositivi
    this.state.setlists[id] = { ...cur, deleted: true, items: [], updatedAt: nowIso(), dirty: true };
    this._save();
    this._emit();
  }

  /** La prossima scaletta a partire da oggi (o la più recente passata). */
  get upcomingSetlist() {
    const today = new Date().toISOString().slice(0, 10);
    const future = this.setlists.filter((s) => s.date >= today);
    return future.length ? future[future.length - 1] : this.setlists[0] || null;
  }

  // ---------------------------------------------------------- preferenze e sync

  get prefs() { return this.state.prefs; }

  setPref(key, value) {
    this.state.prefs[key] = value;
    this._save();
    this.dispatchEvent(new CustomEvent('prefs'));
  }

  get pending() {
    return [
      ...Object.values(this.state.songs).filter((s) => s.dirty),
      ...Object.values(this.state.setlists).filter((s) => s.dirty),
    ];
  }

  markClean(kind, id, updatedAt) {
    const bag = kind === 'song' ? this.state.songs : this.state.setlists;
    if (bag[id]) {
      bag[id].dirty = false;
      if (updatedAt) bag[id].updatedAt = updatedAt;
      this._save();
    }
  }

  /** Applica record arrivati dal server, senza sovrascrivere modifiche locali più recenti. */
  applyRemote({ songs = [], setlists = [], hidden = null, pulledAt = null }) {
    let touched = false;
    for (const r of songs) {
      const cur = this.state.songs[r.id];
      if (cur && cur.dirty && (cur.updatedAt || '') > (r.updatedAt || '')) continue;
      this.state.songs[r.id] = { ...normalizeSong(r), dirty: false };
      touched = true;
    }
    for (const r of setlists) {
      const cur = this.state.setlists[r.id];
      if (cur && cur.dirty && (cur.updatedAt || '') > (r.updatedAt || '')) continue;
      this.state.setlists[r.id] = { ...r, dirty: false };
      touched = true;
    }
    if (Array.isArray(hidden)) { this.state.hidden = hidden; touched = true; }
    if (pulledAt) this.state.pulledAt = pulledAt;
    if (touched) { this._save(); this._emit(); }
    return touched;
  }

  exportAll() {
    return {
      app: 'canti-in-chiesa',
      version: 2,
      exportedAt: nowIso(),
      songs: Object.values(this.state.songs),
      setlists: Object.values(this.state.setlists),
      hidden: this.state.hidden,
    };
  }

  importAll(data, { replace = false } = {}) {
    if (!data || data.app !== 'canti-in-chiesa') throw new Error('File non riconosciuto');
    if (replace) { this.state.songs = {}; this.state.setlists = {}; this.state.hidden = []; }
    let n = 0;
    for (const s of data.songs || []) { this.state.songs[s.id] = { ...normalizeSong(s), dirty: true }; n++; }
    for (const s of data.setlists || []) { this.state.setlists[s.id] = { ...s, dirty: true }; n++; }
    if (Array.isArray(data.hidden)) this.state.hidden = [...new Set([...this.state.hidden, ...data.hidden])];
    this._save();
    this._emit();
    return n;
  }
}

function score(song, terms) {
  const title = fold(song.title);
  const words = title.split(/\s+/);
  const lyrics = fold(songText(song));
  let total = 0;
  for (const t of terms) {
    if (title === t) total += 100;
    else if (words.some((w) => w.startsWith(t))) total += 40;
    else if (title.includes(t)) total += 20;
    else if (lyrics.includes(t)) total += 5;
    else return 0;
  }
  return total;
}

let textCache = new WeakMap();
export function songText(song) {
  let t = textCache.get(song);
  if (t === undefined) {
    t = (song.sections || [])
      .flatMap((sec) => sec.lines.map((l) => l.s.map((g) => g.t || '').join('')))
      .join('\n');
    textCache.set(song, t);
  }
  return t;
}

export function normalizeSong(s) {
  return {
    meter: 4,
    capo: 0,
    seasons: [],
    moments: [],
    sections: [],
    organ: null,
    notes: '',
    bpm: null,
    key: null,
    ...s,
    moments: [...(s.moments || [])].sort((a, b) => momentRank(a) - momentRank(b)),
  };
}

export const store = new Store();
