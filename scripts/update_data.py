"""Récupère l'historique Loto FDJ depuis le 6 octobre 2008 et calcule les statistiques.

Sorties :
  docs/data/draws.json  tirages (date, 5 boules triées, numéro Chance)
  docs/data/stats.json  théorie vs observé, couverture des règles

Usage : python scripts/update_data.py [--local fichier.zip|fichier.csv ...]
"""
import csv
import io
import json
import re
import sys
import urllib.request
import zipfile
from collections import Counter
from datetime import date, datetime, timezone
from pathlib import Path

from scipy.stats import chi2

sys.path.insert(0, str(Path(__file__).parent))
import loto_rules as R  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "data"
DEBUT = date(2008, 10, 6)  # premier tirage avec numéro Chance

HISTORIQUE_PAGE = "https://www.fdj.fr/jeux-de-tirage/loto/historique"
API = "https://www.sto.api.fdj.fr/anonymous/service-draw-info/v3/documentations/"
# Archives Loto connues (page historique FDJ, relevé du 11/11/2026)
ARCHIVES = [
    API + "1a2b3c4d-9876-4562-b3fc-2c963f66afp6",  # nov. 2019 -> aujourd'hui
    API + "1a2b3c4d-9876-4562-b3fc-2c963f66afo6",  # fév. 2019 -> nov. 2019
    API + "1a2b3c4d-9876-4562-b3fc-2c963f66afn6",  # mars 2017 -> fév. 2019
    API + "1a2b3c4d-9876-4562-b3fc-2c963f66afm6",  # oct. 2008 -> mars 2017
]
UA = {"User-Agent": "Mozilla/5.0 (loto-fdj stats; github actions)"}


def http_get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def lire_csv(raw):
    for enc in ("utf-8-sig", "latin-1"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    sep = ";" if text.count(";") > text.count(",") else ","
    return list(csv.DictReader(io.StringIO(text), delimiter=sep))


def lire_archive(raw):
    if raw[:2] == b"PK":
        rows = []
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            for name in z.namelist():
                low = name.lower()
                if not low.endswith(".csv"):
                    continue
                if "super" in low or "grand" in low:  # Super Loto / Grand Loto exclus
                    print(f"    ignoré : {name}")
                    continue
                part = lire_csv(z.read(name))
                print(f"    {name} : {len(part)} lignes")
                rows += part
        return rows
    return lire_csv(raw)


def parse_date(s):
    s = (s or "").strip()
    for fmt in ("%d/%m/%Y", "%Y%m%d", "%Y-%m-%d", "%d/%m/%y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None


def normaliser(rows):
    tirages = {}
    for row in rows:
        r = {k.strip().lower(): v.strip() for k, v in row.items() if isinstance(k, str) and isinstance(v, str)}
        try:
            boules = sorted(int(r[f"boule_{i}"]) for i in range(1, 6))
            chance = int(r["numero_chance"])
        except (KeyError, ValueError):
            continue
        d = parse_date(r.get("date_de_tirage"))
        if not d or d < DEBUT or len(set(boules)) != 5:
            continue
        if not all(1 <= b <= 49 for b in boules) or not 1 <= chance <= 10:
            continue
        rap = {k: v for k, v in r.items() if k.startswith("rapport_du_rang") or k.startswith("nombre_de_gagnant")}
        tirages[d] = {"date": d.isoformat(), "boules": boules, "chance": chance, "_rapports": rap}
    return [tirages[d] for d in sorted(tirages)]


def urls_archives():
    """Archives Loto connues ; la page FDJ n'est lue qu'en secours si l'une échoue."""
    return list(ARCHIVES)


def urls_page_historique(deja):
    urls = []
    try:
        page = http_get(HISTORIQUE_PAGE).decode("utf-8", "ignore")
        for u in re.findall(r"https://www\.sto\.api\.fdj\.fr/anonymous/service-draw-info/v3/documentations/[\w-]+", page):
            if u not in deja and u not in urls:
                urls.append(u)
    except Exception as e:  # la liste connue suffit
        print(f"Page historique inaccessible ({e}), liste connue utilisée")
    return urls


def telecharger():
    rows, echec = [], False
    urls = urls_archives()
    for u in urls:
        try:
            print(f"GET {u}")
            rows += lire_archive(http_get(u))
        except Exception as e:
            echec = True
            print(f"ERR {u}: {e}")
    if echec:  # liens changés : on tente ceux de la page, Super/Grand Loto filtrés par nom de fichier
        for u in urls_page_historique(urls):
            try:
                print(f"GET {u}")
                rows += lire_archive(http_get(u))
            except Exception as e:
                print(f"ERR {u}: {e}")
    return rows


def chi2_test(observes, attendus_proba, n):
    """Khi-deux avec regroupement des classes d'effectif attendu < 5."""
    cells = sorted(((attendus_proba[k] * n, observes.get(k, 0)) for k in attendus_proba), reverse=True)
    merged, acc_e, acc_o = [], 0.0, 0
    for e, o in cells:
        acc_e += e
        acc_o += o
        if acc_e >= 5:
            merged.append((acc_e, acc_o))
            acc_e, acc_o = 0.0, 0
    if acc_e and merged:
        e, o = merged.pop()
        merged.append((e + acc_e, o + acc_o))
    if len(merged) < 2:
        return None
    stat = sum((o - e) ** 2 / e for e, o in merged)
    ddl = len(merged) - 1
    return {"khi2": round(stat, 2), "ddl": ddl, "p_value": round(float(chi2.sf(stat, ddl)), 4)}


def classe_vecteur(v):
    """Vecteurs équiprobables : même compte en 1-9, mêmes chiffres en 10-49."""
    return f"{v[0]}|" + "".join(map(str, sorted(v[1:], reverse=True)))


def calculer(tirages):
    th = R.theorie()
    total = th["total"]
    n = len(tirages)
    combos = [tuple(t["boules"]) for t in tirages]

    obs_suites = Counter(R.suite_type(c) for c in combos)
    obs_pairs = Counter(str(R.nb_pairs(c)) for c in combos)
    obs_vec = Counter(R.vecteur_str(R.vecteur(c)) for c in combos)
    obs_unites = Counter(str(R.max_meme_unite(c)) for c in combos)
    obs_hauts = Counter(str(R.nb_hauts(c)) for c in combos)

    # classes de vecteurs pour le test (126 cellules trop fines)
    th_cls, obs_cls = Counter(), Counter()
    for v, cnt in th["vecteurs"].items():
        th_cls[classe_vecteur(tuple(map(int, v.split("-"))))] += cnt
    for v, cnt in obs_vec.items():
        obs_cls[classe_vecteur(tuple(map(int, v.split("-"))))] += cnt

    def proba(d):
        return {k: v / total for k, v in d.items()}

    respect = [R.respecte_regles(c) for c in combos]

    return {
        "maj": datetime.now(timezone.utc).isoformat(timespec="minutes"),
        "nb_tirages": n,
        "premier": tirages[0]["date"] if n else None,
        "dernier": tirages[-1] if n else None,
        "theorie": th,
        "observe": {"suites": obs_suites, "pairs": obs_pairs, "vecteurs": obs_vec, "unites": obs_unites, "hauts": obs_hauts},
        "tests": {
            "suites": chi2_test(obs_suites, proba(th["suites"]), n) if n else None,
            "pairs": chi2_test(obs_pairs, proba(th["pairs"]), n) if n else None,
            "dizaines": chi2_test(obs_cls, proba(th_cls), n) if n else None,
            "unites": chi2_test(obs_unites, proba(th["unites"]), n) if n else None,
            "hauts": chi2_test(obs_hauts, proba(th["hauts"]), n) if n else None,
        },
        "couverture": {
            "attendue": th["conservees"] / total,
            "observee": (sum(respect) / n) if n else None,
            "tirages_conformes": sum(respect),
            "dernier_conforme": respect[-1] if n else None,
        },
    }


def main(args):
    if args and args[0] == "--local":
        rows = []
        for p in args[1:]:
            rows += lire_archive(Path(p).read_bytes())
    else:
        rows = telecharger()
    tirages = normaliser(rows)
    if not tirages:
        sys.exit("Aucun tirage récupéré : données existantes conservées.")
    OUT.mkdir(parents=True, exist_ok=True)
    # gains officiels par rang (pour le test du modèle), dans un fichier séparé
    (OUT / "rapports.json").write_text(json.dumps(
        [{"date": t["date"], **t["_rapports"]} for t in tirages], ensure_ascii=False, separators=(",", ":")))
    for t in tirages:
        t.pop("_rapports")
    (OUT / "draws.json").write_text(json.dumps(tirages, separators=(",", ":")))
    (OUT / "stats.json").write_text(json.dumps(calculer(tirages), ensure_ascii=False, separators=(",", ":")))
    print(f"{len(tirages)} tirages du {tirages[0]['date']} au {tirages[-1]['date']}")


if __name__ == "__main__":
    main(sys.argv[1:])
