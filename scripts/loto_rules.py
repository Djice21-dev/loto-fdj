"""Règles de filtrage validées (méthode du 11/11/2026).

1. Suites    : aucune suite ou une seule paire de numéros consécutifs.
2. Parité    : de 1 à 4 pairs (0/5 et 5/0 exclus, règle élargie le 11/11/2026).
3. Dizaines  : vecteur [1-9]-[10-19]-[20-29]-[30-39]-[40-49], au plus 2 numéros
               par dizaine (51 vecteurs sur 126).
4. Terminaisons : au plus 2 numéros avec le même chiffre des unités.
5. Numéros hauts : de 1 à 3 numéros au-dessus de 31.
6. Colonnes du bulletin : au plus 2 cases qui se suivent dans une même colonne
               (numéros espacés de 5, ex. 8-13-18 exclu), règle anti-partage.
7. Historique: combinaison jamais sortie depuis le 6 octobre 2008.
"""
from collections import Counter
from itertools import combinations
from math import comb

SUITE_LABELS = {
    (): "Aucune suite",
    (2,): "1 paire",
    (2, 2): "2 paires",
    (3,): "1 triplet",
    (3, 2): "Triplet + paire",
    (4,): "Suite de 4",
    (5,): "Suite de 5",
}
SUITES_OK = {"Aucune suite", "1 paire"}
PAIRS_OK = {1, 2, 3, 4}
MAX_PAR_DIZAINE = 2
MAX_MEME_UNITE = 2   # règle ajoutée le 11/11/2026
SEUIL_HAUT = 31      # au moins MIN_HAUTS numéros > SEUIL_HAUT
MIN_HAUTS = 1
MAX_HAUTS = 3       # 4 ou 5 numéros hauts exclus (11/11/2026)
MAX_COLONNE = 2      # bulletin 5 colonnes : 3 cases ou plus qui se suivent exclues (11/11/2026)
DIZAINE_SIZES = (9, 10, 10, 10, 10)


def suite_type(combo):
    c = sorted(combo)
    runs, k = [], 1
    for a, b in zip(c, c[1:]):
        if b == a + 1:
            k += 1
        else:
            runs.append(k)
            k = 1
    runs.append(k)
    return SUITE_LABELS[tuple(sorted((r for r in runs if r > 1), reverse=True))]


def nb_pairs(combo):
    return sum(1 for x in combo if x % 2 == 0)


def dizaine(x):
    return min(x // 10, 4)


def vecteur(combo):
    v = [0] * 5
    for x in combo:
        v[dizaine(x)] += 1
    return tuple(v)


def vecteur_str(v):
    return "-".join(map(str, v))


def vecteur_count(v):
    out = 1
    for k, size in zip(v, DIZAINE_SIZES):
        out *= comb(size, k)
    return out


def max_meme_unite(combo):
    return max(Counter(x % 10 for x in combo).values())


def nb_hauts(combo):
    return sum(1 for x in combo if x > SEUIL_HAUT)


def colonne_max(combo):
    """Plus longue série de cases qui se suivent dans une colonne du bulletin (pas de 5)."""
    s = set(combo)
    best = 1
    for x in s:
        if x - 5 in s:
            continue
        k = 1
        while x + 5 * k in s:
            k += 1
        best = max(best, k)
    return best


def respecte_regles(combo):
    return (
        suite_type(combo) in SUITES_OK
        and nb_pairs(combo) in PAIRS_OK
        and max(vecteur(combo)) <= MAX_PAR_DIZAINE
        and max_meme_unite(combo) <= MAX_MEME_UNITE
        and MIN_HAUTS <= nb_hauts(combo) <= MAX_HAUTS
        and colonne_max(combo) <= MAX_COLONNE
    )


def theorie():
    """Dénombrement exhaustif des 1 906 884 combinaisons."""
    suites, pairs, vecs, unites, hauts, cols = Counter(), Counter(), Counter(), Counter(), Counter(), Counter()
    total = ok = 0
    for c in combinations(range(1, 50), 5):
        total += 1
        suites[suite_type(c)] += 1
        pairs[nb_pairs(c)] += 1
        vecs[vecteur(c)] += 1
        unites[max_meme_unite(c)] += 1
        hauts[nb_hauts(c)] += 1
        cols[colonne_max(c)] += 1
        if respecte_regles(c):
            ok += 1
    return {
        "total": total,
        "conservees": ok,
        "suites": dict(suites),
        "pairs": {str(k): v for k, v in pairs.items()},
        "vecteurs": {vecteur_str(k): v for k, v in vecs.items()},
        "unites": {str(k): v for k, v in unites.items()},
        "hauts": {str(k): v for k, v in hauts.items()},
        "colonnes": {str(k): v for k, v in cols.items()},
    }
