# Loto FDJ — Générateur de grilles

Application web qui propose 10 grilles Loto couvrant les numéros 1 à 49, selon une méthode statistique validée le 11/11/2026.

## Méthode

Sur les 1 906 884 combinaisons possibles de 5 numéros, on garde celles qui respectent les quatre règles suivantes :

1. **Suites** : aucune suite, ou une seule paire de numéros consécutifs.
2. **Parité** : 2 pairs / 3 impairs, ou 3 pairs / 2 impairs.
3. **Dizaines** : chaque combinaison est décrite par un vecteur [1-9]-[10-19]-[20-29]-[30-39]-[40-49]. On garde au plus 2 numéros par dizaine, soit 51 vecteurs sur 126.
4. **Historique** : la combinaison n'est jamais sortie depuis le 6 octobre 2008.

Les trois premières règles gardent 901 185 combinaisons, ce qui représente 47,3 % des tirages attendus.

Les 10 grilles occupent 50 cases pour 49 numéros : un seul numéro apparaît deux fois (le « doublon », tiré au hasard). Chaque grille reçoit un numéro Chance différent, de 1 à 10.

Le nombre de sorties passées des numéros n'est pas utilisé : l'analyse sur l'historique montre qu'il n'a aucune valeur prédictive.

Chaque combinaison a la même probabilité de sortir. Ces règles orientent les grilles vers les profils les plus fréquents, mais elles n'augmentent pas les chances d'une grille donnée.

## Fonctionnement

- `scripts/update_data.py` télécharge les archives FDJ, puis produit deux fichiers : `docs/data/draws.json` (les tirages) et `docs/data/stats.json` (comparaison théorie / observé avec test du khi-deux, couverture des règles).
- `docs/regles.js` contient les règles et le générateur, `docs/app.js` gère l'interface.
- `.github/workflows/update.yml` lance la mise à jour automatique après chaque tirage (lundi, mercredi et samedi soir, avec un rattrapage le lendemain matin), puis publie le site sur GitHub Pages.

## Lancer en local

```
pip install scipy
python scripts/update_data.py
node tests/test_generateur.js
python -m http.server -d docs
```
