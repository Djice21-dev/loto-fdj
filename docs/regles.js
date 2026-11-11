// Règles de la méthode validée le 11/11/2026 et générateur des 10 grilles (sans DOM).

const SUITES_OK = new Set(['Aucune suite', '1 paire']);
const PAIRS_OK = new Set([1, 2, 3, 4]);
const MAX_PAR_DIZAINE = 2;
const MAX_MEME_UNITE = 2;  // au plus 2 numéros avec le même chiffre des unités
const SEUIL_HAUT = 31, MIN_HAUTS = 1, MAX_HAUTS = 3;  // de 1 à 3 numéros au-dessus de 31


function suiteType(c) {
  const s = [...c].sort((a, b) => a - b);
  const runs = [];
  let k = 1;
  for (let i = 1; i < s.length; i++) {
    if (s[i] === s[i - 1] + 1) k++;
    else { runs.push(k); k = 1; }
  }
  runs.push(k);
  const r = runs.filter(x => x > 1).sort((a, b) => b - a).join(',');
  return { '': 'Aucune suite', '2': '1 paire', '2,2': '2 paires', '3': '1 triplet', '3,2': 'Triplet + paire', '4': 'Suite de 4', '5': 'Suite de 5' }[r];
}
const nbPairs = c => c.filter(x => x % 2 === 0).length;
const vecteur = c => { const v = [0, 0, 0, 0, 0]; c.forEach(x => v[Math.min(Math.floor(x / 10), 4)]++); return v; };
const maxMemeUnite = c => { const u = {}; c.forEach(x => { u[x % 10] = (u[x % 10] || 0) + 1; }); return Math.max(...Object.values(u)); };
const nbHauts = c => c.filter(x => x > SEUIL_HAUT).length;
const cle = c => [...c].sort((a, b) => a - b).join('-');

function violations(c, historique) {
  let v = 0;
  if (new Set(c).size < 5) v += 5;
  if (!SUITES_OK.has(suiteType(c))) v += 1;
  const p = nbPairs(c);
  if (!PAIRS_OK.has(p)) v += p < 1 ? 1 - p : p - 4;
  vecteur(c).forEach(n => { if (n > MAX_PAR_DIZAINE) v += n - MAX_PAR_DIZAINE; });
  const mu = maxMemeUnite(c);
  if (mu > MAX_MEME_UNITE) v += mu - MAX_MEME_UNITE;
  const h = nbHauts(c);
  if (h < MIN_HAUTS) v += MIN_HAUTS - h;
  if (h > MAX_HAUTS) v += h - MAX_HAUTS;
  if (historique.has(cle(c))) v += 1;
  return v;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Recherche locale : 50 cases (49 numéros + 1 doublon) réparties en 10 grilles
// qui respectent toutes les règles.
function genererGrilles(doublon, historique) {
  for (let essai = 0; essai < 30; essai++) {
    const nums = shuffle([...Array(49).keys()].map(i => i + 1).concat(doublon));
    const grilles = Array.from({ length: 10 }, (_, g) => nums.slice(g * 5, g * 5 + 5));
    const cout = grilles.map(g => violations(g, historique));
    let total = cout.reduce((a, b) => a + b, 0);
    for (let it = 0; it < 60000 && total > 0; it++) {
      const mauvaises = cout.map((c, i) => (c > 0 ? i : -1)).filter(i => i >= 0);
      const a = mauvaises[Math.floor(Math.random() * mauvaises.length)];
      let b = Math.floor(Math.random() * 9);
      if (b >= a) b++;
      const ia = Math.floor(Math.random() * 5), ib = Math.floor(Math.random() * 5);
      [grilles[a][ia], grilles[b][ib]] = [grilles[b][ib], grilles[a][ia]];
      const ca = violations(grilles[a], historique), cb = violations(grilles[b], historique);
      const delta = ca + cb - cout[a] - cout[b];
      if (delta <= 0 || Math.random() < Math.exp(-delta / 0.4)) {
        total += delta; cout[a] = ca; cout[b] = cb;
      } else {
        [grilles[a][ia], grilles[b][ib]] = [grilles[b][ib], grilles[a][ia]];
      }
    }
    if (total === 0) return grilles.map(g => g.sort((x, y) => x - y));
  }
  return null;
}

if (typeof module !== 'undefined') module.exports = { genererGrilles, violations, suiteType, vecteur, nbPairs, maxMemeUnite, nbHauts, cle, shuffle };
