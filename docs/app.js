// Loto FDJ — générateur de grilles selon la méthode validée le 11/11/2026.
// Règles : suites (aucune ou 1 paire), parité (1 à 4 pairs), au plus 2 numéros par dizaine,
// au plus 2 numéros de même terminaison, de 1 à 3 numéros au-dessus de 31,
// au plus 2 cases qui se suivent dans une colonne du bulletin,
// combinaison jamais sortie depuis le 6 octobre 2008.

const fmtPct = (x, d = 1) => x > 0 && x < 0.0001 ? '< 0,01 %' : (x * 100).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' %';
const fmtInt = x => x.toLocaleString('fr-FR');
const $ = sel => document.querySelector(sel);

let STATS = null, DRAWS = [], HISTO = new Set();

// Le doublon est tiré au hasard : les sorties passées n'ont pas de valeur prédictive.
const choisirDoublon = () => 1 + Math.floor(Math.random() * 49);

function boule(n, cls = '') { return `<span class="boule ${cls}">${n}</span>`; }

function generer() {
  const doublon = choisirDoublon();
  const grilles = genererGrilles(doublon, HISTO);
  const out = $('#grilles');
  if (!grilles) { out.innerHTML = '<p class="alerte">Aucune solution trouvée, relancez la génération.</p>'; return; }
  const chances = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const couverts = new Set(grilles.flat());
  $('#resume-grilles').innerHTML =
    `${couverts.size}/49 numéros couverts · doublon : <b>${doublon}</b> (tiré au hasard) · numéros Chance 1 à 10, un par grille`;
  out.innerHTML = grilles.map((g, i) => {
    const p = nbPairs(g);
    return `<div class="grille">
      <div class="num">Grille ${i + 1}</div>
      <div class="boules">${g.map(n => boule(n, n === doublon ? 'doublon' : '')).join('')}${boule(chances[i], 'chance')}</div>
      <div class="tags"><span>${suiteType(g)}</span><span>${p} pairs / ${5 - p} impairs</span><span>${vecteur(g).join('-')}</span></div>
    </div>`;
  }).join('');
  window.__dernieresGrilles = grilles.map((g, i) => `${g.join(' ')} | ${chances[i]}`).join('\n');
}

function copier() {
  if (!window.__dernieresGrilles) return;
  navigator.clipboard?.writeText(window.__dernieresGrilles).then(() => {
    $('#btn-copier').textContent = 'Copié';
    setTimeout(() => ($('#btn-copier').textContent = 'Copier'), 1500);
  });
}

function tableComparaison(titre, theorie, observe, n, ordre, retenu, libelle = k => k) {
  const total = Object.values(theorie).reduce((a, b) => a + b, 0);
  const rows = ordre.map(k => {
    const t = (theorie[k] || 0) / total, o = n ? (observe[k] || 0) / n : 0;
    return `<tr class="${retenu(k) ? 'ok' : 'ko'}"><td>${libelle(k)}</td><td>${fmtPct(t, 2)}</td><td>${fmtPct(o, 2)}</td><td class="col-n">${fmtInt(observe[k] || 0)}</td><td class="col-r">${retenu(k) ? '✓' : '✗'}</td></tr>`;
  }).join('');
  return `${titre ? `<h3>${titre}</h3>` : ''}<div class="table-wrap"><table><thead><tr><th>Profil</th><th>Théorie</th><th>Observé</th><th class="col-n">Tirages</th><th class="col-r">Retenu</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function texteTest(t) {
  if (!t) return '';
  const verdict = t.p_value < 0.05 ? 'écart significatif au seuil de 5 %' : 'pas d\'écart significatif : conforme au hasard';
  return `<p class="test">Test du khi-deux : χ² = ${t.khi2.toLocaleString('fr-FR')} (${t.ddl} ddl), p = ${t.p_value.toLocaleString('fr-FR')} → ${verdict}.</p>`;
}

function afficherStats() {
  const s = STATS, n = s.nb_tirages;
  const d = s.dernier;
  $('#etat').innerHTML = `${fmtInt(n)} tirages analysés du ${new Date(s.premier).toLocaleDateString('fr-FR')} au ${new Date(d.date).toLocaleDateString('fr-FR')} · mis à jour le ${new Date(s.maj).toLocaleString('fr-FR')}`;
  $('#dernier').innerHTML = `${d.boules.map(b => boule(b)).join('')}${boule(d.chance, 'chance')}
    <span class="badge ${s.couverture.dernier_conforme ? 'ok' : 'ko'}">${s.couverture.dernier_conforme ? 'Conforme aux règles' : 'Hors règles'}</span>` +
    (d.second ? `<div class="second-tirage"><span class="sub">Second tirage</span><div class="boules">${d.second.map(b => boule(b, 'second')).join('')}</div></div>` : '');

  const c = s.couverture;
  $('#couverture').innerHTML = `<div class="kpi"><b>${fmtPct(c.attendue)}</b><span>tirages conformes attendus (théorie)</span></div>
    <div class="kpi"><b>${fmtPct(c.observee)}</b><span>tirages conformes observés (${fmtInt(c.tirages_conformes)} sur ${fmtInt(n)})</span></div>
    <div class="kpi"><b>${fmtInt(s.theorie.conservees)}</b><span>combinaisons conservées sur ${fmtInt(s.theorie.total)}</span></div>`;

  const th = s.theorie, ob = s.observe;
  const ordreSuites = ['Aucune suite', '1 paire', '2 paires', '1 triplet', 'Triplet + paire', 'Suite de 4', 'Suite de 5'];
  // dizaines : 126 vecteurs, triés par probabilité théorique
  const ordreVec = Object.keys(th.vecteurs).sort((a, b) => th.vecteurs[b] - th.vecteurs[a] || a.localeCompare(b));
  $('#analyse').innerHTML =
    tableComparaison('Suites', th.suites, ob.suites, n, ordreSuites, k => ['Aucune suite', '1 paire'].includes(k)) + texteTest(s.tests.suites) +
    tableComparaison('Pair / impair (P = pairs, I = impairs)', th.pairs, ob.pairs, n, ['0', '1', '2', '3', '4', '5'], k => ['1', '2', '3', '4'].includes(k), k => `${k} P / ${5 - k} I`) + texteTest(s.tests.pairs) +
    `<details><summary>Dizaines : les 126 vecteurs [1-9]-[10-19]-[20-29]-[30-39]-[40-49]</summary>` +
    tableComparaison('', th.vecteurs, ob.vecteurs, n, ordreVec, k => Math.max(...k.split('-').map(Number)) <= MAX_PAR_DIZAINE) +
    `</details>` + texteTest(s.tests.dizaines) +
    (th.unites ? tableComparaison('Terminaisons (numéros avec le même chiffre des unités)', th.unites, ob.unites, n, ['1', '2', '3', '4', '5'], k => +k <= MAX_MEME_UNITE, k => k === '1' ? 'Toutes différentes' : `${k} identiques`) + texteTest(s.tests.unites) : '') +
    (th.hauts ? tableComparaison('Numéros au-dessus de 31', th.hauts, ob.hauts, n, ['0', '1', '2', '3', '4', '5'], k => +k >= MIN_HAUTS && +k <= MAX_HAUTS, k => `${k} numéro${+k > 1 ? 's' : ''}`) + texteTest(s.tests.hauts) : '') +
    (th.colonnes ? tableComparaison('Colonnes du bulletin (cases qui se suivent dans une colonne)', th.colonnes, ob.colonnes, n, ['1', '2', '3', '4', '5'], k => +k <= MAX_COLONNE, k => k === '1' ? 'Aucune' : `${k} cases`) + texteTest(s.tests.colonnes) : '');

}

// Séries « dans / hors critères » : comme les couleurs à la roulette.
// Critères = les 6 règles (sans l'historique, qui exclurait chaque tirage de lui-même).
function afficherSeries() {
  if (!DRAWS.length) return;
  const vide = new Set();
  const res = DRAWS.map(d => violations(d.boules, vide) === 0);
  const n = res.length, nIn = res.filter(Boolean).length, nOut = n - nIn;
  // série en cours
  const cur = res[n - 1];
  let len = 0;
  while (len < n && res[n - 1 - len] === cur) len++;
  // séries max (avec dates de fin)
  const best = { true: { len: 0, fin: -1 }, false: { len: 0, fin: -1 } };
  let k = 0;
  res.forEach((r, i) => {
    k = i > 0 && res[i - 1] === r ? k + 1 : 1;
    if (k >= best[r].len) best[r] = { len: k, fin: i };
  });
  const fmtD = i => new Date(DRAWS[i].date).toLocaleDateString('fr-FR');
  const periode = b => b.len ? `du ${fmtD(b.fin - b.len + 1)} au ${fmtD(b.fin)}` : '';
  const pIn = nIn / n;
  const lib = r => (r ? 'dans les critères' : 'hors critères');
  const derniers = DRAWS.slice(-50).map((d, j, a) => {
    const r = res[n - a.length + j];
    return `<span class="pion ${r ? 'in' : 'out'}${j === a.length - 1 ? ' last' : ''}" title="${new Date(d.date).toLocaleDateString('fr-FR')} : ${d.boules.join('-')} (${lib(r)})"></span>`;
  }).join('');
  const pSerie = Math.pow(cur ? pIn : 1 - pIn, len);
  $('#series').innerHTML = `
    <h3>Répartition des ${fmtInt(n)} tirages selon vos critères</h3>
    <div class="repart">
      <div class="in" style="width:${pIn * 100}%">${fmtInt(nIn)} · ${fmtPct(pIn)}</div>
      <div class="out" style="width:${(1 - pIn) * 100}%">${fmtInt(nOut)} · ${fmtPct(1 - pIn)}</div>
    </div>
    <div class="legende"><span><b style="color:var(--ok)">● Dans les critères</b></span><span><b style="color:var(--ko)">● Hors critères</b></span><span>Théorie : ${fmtPct(STATS ? STATS.couverture.attendue : pIn)} dans les critères</span></div>
    <div class="serie-kpis">
      <div class="kpi ${cur ? 'in' : 'out'}"><b>${len} tirage${len > 1 ? 's' : ''}</b><span>série en cours ${lib(cur)}</span></div>
      <div class="kpi in"><b>${best.true.len}</b><span>série max dans les critères<br>${periode(best.true)}</span></div>
      <div class="kpi out"><b>${best.false.len}</b><span>série max hors critères<br>${periode(best.false)}</span></div>
    </div>
    <h3>Les 50 derniers tirages (le plus récent à droite)</h3>
    <div class="pions">${derniers}</div>
    <p class="test">Une série de ${len} tirage${len > 1 ? 's' : ''} ${lib(cur)} a une probabilité de ${fmtPct(pSerie)}. Comme à la roulette, chaque tirage est indépendant : le prochain a toujours ${fmtPct(STATS ? STATS.couverture.attendue : pIn)} de chances d'être dans les critères, quelle que soit la série en cours.</p>`;
}

async function init() {
  try {
    const [stats, draws] = await Promise.all([
      fetch('data/stats.json', { cache: 'no-cache' }).then(r => r.json()),
      fetch('data/draws.json', { cache: 'no-cache' }).then(r => r.json()),
    ]);
    STATS = stats; DRAWS = draws;
    HISTO = new Set(draws.map(d => cle(d.boules)));
    afficherStats();
    afficherSeries();
  } catch (e) {
    $('#etat').textContent = 'Historique indisponible : les grilles sont générées sans exclusion des combinaisons déjà sorties.';
  }
  generer();
}

$('#btn-generer').addEventListener('click', generer);
$('#btn-copier').addEventListener('click', copier);
init();
