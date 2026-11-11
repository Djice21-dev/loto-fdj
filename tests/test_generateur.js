// Vérifie que le générateur produit 10 grilles valides couvrant 1 à 49.
const assert = require('assert');
const path = require('path');
const R = require(path.join(__dirname, '..', 'docs', 'regles.js'));
const draws = (() => { try { return require(path.join(__dirname, '..', 'docs', 'data', 'draws.json')); } catch { return []; } })();
const histo = new Set(draws.map(d => R.cle(d.boules)));
let total = 0;
for (let run = 0; run < 200; run++) {
  const doublon = 1 + (run % 49);
  const t0 = Date.now();
  const g = R.genererGrilles(doublon, histo);
  total += Date.now() - t0;
  assert(g, 'pas de solution');
  assert.strictEqual(g.length, 10);
  const flat = g.flat();
  assert.strictEqual(new Set(flat).size, 49);
  assert.strictEqual(flat.filter(x => x === doublon).length, 2);
  g.forEach(c => assert.strictEqual(R.violations(c, histo), 0, c.join('-')));
}
console.log(`200 jeux de 10 grilles valides, ${(total / 200).toFixed(1)} ms en moyenne`);
