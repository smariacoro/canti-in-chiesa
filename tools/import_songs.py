# -*- coding: utf-8 -*-
"""
Converte i .txt esportati dai Google Docs in app/data/songs.json.

Formato sorgente: prima riga = titolo, poi righe di accordi (notazione italiana)
alternate a righe di testo, blocchi separati da righe vuote.

    DO              FA        SOL
    Acqua siamo noi, dall'antica sorgente veniamo,

Uso:  python tools/import_songs.py
"""
import io, json, os, re, sys, unicodedata

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(BASE, "tools", "raw")
MANIFEST = os.path.join(BASE, "tools", "manifest.tsv")
OUT = os.path.join(BASE, "app", "data", "songs.json")

MOMENT_ORDER = ["ingresso", "gloria", "vangelo", "offertorio", "santo", "comunione", "finale"]

# --- accordi in notazione italiana -------------------------------------------
NOTES = r"(?:DO|RE|MI|FA|SOL|LA|SI)"
ALT = r"(?:#|b|♯|♭)?"
SUFFIX = r"(?:[mM]?(?:aj)?[0-9+°]*(?:sus[24]?|dim|aug|add[0-9]+|min|-)?[0-9+°]*)"
CHORD_RE = re.compile(
    r"^%s%s%s(?:/%s%s)?$" % (NOTES, ALT, SUFFIX, NOTES, ALT)
)
# marcatori strutturali che possono comparire su una riga di accordi
CHORD_EXTRAS = re.compile(r"^(?:\(|\)|\||\|\||:\||\|:|x[0-9]+|[0-9]+x|-|–)$")


def is_chord_token(tok):
    return bool(CHORD_RE.match(tok)) or bool(CHORD_EXTRAS.match(tok))


def is_chord_line(line):
    """Vera se la riga contiene solo accordi (e almeno un accordo reale)."""
    toks = line.split()
    if not toks:
        return False
    real = 0
    for t in toks:
        t = t.strip(",.;")
        if not is_chord_token(t):
            return False
        if CHORD_RE.match(t):
            real += 1
    # una riga di soli marcatori non e' una riga di accordi
    return real > 0


def chords_with_columns(line):
    """[(colonna, accordo)] preservando la posizione orizzontale."""
    out = []
    for m in re.finditer(r"\S+", line):
        tok = m.group(0)
        if CHORD_RE.match(tok.strip(",.;")):
            out.append((m.start(), tok.strip(",.;")))
    return out


def segments(lyric, chords):
    """Spezza il testo nei punti in cui cade un accordo -> [{c, t}].

    Nei documenti originali gli accordi sono allineati a mano con spazi in un
    font proporzionale: la colonna deriva quindi di qualche carattere e cade a
    meta' parola. Ogni accordo viene agganciato all'inizio di parola piu' vicino,
    che e' la ricostruzione piu' probabile dell'intenzione originale.
    """
    stripped = lyric.strip()
    if not stripped:
        return [{"c": " ".join(c for _, c in chords)}] if chords else []

    shift = len(lyric) - len(lyric.lstrip())
    body = lyric.strip()
    if not chords:
        return [{"t": body}]

    starts = [m.start() for m in re.finditer(r"\S+", body)]
    placed, trailing, last = [], [], -1
    for col, ch in chords:
        col -= shift
        if col >= len(body):
            trailing.append(ch)
            continue
        near = [s for s in starts if s >= last]
        if not near:
            trailing.append(ch)
            continue
        snap = min(near, key=lambda s: (abs(s - col), s))
        if placed and placed[-1][0] == snap:
            placed[-1][1].append(ch)  # due accordi sulla stessa parola
        else:
            placed.append([snap, [ch]])
        last = snap

    segs = []
    if not placed:
        segs.append({"t": body})
    else:
        if placed[0][0] > 0:
            segs.append({"t": body[: placed[0][0]]})
        for i, (col, chs) in enumerate(placed):
            end = placed[i + 1][0] if i + 1 < len(placed) else len(body)
            segs.append({"c": " ".join(chs), "t": body[col:end]})
    for ch in trailing:
        segs.append({"c": ch})
    return segs


SECTION_RE = re.compile(
    r"^\s*(RIT\.?|RITORNELLO|RIF\.?|BRIDGE|PONTE|FINALE|CODA|INTRO|STROFA)\b[:.]?\s*",
    re.IGNORECASE,
)


def read_source(path):
    """I Google Docs esportano terminando le righe con \r\r\n: senza newline=""
    Python li tradurrebbe in due a capo, spezzando ogni coppia accordo/testo."""
    text = io.open(path, encoding="utf-8-sig", newline="").read()
    text = text.replace("\r\r\n", "\n").replace("\r\n", "\n").replace("\r", "\n")
    # Caratteri invisibili lasciati dall'editor di Google Docs: un trattino
    # morbido dentro "REm" bastava a far scambiare una riga di accordi per testo.
    for ch in ("­", "​", "‌", "﻿"):
        text = text.replace(ch, "")
    return text.replace(" ", " ")


def strip_marker(sec):
    """Toglie 'RIT:' & co. dal testo: l'etichetta di sezione e' gia' un badge."""
    for ln in sec:
        for seg in ln["s"]:
            if seg.get("t", "").strip():
                seg["t"] = SECTION_RE.sub("", seg["t"], count=1)
                if not seg["t"] and not seg.get("c"):
                    ln["s"].remove(seg)
                return


def parse(text, title):
    lines = [l.rstrip() for l in text.split("\n")]
    # rimuove la riga del titolo se ripetuta in testa
    while lines and not lines[0].strip():
        lines.pop(0)
    if lines and norm(lines[0]) == norm(title):
        lines.pop(0)

    sections, cur, i = [], [], 0

    def push(ln, text):
        """Un 'RIT:' a meta' blocco apre comunque una nuova sezione: nei
        documenti originali la riga vuota prima del ritornello spesso manca."""
        nonlocal cur
        if cur and SECTION_RE.match(text):
            sections.append(cur)
            cur = []
        cur.append(ln)

    while i < len(lines):
        line = lines[i]
        if not line.strip():
            if cur:
                sections.append(cur)
                cur = []
            i += 1
            continue
        if is_chord_line(line):
            chords = chords_with_columns(line)
            nxt = lines[i + 1] if i + 1 < len(lines) else ""
            if nxt.strip() and not is_chord_line(nxt):
                push({"s": segments(nxt, chords)}, nxt.strip())
                i += 2
                continue
            # riga di soli accordi (intro / stacco strumentale)
            cur.append({"s": [{"c": c} for _, c in chords], "instr": True})
            i += 1
            continue
        push({"s": segments(line, [])}, line.strip())
        i += 1
    if cur:
        sections.append(cur)

    out = []
    for sec in sections:
        label = None
        first_text = ""
        for ln in sec:
            first_text = "".join(seg.get("t", "") for seg in ln["s"]).strip()
            if first_text:
                break
        m = SECTION_RE.match(first_text)
        if m:
            label = "rit" if m.group(1).upper().startswith(("RIT", "RIF")) else m.group(1).lower()
            strip_marker(sec)  # l'etichetta e' gia' mostrata come badge
        elif all(ln.get("instr") for ln in sec):
            label = "strumentale"
        out.append({"label": label, "lines": sec})
    return out


def all_chords(sections):
    res = []
    for sec in sections:
        for ln in sec["lines"]:
            for seg in ln["s"]:
                if seg.get("c"):
                    res.append(seg["c"])
    return res


ROOT_RE = re.compile(r"^(SOL|DO|RE|MI|FA|LA|SI)([#b]?)(.*)$")


def chord_key(tok):
    """Riduce un accordo alla sola tonalita': SOL7 -> SOL, FA#m7 -> FA#m."""
    m = ROOT_RE.match(tok)
    if not m:
        return None
    minor = bool(re.match(r"^(m|min|-)(?!aj)", m.group(3)))
    return m.group(1) + m.group(2) + ("m" if minor else "")


def guess_key(sections):
    """Tonica probabile = primo accordo del canto.

    Verificata sui 26 canti in cui primo e ultimo accordo divergono: il primo e'
    corretto in quasi tutti (Acqua siamo noi -> DO, Servo per amore -> SIm,
    Madre io vorrei -> LAm). L'ultimo accordo inganna spesso, perche' le
    trascrizioni chiudono sulla dominante o sul rivolto di rientro.
    Resta comunque una stima, modificabile dall'app canto per canto.
    """
    toks = []
    for cell in all_chords(sections):
        toks.extend(cell.split())
    for t in toks:
        k = chord_key(t)
        if k:
            return k
    return None


def norm(s):
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def slug(s):
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", s)).strip("-")


# --- tempi liturgici: solo attribuzioni inequivocabili ------------------------
SEASONS = {
    "Adeste fideles": ["natale"],
    "Astro del ciel": ["natale"],
    "In notte placida": ["natale"],
    "Tu scendi dalle stelle": ["natale"],
    "Alleluja Oggi è nato": ["natale"],
    "Vieni Gesù, Maranathà": ["avvento"],
    "Ecco il Signore viene": ["avvento"],
    "Osanna al figlio di David": ["palme"],
    "Alleluja Pasquale": ["pasqua"],
    "Resurrezione": ["pasqua"],
    "La mia Pasqua è il Signore": ["pasqua"],
    "Cantico dell'agnello": ["pasqua"],
    "Ave Maria Medjugorie": ["mariano"],
    "Dell'aurora tu sorgi più bella": ["mariano"],
    "Madre io vorrei": ["mariano"],
    "Maria tu sei": ["mariano"],
    "Come Maria": ["mariano"],
    "Santa Maria del cammino": ["mariano"],
    "Vergine Santa nostro orgoglio": ["mariano"],
    "Inno al Beato Stefano": ["santi"],
}


def main():
    manifest = []
    for line in io.open(MANIFEST, encoding="utf-8"):
        if line.strip():
            manifest.append(line.rstrip("\n").split("\t"))

    by_id, warnings = {}, []
    for cat, title, docid in manifest:
        fn = os.path.join(RAW, "%s__%s.txt" % (cat, title.replace("/", "-")))
        if not os.path.exists(fn):
            warnings.append("MANCANTE: %s" % fn)
            continue
        sections = parse(read_source(fn), title)
        chords = all_chords(sections)
        nlines = sum(len(s["lines"]) for s in sections)
        if not chords:
            warnings.append("nessun accordo: %s" % title)
        if nlines < 3:
            warnings.append("troppo corto (%d righe): %s" % (nlines, title))

        sid = slug(title)
        if sid in by_id:
            # stesso canto archiviato in piu' momenti della messa
            if cat not in by_id[sid]["moments"]:
                by_id[sid]["moments"].append(cat)
            if nlines > by_id[sid]["_nlines"]:
                by_id[sid].update(sections=sections, key=guess_key(sections), _nlines=nlines)
            continue

        by_id[sid] = {
            "id": sid,
            "title": title,
            "moments": [cat],
            "seasons": SEASONS.get(title, []),
            "key": guess_key(sections),
            "bpm": None,
            "capo": 0,
            "sections": sections,
            "organ": None,
            "notes": "",
            "src": docid,
            "_nlines": nlines,
        }

    songs = list(by_id.values())
    for s in songs:
        s.pop("_nlines", None)
        s["moments"].sort(key=lambda m: MOMENT_ORDER.index(m) if m in MOMENT_ORDER else 99)
    songs.sort(key=lambda s: norm(s["title"]))

    payload = {"version": 1, "generated": "import_songs.py", "songs": songs}
    with io.open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    print("scritti %d canti in %s (%.0f KB)" % (len(songs), OUT, os.path.getsize(OUT) / 1024.0))
    by_cat = {}
    for s in songs:
        for m in s["moments"]:
            by_cat[m] = by_cat.get(m, 0) + 1
    print("per momento:", by_cat)
    print("in piu' momenti:", [s["title"] for s in songs if len(s["moments"]) > 1])
    print("senza tonalita':", sum(1 for s in songs if not s["key"]))
    if warnings:
        print("\n%d avvisi:" % len(warnings))
        for w in warnings:
            print("  -", w)


if __name__ == "__main__":
    main()
