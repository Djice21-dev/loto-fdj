// Loto FDJ — générateur de grilles selon la méthode validée le 11/11/2026.
// Règles : suites (aucune ou 1 paire), parité (1 à 4 pairs), au plus 2 numéros par dizaine,
// au plus 2 numéros de même terminaison, de 1 à 3 numéros au-dessus de 31,
// au plus 2 cases qui se suivent dans une colonne du bulletin,
// combinaison jamais sortie depuis le 6 octobre 2008 (premier ou second tirage).

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
  const ok = c => violations(c, new Set()) === 0;
  const badge = c => `<span class="badge ${ok(c) ? 'ok' : 'ko'}">${ok(c) ? 'Dans les critères' : 'Hors critères'}</span>`;
  $('#dernier').innerHTML = `<div class="tirage-ligne"><span class="sub">Premier tirage · ${new Date(d.date).toLocaleDateString('fr-FR')}</span>
      <div class="boules">${d.boules.map(b => boule(b)).join('')}${boule(d.chance, 'chance')}${badge(d.boules)}</div></div>` +
    (d.second ? `<div class="tirage-ligne"><span class="sub">Second tirage</span>
      <div class="boules">${d.second.map(b => boule(b, 'second')).join('')}${badge(d.second)}</div></div>` : '');

  const c = s.couverture;
  $('#couverture').innerHTML = `<div class="kpi"><b>${fmtPct(c.attendue)}</b><span>tirages conformes attendus (théorie)</span></div>
    <div class="kpi"><b>${fmtPct(c.observee)}</b><span>tirages conformes observés (${fmtInt(c.tirages_conformes)} sur ${fmtInt(n)})</span></div>
    <div class="kpi"><b>${fmtInt(s.theorie.conservees)}</b><span>combinaisons conservées sur ${fmtInt(s.theorie.total)} (règles 1 à 6)</span></div>` +
    (c.jouables !== undefined ? `<div class="kpi"><b>${fmtInt(c.jouables)}</b><span>combinaisons jouables (règles 1 à 7, ${fmtInt(c.deja_sorties)} déjà sorties retirées)</span></div>` : '');

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
const fmtD = s => new Date(s).toLocaleDateString('fr-FR');
const libC = r => (r ? 'dans les critères' : 'hors critères');

function calculSeries(liste) { // liste : [{date, combo}] dans l'ordre chronologique
  const vide = new Set();
  const res = liste.map(t => violations(t.combo, vide) === 0);
  const n = res.length, nIn = res.filter(Boolean).length;
  const cur = res[n - 1];
  let len = 0;
  while (len < n && res[n - 1 - len] === cur) len++;
  const best = { true: { len: 0, fin: -1 }, false: { len: 0, fin: -1 } };
  let k = 0;
  res.forEach((r, i) => {
    k = i > 0 && res[i - 1] === r ? k + 1 : 1;
    if (k >= best[r].len) best[r] = { len: k, fin: i };
  });
  return { liste, res, n, nIn, cur, len, best };
}

function barre(nIn, n, petite = false) {
  const p = nIn / n;
  return `<div class="repart${petite ? ' petite' : ''}">
    <div class="in" style="width:${p * 100}%">${fmtInt(nIn)} · ${fmtPct(p)}</div>
    <div class="out" style="width:${(1 - p) * 100}%">${fmtInt(n - nIn)} · ${fmtPct(1 - p)}</div></div>`;
}

function carteSeries(titre, depuis, S, pTheo) {
  const periode = b => b.len ? `du ${fmtD(S.liste[b.fin - b.len + 1].date)}<br>au ${fmtD(S.liste[b.fin].date)}` : '';
  const derniers = S.liste.slice(-50).map((t, j, a) => {
    const r = S.res[S.n - a.length + j];
    return `<span class="pion ${r ? 'in' : 'out'}${j === a.length - 1 ? ' last' : ''}" title="${fmtD(t.date)} : ${t.combo.join('-')} (${libC(r)})"></span>`;
  }).join('');
  const pSerie = Math.pow(S.cur ? pTheo : 1 - pTheo, S.len);
  return `<h3>${titre} <small>${fmtInt(S.n)} tirages depuis ${depuis}</small></h3>
    ${barre(S.nIn, S.n, true)}
    <div class="serie-kpis">
      <div class="kpi ${S.cur ? 'in' : 'out'}"><b>${S.len}</b><span>série en cours<br>${libC(S.cur)}</span></div>
      <div class="kpi in"><b>${S.best.true.len}</b><span>série max dans les critères<br>${periode(S.best.true)}</span></div>
      <div class="kpi out"><b>${S.best.false.len}</b><span>série max hors critères<br>${periode(S.best.false)}</span></div>
    </div>
    <div class="pions-titre">50 derniers tirages <small>(le plus récent à droite)</small></div>
    <div class="pions">${derniers}</div>
    <p class="test">Probabilité d'une série de ${S.len} ${libC(S.cur)} : ${fmtPct(pSerie)}.</p>`;
}

function afficherSeries() {
  if (!DRAWS.length) return;
  const P1 = calculSeries(DRAWS.map(d => ({ date: d.date, combo: d.boules })));
  const sec = DRAWS.filter(d => d.second);
  const P2 = sec.length ? calculSeries(sec.map(d => ({ date: d.date, combo: d.second }))) : null;
  const pTheo = STATS ? STATS.couverture.attendue : P1.nIn / P1.n;
  const nTot = P1.n + (P2 ? P2.n : 0), inTot = P1.nIn + (P2 ? P2.nIn : 0);
  $('#series').innerHTML = `
    <h3>Répartition des ${fmtInt(nTot)} tirages selon vos critères <small>(premier + second tirage)</small></h3>
    ${barre(inTot, nTot)}
    <div class="legende"><span><b style="color:var(--ok)">● Dans les critères</b></span><span><b style="color:var(--ko)">● Hors critères</b></span><span>Théorie : ${fmtPct(pTheo)} dans les critères</span></div>
    <p class="test">Comme à la roulette, chaque tirage est indépendant : le prochain a toujours ${fmtPct(pTheo)} de chances d'être dans les critères, quelle que soit la série en cours.</p>`;
  $('#serie-premier').innerHTML = carteSeries('Premier tirage', 'le 06/10/2008', P1, pTheo);
  $('#serie-second').innerHTML = P2 ? carteSeries('Second tirage', 'le ' + fmtD(sec[0].date), P2, pTheo) : '';
}

async function init() {
  try {
    const [stats, draws] = await Promise.all([
      fetch('data/stats.json', { cache: 'no-cache' }).then(r => r.json()),
      fetch('data/draws.json', { cache: 'no-cache' }).then(r => r.json()),
    ]);
    STATS = stats; DRAWS = draws;
    // combinaisons déjà sorties : premier tirage et second tirage (depuis novembre 2019)
    HISTO = new Set(draws.flatMap(d => (d.second ? [d.boules, d.second] : [d.boules]).map(cle)));
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
