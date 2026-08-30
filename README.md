# Canti in Chiesa

App per il coro della **Basilica Santuario Madre del Buon Consiglio**: i canti
sempre in tasca, anche senza rete, con scalette condivise per la messa.

È una PWA: si apre nel browser e si installa sulla schermata Home sia su Android
sia su iPhone. Non c'è niente da compilare — è HTML, CSS e JavaScript puri.

## Cosa fa

- **82 canti** importati dal Drive del coro, con testo e accordi in notazione italiana.
- **Ordinamento per momento della messa** (Ingresso, Gloria, Al Vangelo, Offertorio,
  Santo, Comunione, Finale) e, dentro ogni momento, in ordine alfabetico di titolo.
  Un canto può stare in più momenti.
- **Ricerca** per titolo e per parole del testo, con filtri per tempo liturgico.
- **Zoom indipendenti** per i comandi e per il testo dei canti.
- **Tonalità e ritmo**: toccando la tonalità si sente l'accordo per intonare;
  toccando il bpm parte il metronomo. Il bpm si imposta battendo il tempo.
- **Trasposizione** di semitoni, con gli accordi che si riscrivono da soli.
- **Scalette con data**, strutturate come la messa: ogni momento è una casella che
  aspetta il suo canto, e restano visibili anche vuote così si vede a colpo d'occhio
  cosa manca. Chi vuole può aggiungere altri canti nello stesso momento (segnati
  come *extra*) o fuori schema. Durante la messa si passa da un canto al successivo
  senza tornare indietro, e lo schermo resta acceso.
- **Arrangiamento per organo** per ogni canto, in una finestra separata dagli
  accordi per chitarra ma raggiungibile con un tocco: registrazione, note per
  l'organista e **spartito vero** scritto in notazione ABC.
- **Libretto stampabile** (tutti i canti, una scaletta o una selezione) con
  copertina e indice numerato, nello stesso ordine dell'app.
- **Condivisione fra coristi** con account, se colleghi Supabase (vedi sotto).

## Provarla subito in locale

```bash
python -m http.server 8123 --directory app
```

Poi apri <http://localhost:8123>. Serve un server: aprendo `index.html` con doppio
clic il browser blocca i moduli JavaScript e il funzionamento offline.

## Pubblicarla (GitHub Pages)

```bash
git init && git add . && git commit -m "Canti in Chiesa"
git branch -M main
git remote add origin https://github.com/TUO-UTENTE/canti-in-chiesa.git
git push -u origin main
```

Poi su GitHub: **Settings → Pages → Source: GitHub Actions**. Il workflow in
`.github/workflows/deploy.yml` pubblica la cartella `app/` a ogni push su `main`.
L'indirizzo sarà `https://TUO-UTENTE.github.io/canti-in-chiesa/`.

Per installarla sul telefono: aprire quell'indirizzo e scegliere *Aggiungi a
schermata Home* (su iPhone dal menu Condividi di Safari, su Android dal menu di
Chrome). Da quel momento funziona anche in aereo.

## Attivare le scalette condivise

Senza questo passaggio l'app funziona benissimo, ma i dati restano sul singolo
telefono. Il progetto Supabase è già collegato in `app/config.js`
(`https://guvishdyqgpfclvvaakg.supabase.co`). Restano due passaggi:

1. In **SQL Editor** incolla ed esegui `supabase/schema.sql`.
2. In **Project Settings → API Keys** copia la chiave *anon public* dentro
   `SUPABASE_ANON_KEY` in `app/config.js`.
3. In **Authentication → URL Configuration** metti l'indirizzo dell'app come
   **Site URL**, e aggiungilo anche in **Redirect URLs**. Senza questo passaggio
   il link di conferma nell'email punta a `http://localhost:3000`, che sul
   telefono non esiste: l'account viene comunque attivato, ma l'utente vede una
   pagina di errore.

Poi pubblica di nuovo: da *Impostazioni → Coro condiviso* ognuno si crea
l'account.

La chiave `anon` è fatta per stare nel telefono: a proteggere i dati sono le
policy RLS dello schema, che richiedono un utente autenticato. Per impedire che
si iscriva chiunque, in *Authentication → Providers → Email* spegni
**Enable sign ups** e crea tu gli account del coro.

Le modifiche fatte senza rete restano in coda e partono da sole quando torna il
campo. In caso di conflitto vince la modifica più recente.

## Struttura

```
app/                    la PWA, è questa che va pubblicata
  index.html            struttura della pagina
  config.js             Supabase e nome della parrocchia
  sw.js                 service worker: fa funzionare tutto offline
  css/app.css           tema chiaro/scuro, stampa, zoom
  js/
    main.js             avvio e rotte
    store.js            catalogo + modifiche locali + scalette
    sync.js             sincronizzazione con Supabase
    render.js           testo con accordi ⇄ testo modificabile
    chords.js           accordi italiani: analisi, trasposizione, frequenze
    audio.js            metronomo, nota di riferimento, tap tempo
    score.js            spartiti in notazione ABC
    views/              le schermate
  vendor/               abcjs (MIT), copia locale per gli spartiti offline
  data/songs.json       il catalogo (generato, non modificare a mano)
  icons/                icone generate dallo stemma della Basilica
tools/                  importazione dei canti
  manifest.tsv          elenco canti → cartella Drive
  raw/                  i testi originali scaricati dai Google Docs
  import_songs.py       da raw/ a app/data/songs.json
  make_icons.py         da stemmabasilica.png alle icone
supabase/schema.sql     tabelle e policy
```

## Spartiti per organo

Lo spartito si scrive in **notazione ABC**: è il "LaTeX della musica", cioè si
descrive il pezzo in testo e l'app disegna il pentagramma. Si trascrive una volta
dal foglio a penna e resta per sempre — a differenza di una foto si trasporta
insieme al canto, pesa niente e si stampa nitido.

Dal canto: menu ⋮ → *Arrangiamento per organo* → **Aggiungi**. Il pulsante
*Inserisci modello per organo* prepara già due righi (manuale e pedale) nella
tonalità giusta; l'anteprima si aggiorna mentre scrivi.

Le note usano le lettere inglesi, e nell'editor c'è la legenda a portata d'occhio:

| DO | RE | MI | FA | SOL | LA | SI |
|----|----|----|----|-----|----|-----|
| C  | D  | E  | F  | G   | A  | B   |

L'essenziale per cominciare:

```
X:1
T:Titolo del canto
M:4/4          ← tempo
L:1/4          ← durata di riferimento: 1/4 = una nota è una semiminima
K:Em           ← tonalità (MIm)
V:1 clef=treble
V:2 clef=bass
[V:1] E G B e | d2 B2 |
[V:2] E,,2 B,,2 | E,,4 |
```

- `C` ottava centrale, `c` ottava sopra, `C,` ottava sotto (ogni virgola scende
  di un'ottava, ogni apostrofo `c'` sale).
- Il numero allunga: `G2` dura il doppio, `G/2` la metà.
- `|` separa le battute, `z` è una pausa, `[CEG]` è un accordo.
- `^C` diesis, `_B` bemolle, `=C` bequadro.

La guida completa è su <https://abcnotation.com/wiki/abc:standard:v2.1>.

Il disegno è fatto da **abcjs** (licenza MIT, `app/vendor/`, 512 KB). Sta in
locale e non su un CDN, così gli spartiti si vedono anche senza rete; viene
caricato solo quando apri un arrangiamento, quindi non rallenta l'avvio.

## Rigenerare il catalogo

I testi originali sono in `tools/raw/`, così l'importazione è ripetibile senza
riscaricare nulla:

```bash
python tools/import_songs.py
```

Aggiungere un canto al catalogo di base: metti il `.txt` in `tools/raw/` con il
nome `momento__Titolo.txt`, aggiungi la riga corrispondente a
`tools/manifest.tsv` e rilancia lo script. Per aggiunte occasionali conviene
invece usare l'editor dentro l'app (*Impostazioni → Nuovo canto*).

Formato del testo: gli accordi vanno sulla riga sopra, allineati alla sillaba;
una riga vuota separa le strofe; `[rit]` marca il ritornello. Due accordi
separati da **un solo** spazio si intendono impilati sulla stessa sillaba, da due
o più spazi come posizioni distinte.

## Dopo un aggiornamento

Il service worker serve la copia in cache e scarica la nuova versione in
background: l'aggiornamento si vede alla riapertura successiva. Quando pubblichi
modifiche importanti conviene alzare `VERSION` in `app/sw.js`, così le vecchie
cache vengono buttate subito.

## Note sui dati importati

- **Tonalità**: stimata dal primo accordo di ogni canto. Regola verificata sui 26
  canti in cui primo e ultimo accordo divergono, dove il primo è quasi sempre la
  tonica. Resta una stima: si corregge dall'app, canto per canto.
- **Posizione degli accordi**: nei Google Docs erano allineati a mano con spazi in
  un font proporzionale, quindi le colonne cadevano a metà parola. Ogni accordo è
  stato agganciato all'inizio di parola più vicino.
- **BPM**: non esisteva in nessun file, quindi è vuoto. Si imposta in pochi
  secondi con *Batti il tempo* dal menu del canto.
- **Tempi liturgici**: assegnati solo dove il titolo non lascia dubbi (Natale,
  Avvento, Pasqua, mariani…). Tutti gli altri sono da completare dall'app.
