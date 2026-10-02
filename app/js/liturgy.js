// Letture del giorno e canti suggeriti.
//
// Il tempo liturgico si calcola qui, dalla data (serve solo la data di Pasqua).
// Le letture arrivano dal feed pubblico di Evangelizo, che le espone per i siti
// e le app con i testi CEI: risponde direttamente al browser e copre le date
// fra 30 giorni fa e 30 giorni da oggi. Restano in memoria sul dispositivo,
// così una volta scaricate si rivedono anche senza rete.
//
// I suggerimenti confrontano le parole delle letture con quelle dei canti
// (titolo e testo), pesando di più le parole rare: "vigna" dice molto, "Signore"
// quasi nulla perché è ovunque. Sopra si applicano le regole del tempo
// liturgico, che contano più di qualunque somiglianza fra parole.

import { fold, songText } from './store.js';

// ------------------------------------------------------------------- date

function daIso(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function aIso(dt) {
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

function piuGiorni(dt, n) {
  const x = new Date(dt);
  x.setDate(x.getDate() + n);
  return x;
}

const giorniFra = (a, b) => Math.round((b - a) / 86400000);

/** Pasqua (calendario gregoriano, algoritmo anonimo di Meeus). */
function pasqua(anno) {
  const a = anno % 19;
  const b = Math.floor(anno / 100);
  const c = anno % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mese = Math.floor((h + l - 7 * m + 114) / 31);
  const giorno = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(anno, mese - 1, giorno);
}

/** Prima domenica di Avvento: la quarta domenica prima di Natale. */
function inizioAvvento(anno) {
  const natale = new Date(anno, 11, 25);
  const domenicaPrima = piuGiorni(natale, -(natale.getDay() || 7));
  return piuGiorni(domenicaPrima, -21);
}

/** Battesimo del Signore: la domenica dopo l'Epifania, che chiude il Natale. */
function battesimo(anno) {
  const epifania = new Date(anno, 0, 6);
  return piuGiorni(epifania, 7 - epifania.getDay());
}

/**
 * Tempo liturgico di una data, con gli stessi codici usati per classificare i
 * canti: avvento, natale, quaresima, palme, pasqua, pentecoste, ordinario.
 */
export function tempoLiturgico(iso) {
  const dt = daIso(iso);
  const anno = dt.getFullYear();
  const p = pasqua(anno);
  const t = dt.getTime();

  if (t >= inizioAvvento(anno).getTime() && t < new Date(anno, 11, 25).getTime()) return 'avvento';
  if (t >= new Date(anno, 11, 25).getTime()) return 'natale';
  if (t <= battesimo(anno).getTime()) return 'natale';

  const ceneri = piuGiorni(p, -46);
  const palme = piuGiorni(p, -7);
  const pentecoste = piuGiorni(p, 49);
  if (t === palme.getTime()) return 'palme';
  if (t >= ceneri.getTime() && t < p.getTime()) return 'quaresima';
  if (t === pentecoste.getTime()) return 'pentecoste';
  if (t >= p.getTime() && t < pentecoste.getTime()) return 'pasqua';
  return 'ordinario';
}

// ---------------------------------------------------------------- letture

const FEED = 'https://feed.evangelizo.org/v2/reader.php';
const CACHE = 'cic.letture.v1';
const FINESTRA = 29;   // il feed accetta date entro 30 giorni da oggi

export const PARTI = [
  { id: 'FR', nome: 'Prima lettura' },
  { id: 'PS', nome: 'Salmo' },
  { id: 'SR', nome: 'Seconda lettura' },
  { id: 'GSP', nome: 'Vangelo' },
];

/** Vera se il feed può ancora dare le letture di questa data. */
export function letturaDisponibile(iso) {
  const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
  return Math.abs(giorniFra(oggi, daIso(iso))) <= FINESTRA;
}

function leggiCache() {
  try { return JSON.parse(localStorage.getItem(CACHE) || '{}'); } catch (e) { return {}; }
}

function scriviCache(c) {
  const voci = Object.entries(c).sort((a, b) => (b[1].scaricate || '').localeCompare(a[1].scaricate || ''));
  try { localStorage.setItem(CACHE, JSON.stringify(Object.fromEntries(voci.slice(0, 40)))); } catch (e) { /* pieno: pazienza */ }
}

export function lettureInCache(iso) {
  return leggiCache()[iso] || null;
}

async function feed(params) {
  const res = await fetch(`${FEED}?${new URLSearchParams({ lang: 'IT', ...params })}`);
  if (!res.ok) throw new Error(`Errore ${res.status}`);
  const t = await res.text();
  // fuori finestra il feed risponde con una pagina d'errore completa
  if (/<!DOCTYPE|<html/i.test(t)) throw new Error('Letture non disponibili per questa data');
  return t;
}

function pulisci(html) {
  const senzaNota = html.split(/Copyright\s*@|Per ricevere il Vangelo/i)[0];
  const doc = new DOMParser().parseFromString(senzaNota.replace(/<br\s*\/?>/gi, '\n'), 'text/html');
  return (doc.body.textContent || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

const riferimento = (html) => pulisci(html).replace(/\s+/g, ' ').replace(/\.$/, '');

/**
 * Letture di una data: titolo del giorno, riferimenti e testi.
 * @returns {Promise<{data, titolo, rif, testo, scaricate}>}
 */
export async function scaricaLetture(iso) {
  const c = leggiCache();
  if (c[iso]) return c[iso];
  if (!letturaDisponibile(iso)) throw new Error('fuori-finestra');

  const date = iso.replace(/-/g, '');
  const [titolo, ...resto] = await Promise.all([
    feed({ date, type: 'liturgic_t' }),
    ...PARTI.map((p) => feed({ date, type: 'reading_st', content: p.id }).catch(() => '')),
    ...PARTI.map((p) => feed({ date, type: 'reading', content: p.id }).catch(() => '')),
  ]);
  const rif = {};
  const testo = {};
  PARTI.forEach((p, i) => {
    rif[p.id] = riferimento(resto[i]);
    testo[p.id] = pulisci(resto[i + PARTI.length]);
  });

  const voce = { data: iso, titolo: pulisci(titolo), rif, testo, scaricate: new Date().toISOString() };
  c[iso] = voce;
  scriviCache(c);
  return voce;
}

// ----------------------------------------------------------- suggerimenti

const VUOTE = new Set(`a ad ai al alla alle allo agli anche ancora avete aveva avevano
  che chi ci ciò coi col come con contro cosa così cui da dai dal dalla dalle dallo
  degli dei del della delle dello di dove dunque e ecco ed egli ella era erano essa
  esse essi esso fa fra fu furono gli già ha hai hanno ho il in io la le lei li lo
  loro lui ma me mentre mi mia mie miei mio ne nel nella nelle nei negli noi non
  nostra nostre nostri nostro o oh ogni per perché più poi prima quale quali
  quando quanto quella quelle quelli quello questa queste questi questo se sei si
  sia siamo siano sono su sua sue sui sul sulla suo suoi te ti tra tu tua tue tuo
  tuoi tutta tutte tutti tutto un una uno vi voi vostra vostro sarà essere stato
  stata detto disse dice dicendo fare fatto quel quei però allora qui là lì
  sempre mai molto tanto tanta
  altro altra altri altre stesso stessa stessi fino verso senza sopra sotto dentro
  fuori presso tempo volta volte cosa cose modo parte giorno giorni ora oggi
  sei era eri fui fosti sarà sarai saranno sarò saremo sia siate fosse fossero
  abbia abbiano avrà avranno avrò avuto ebbe ebbero aveva avevi
  faccio fai facciamo fanno fece fecero farà faranno facendo
  dico dici diciamo dicono dissero dirà diranno dite
  vado vai va andiamo vanno andò andarono andrà andate andare
  vengo vieni viene veniamo vengono venne vennero verrà venuto venire
  posso puoi può possiamo possono potrà poteva potere
  voglio vuoi vuole vogliamo vogliono volle volere vorrei
  devo devi deve dobbiamo devono dovere
  so sai sa sappiamo sanno sapere
  vedo vedi vede vediamo vedono vide videro visto vedere
  do dai dà diamo danno diede dettero darà dare dato
  sto stai sta stiamo stanno stare
  essi esse quale quali ciascuno nessuno niente nulla qualcosa
  solo soltanto ancora già pure invece quindi cioè ossia anzi
  mio mia tuo tua suo sua nostri vostri loro`.split(/\s+/).filter(Boolean).map(fold));

/** Radice approssimata: basta per far coincidere vigna/vigne, frutto/frutti. */
function radice(parola) {
  let p = parola;
  if (p.length > 5) p = p.replace(/(mente|zioni|zione|ando|endo|iamo)$/, '');
  if (p.length > 4) p = p.replace(/[aeiou]+$/, '');
  return p.slice(0, 7);
}

function parole(testo) {
  const out = [];
  for (const originale of String(testo || '').toLowerCase().split(/[^a-zàèéìíòóùú]+/)) {
    // i futuri (canterò, toglierò, darà) sono verbi, non temi: si riconoscono
    // dall'accento finale, che va guardato prima di toglierlo
    if (/r[òà]$/.test(originale)) continue;
    const grezza = fold(originale);
    if (grezza.length < 3 || VUOTE.has(grezza)) continue;
    out.push({ r: radice(grezza), w: grezza });
  }
  return out;
}

let indice = null;

function costruisciIndice(songs) {
  if (indice && indice.ref === songs) return indice;
  const docs = songs.map((s) => {
    const tf = new Map();
    const conta = (r, peso) => tf.set(r, (tf.get(r) || 0) + peso);
    for (const { r } of parole(s.title)) conta(r, 3);   // il titolo pesa di più
    for (const { r } of parole(songText(s))) conta(r, 1);
    return { s, tf };
  });
  const df = new Map();
  for (const d of docs) for (const r of d.tf.keys()) df.set(r, (df.get(r) || 0) + 1);
  const N = docs.length;
  const idf = new Map([...df].map(([r, n]) => [r, Math.log((N + 1) / (n + 1)) + 1]));
  for (const d of docs) {
    d.w = new Map();
    let q = 0;
    for (const [r, f] of d.tf) {
      const w = (1 + Math.log(f)) * idf.get(r);
      d.w.set(r, w);
      q += w * w;
    }
    d.norma = Math.sqrt(q) || 1;
  }
  // una parola presente in più di un canto su cinque non spiega una scelta
  const distintive = new Set([...df].filter(([, n]) => n / N <= 0.2).map(([r]) => r));
  indice = { ref: songs, docs, idf, distintive };
  return indice;
}

const PESI = { GSP: 1.5, PS: 1.2, FR: 1, SR: 0.8 };

function vettoreLetture(letture, idf) {
  const tf = new Map();
  const forma = new Map();   // radice -> parola come compare nelle letture
  for (const [parte, peso] of Object.entries(PESI)) {
    for (const { r, w } of parole((letture.testo || {})[parte] || '')) {
      if (!idf.has(r)) continue;
      tf.set(r, (tf.get(r) || 0) + peso);
      if (!forma.has(r)) forma.set(r, w);
    }
  }
  const v = new Map();
  let q = 0;
  for (const [r, f] of tf) {
    const w = (1 + Math.log(f)) * idf.get(r);
    v.set(r, w);
    q += w * w;
  }
  return { v, norma: Math.sqrt(q) || 1, forma };
}

const FORTI = ['avvento', 'natale', 'quaresima', 'palme', 'pasqua', 'pentecoste'];
const AFFINI = { pasqua: ['pentecoste'], pentecoste: ['pasqua'], quaresima: ['palme'], palme: ['quaresima'] };

/** Un canto di Natale ad agosto no: i tempi "forti" escludono gli altri. */
function adattoAlTempo(song, tempo) {
  const forti = song.seasons.filter((x) => FORTI.includes(x));
  if (!forti.length) return true;
  return forti.includes(tempo) || forti.some((x) => (AFFINI[tempo] || []).includes(x));
}

const ALLELUIA = /^allelu/i;
const LODE_A_TE = /lode a te/i;
const quaresimale = (tempo) => tempo === 'quaresima' || tempo === 'palme';

/** Avvertenze liturgiche legate al tempo, da mostrare accanto ai momenti. */
export function avvertenze(tempo) {
  const out = {};
  if (tempo === 'avvento' || quaresimale(tempo)) {
    out.gloria = `In ${tempo === 'avvento' ? 'Avvento' : 'Quaresima'} la domenica il Gloria non si canta (salvo solennità).`;
  }
  if (quaresimale(tempo)) {
    out.vangelo = 'In Quaresima l’Alleluia tace: al Vangelo si canta un’acclamazione come «Lode a te, o Cristo».';
  }
  return out;
}

const MOMENTI_SUGGERITI = ['ingresso', 'vangelo', 'offertorio', 'comunione', 'finale'];
const SOGLIA = 0.045;

/**
 * Canti suggeriti per momento.
 * @param {object} p  songs (catalogo), data (ISO), letture (o null se non disponibili)
 * @returns {{tempo, perMomento: Object<string, Array<{song, punti, motivi}>>, avvertenze}}
 */
export function suggerisci({ songs, data, letture = null, quanti = 3 }) {
  const tempo = tempoLiturgico(data);
  const mese = daIso(data).getMonth() + 1;
  const { docs, idf, distintive } = costruisciIndice(songs);
  const q = letture ? vettoreLetture(letture, idf) : null;

  const valutati = docs.map(({ s, w, norma }) => {
    let punti = 0;
    const contributi = [];
    if (q) {
      let dot = 0;
      for (const [r, wq] of q.v) {
        const ws = w.get(r);
        if (!ws) continue;
        dot += wq * ws;
        contributi.push([r, wq * ws]);
      }
      punti = dot / (q.norma * norma);
    }
    const extra = [];
    if (s.seasons.includes(tempo) && tempo !== 'ordinario') { punti += 0.15; extra.push('tempo liturgico'); }
    // maggio e ottobre sono i mesi dedicati alla Madonna
    if ((mese === 5 || mese === 10) && s.seasons.includes('mariano')) {
      punti += 0.05;
      extra.push(mese === 5 ? 'mese mariano' : 'mese del Rosario');
    }
    const motivi = contributi
      .filter(([r]) => distintive.has(r))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([r]) => q.forma.get(r));
    return { song: s, punti, motivi: [...motivi, ...extra] };
  });

  const perMomento = {};
  for (const m of MOMENTI_SUGGERITI) {
    let lista = valutati.filter((x) => x.song.moments.includes(m) && adattoAlTempo(x.song, tempo));
    if (m === 'vangelo') {
      if (quaresimale(tempo)) {
        lista = lista
          .filter((x) => !ALLELUIA.test(x.song.title))
          .map((x) => (LODE_A_TE.test(x.song.title) ? { ...x, punti: x.punti + 0.3 } : x));
      } else {
        lista = lista.filter((x) => !LODE_A_TE.test(x.song.title));
      }
    }
    perMomento[m] = lista
      .filter((x) => x.punti >= SOGLIA)
      .sort((a, b) => b.punti - a.punti)
      .slice(0, quanti);
  }
  return { tempo, perMomento, avvertenze: avvertenze(tempo) };
}

export { aIso };
