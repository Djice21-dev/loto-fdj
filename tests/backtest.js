// Test du modèle sur tous les tirages depuis le 06/10/2008, sans données futures.
// Stratégies : MODELE (10 grilles selon les règles, couvrant 1-49), COUVERTURE (10 grilles couvrant
// 1-49 sans règles), HASARD (10 grilles Flash indépendantes). Gains = rapports officiels FDJ.
// Usage : node tests/backtest.js [nb_simulations] > resultats.json
const path = require('path');
const R = require(path.join(__dirname, '..', 'docs', 'regles.js'));
const draws = require(path.join(__dirname, '..', 'docs', 'data', 'draws.json'));
const raps = require(path.join(__dirname, '..', 'docs', 'data', 'rapports.json'));
const S = +(process.argv[2] || 200);

const num = s => (s === undefined || s === '' ? 0 : parseFloat(String(s).replace(',', '.')));
// formule FDJ du tirage : 6 rangs (2008-2017) ou 9 rangs (depuis 2017)
const info = raps.map(r => {
  const nr = 'rapport_du_rang9' in r ? 9 : 6;
  const rang = [], gagnants = [];
  for (let k = 1; k <= nr; k++){ rang[k] = num(r['rapport_du_rang' + k]); gagnants[k] = num(r['nombre_de_gagnant_au_rang' + k]); }
  return { nr, rang, gagnants, prix: rang[nr] }; // le dernier rang rembourse la mise
});
// moyenne par rang et par formule, pour les rares rapports non publiés (aucun gagnant)
const moy = { 6: [], 9: [] };
for (const nr of [6, 9]) for (let k = 1; k <= nr; k++){
  const v = info.filter(x => x.nr === nr && x.gagnants[k] > 0).map(x => x.rang[k]);
  moy[nr][k] = v.reduce((a, b) => a + b, 0) / v.length;
}

function rangDe(nr, m, c){
  if (nr === 9){
    if (m === 5) return c ? 1 : 2;
    if (m === 4) return c ? 3 : 4;
    if (m === 3) return c ? 5 : 6;
    if (m === 2) return c ? 7 : 8;
    return c ? 9 : 0;
  }
  if (m === 5) return c ? 1 : 2;
  if (m === 4) return 3;
  if (m === 3) return 4;
  if (m === 2) return 5;
  return c ? 6 : 0;
}
function gain(t, rang){
  if (!rang) return 0;
  const x = info[t], r = x.rang[rang], n = x.gagnants[rang];
  if (rang === 1) return n === 0 ? (r > 0 ? r : 2e6) : r * n / (n + 1);    // jackpot partagé avec les autres gagnants
  if (rang === 2 && n > 0) return r * n / (n + 1);
  return r > 0 ? r : moy[x.nr][rang];
}

const rnd = n => Math.floor(Math.random() * n);
function grillesModele(histo){
  const g = R.genererGrilles(1 + rnd(49), histo);
  return g;
}
function grillesCouverture(){
  const nums = R.shuffle([...Array(49).keys()].map(i => i + 1).concat(1 + rnd(49)));
  for (;;){ // 10 paquets de 5 sans doublon interne
    const g = Array.from({ length: 10 }, (_, k) => nums.slice(k * 5, k * 5 + 5));
    if (g.every(c => new Set(c).size === 5)) return g;
    R.shuffle(nums);
  }
}
function grillesHasard(){
  return Array.from({ length: 10 }, () => R.shuffle([...Array(49).keys()].map(i => i + 1)).slice(0, 5));
}

function simuler(strategie, detail){
  const histo = new Set();
  const res = { mise: 0, gains: 0, rangs: Array(10).fill(0), meilleurs: [], cumul: [] };
  for (let t = 0; t < draws.length; t++){
    const d = draws[t], tir = new Set(d.boules), x = info[t];
    const grilles = strategie === 'MODELE' ? grillesModele(histo) : strategie === 'COUVERTURE' ? grillesCouverture() : grillesHasard();
    const chances = strategie === 'HASARD' ? grilles.map(() => 1 + rnd(10)) : R.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    grilles.forEach((g, i) => {
      const m = g.filter(n => tir.has(n)).length, c = chances[i] === d.chance;
      const rg = rangDe(x.nr, m, c), v = gain(t, rg);
      res.mise += x.prix; res.gains += v;
      if (rg){
        // rangs ramenés à la formule à 9 rangs pour comparer les époques
        const r9 = x.nr === 9 ? rg : rangDe(9, m, c);
        res.rangs[r9]++;
        if (detail && m >= 4) res.meilleurs.push({ date: d.date, grille: [...g].sort((a, b) => a - b), chance: chances[i], tirage: d.boules, numero_chance: d.chance, bons: m, chance_ok: c, gain: Math.round(v * 100) / 100 });
      }
    });
    res.cumul.push(Math.round(res.gains - res.mise));
    histo.add(R.cle(d.boules)); // le tirage n'est connu qu'après coup
  }
  res.solde = res.gains - res.mise;
  if (!detail) delete res.cumul;
  return res;
}

const out = { tirages: draws.length, simulations: S, strategies: {} };
for (const st of ['MODELE', 'COUVERTURE', 'HASARD']){
  const runs = [];
  for (let s = 0; s < S; s++) runs.push(simuler(st, false));
  const soldes = runs.map(r => r.solde).sort((a, b) => a - b);
  const q = p => soldes[Math.min(soldes.length - 1, Math.floor(p * soldes.length))];
  const rangsMoy = Array(10).fill(0).map((_, k) => runs.reduce((a, r) => a + r.rangs[k], 0) / S);
  const avecGrosGain = runs.filter(r => r.rangs[1] + r.rangs[2] > 0).length;
  out.strategies[st] = {
    mise: runs[0].mise, gains_moyens: runs.reduce((a, r) => a + r.gains, 0) / S,
    solde_moyen: runs.reduce((a, r) => a + r.solde, 0) / S, solde_p05: q(0.05), solde_median: q(0.5), solde_p95: q(0.95),
    gains_ecart_type: Math.sqrt(runs.reduce((a, r) => a + (r.gains - runs.reduce((b, z) => b + z.gains, 0) / S) ** 2, 0) / (S - 1)),
    gains_tous: runs.map(r => Math.round(r.gains)),
    rangs_moyens: rangsMoy, part_simulations_rang1ou2: avecGrosGain / S,
  };
  process.stderr.write(st + ' ok\n');
}
// une simulation détaillée par stratégie (meilleures grilles, solde cumulé)
out.detail = {};
for (const st of ['MODELE', 'COUVERTURE', 'HASARD']) out.detail[st] = simuler(st, true);
out.dates = draws.map(d => d.date);
console.log(JSON.stringify(out));
