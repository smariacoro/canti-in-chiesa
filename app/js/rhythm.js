// Ritmo della chitarra: il modello di pennata di un canto.
//
// Si scrive una cella per ogni croma, quindi due per movimento: in 4/4 sono 8
// celle, in 3/4 sono 6. Ogni cella vale
//   D  pennata in giù      U  pennata in su
//   X  stoppata            -  pausa (la mano passa senza toccare le corde)
// Esempio, la classica "ballata" in 4/4:  D - D U - U D U

export const SEGNI = ['-', 'D', 'U', 'X'];

export const SIMBOLO = { D: '↓', U: '↑', X: '×', '-': '·' };
export const NOME = { D: 'giù', U: 'su', X: 'stoppata', '-': 'pausa' };

/** Il modello sempre lungo quanto serve per il tempo del canto. */
export function normalizzaPennata(p, meter = 4) {
  const n = (meter || 4) * 2;
  const pulito = String(p || '').toUpperCase().replace(/[^DUX-]/g, '');
  return (pulito + '-'.repeat(n)).slice(0, n);
}

export const vuoto = (p) => !p || !/[DUX]/.test(p);

/** Etichette di conteggio sotto le celle: 1 e 2 e 3 e 4 e. */
export function conteggio(meter = 4) {
  const out = [];
  for (let i = 1; i <= meter; i++) out.push(String(i), 'e');
  return out;
}

/** Il modello in forma breve, per l'intestazione: ↓ ↓↑ ↑↓↑ */
export function compatto(p, meter = 4) {
  if (vuoto(p)) return '';
  const norm = normalizzaPennata(p, meter);
  const movimenti = [];
  for (let i = 0; i < norm.length; i += 2) {
    const coppia = norm.slice(i, i + 2).replace(/-/g, '');
    movimenti.push(coppia ? [...coppia].map((s) => SIMBOLO[s]).join('') : '·');
  }
  return movimenti.join(' ');
}

/** Modelli di partenza, scelti fra i più comuni nell'accompagnamento liturgico. */
export function modelli(meter = 4) {
  const base = { nome: 'Semplice', p: 'D-'.repeat(meter) };
  const crome = { nome: 'Crome', p: 'DU'.repeat(meter) };
  if (meter === 4) {
    return [
      base,
      { nome: 'Ballata', p: 'D-DU-UDU' },
      crome,
      { nome: 'Con stoppata', p: 'D-XUD-XU' },
    ];
  }
  if (meter === 3) {
    return [
      base,
      { nome: 'Valzer', p: 'D-DUDU' },
      crome,
    ];
  }
  return [base, crome];
}
