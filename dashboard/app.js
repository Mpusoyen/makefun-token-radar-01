// app.js — the radar page's behaviour: draw the scope from the top
// contacts, render the board from data.js (window.RADAR, written by
// main.ts from the same board.json), sort / filter / preset it in place,
// and open a per-protocol detail panel that tells the story of the rank:
// the value model's working, a plain-language why, a verdict, and the
// full farm plan. No framework, no network.
//
// Screenshots are posed with query parameters: ?detail=<slug> opens that
// protocol's panel, and ?q=&cat=&watch=1&preset=<name> pre-set the view —
// a posed URL renders the same view a reader could click to.

const R = window.RADAR;
const $ = (id) => document.getElementById(id);
const money = (v) => (v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1e3)}K`);
const pct = (v) => (v === null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`);
const maxImplied = Math.max(...R.rows.map((r) => r.implied_value_usd));

// The model's four factors, named for readers.
const FACTORS = [
  ['base', 'category multiple'],
  ['growth', '7-day growth'],
  ['maturity', 'maturity'],
  ['breadth', 'chain breadth'],
];

// The factor that moves this row most, for the board's Signal column and
// the detail panel's why-line. Log distance from 1.0, so a halving and a
// doubling weigh the same.
function driver(r) {
  let best = null;
  for (const [key, label] of FACTORS) {
    const v = r.parts[key];
    const d = Math.abs(Math.log(v));
    if (!best || d > best.d) best = { key, label, v, d };
  }
  return best;
}

function whyLine(r) {
  const d = driver(r);
  const bits = [];
  if (d.key === 'growth' && r.change_7d !== null) bits.push(`TVL is ${r.change_7d >= 0 ? 'climbing' : 'sliding'} ${pct(r.change_7d)} in 7 days, and the model pays ×${d.v} for that momentum`);
  else if (d.key === 'maturity') bits.push(`it has run ${r.months_live} months with no token, and the model pays ×${d.v} for surviving that long unlaunched`);
  else if (d.key === 'base') bits.push(`traded ${r.category} protocols carry a median ×${d.v} market-cap/TVL, and this row inherits that multiple`);
  else if (d.key === 'breadth') bits.push(`it already lives on ${r.chains.length} chains, worth ×${d.v} of first-day market breadth`);
  if (r.watchlist) bits.push('it sits on the make.fun watchlist (≥ $50M TVL, records no token)');
  else if (r.months_live !== null && r.months_live < 6) bits.push('it is a fresh contact — under six months listed, so the rank is speculative');
  return bits.join('; ') + '.';
}

// A one-line version of the why, for the top-pick cards.
function shortWhy(r) {
  const d = driver(r);
  if (d.key === 'growth' && r.change_7d !== null) return `TVL ${pct(r.change_7d)} in 7 days — the model pays ×${d.v} for that momentum.`;
  if (d.key === 'maturity') return `${r.months_live} months live, still no token — maturity pays ×${d.v}.`;
  if (d.key === 'base') return `${r.category} peers trade at ×${d.v} mcap/TVL — this row inherits that multiple.`;
  return `Live on ${r.chains.length} chains — breadth pays ×${d.v} of first-day market.`;
}

function verdict(r) {
  if (r.rank <= 25 && r.tvl_usd >= 50_000_000) return ['FARM FIRST', '', 'Top-25 implied value on real TVL. If you farm one tier of this board, start here.'];
  if (r.rank <= 100) return ['WORTH A WALLET', '', 'Strong implied value; a steady weekly rhythm is the whole cost of staying eligible.'];
  if (r.months_live !== null && r.months_live < 6) return ['SPECULATIVE CONTACT', 'amber', 'Young protocol, thin record. Small capital, watch TVL monthly, be ready to walk away.'];
  return ['LONG SHOT', 'amber', 'The model sees value, but the queue ahead of it is long. Farm only if the product itself is useful to you.'];
}

function capitalTier(tvl) {
  if (tvl >= 250_000_000) return '$2,000–$10,000';
  if (tvl >= 50_000_000) return '$500–$2,500';
  return '$100–$750';
}

// --- Header: stats, scope, top picks, calibration chips -------------------
$('stats').innerHTML = [
  [R.total_protocols, 'protocols scanned'],
  [R.pre_token, 'record no token'],
  [`${R.board_size}`, 'rows on the board'],
  [`${R.watchlist_size}/${R.watchlist_size}`, 'watchlist covered'],
  [R.as_of, 'snapshot date'],
].map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');

// The scope: rings and crosshair in SVG, one blip per top-14 contact.
// Angle is a stable hash of the slug; distance shrinks as rank improves,
// so the strongest contacts cluster at the centre of the sweep.
(function drawScope() {
  const cx = 100, cy = 100;
  let s = '';
  for (const rr of [96, 72, 48, 24]) s += `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="none" stroke="#223528" stroke-width="1"/>`;
  s += `<circle cx="${cx}" cy="${cy}" r="96" fill="rgba(47,230,168,0.03)"/><line x1="${cx - 96}" y1="${cy}" x2="${cx + 96}" y2="${cy}" stroke="#182620"/><line x1="${cx}" y1="${cy - 96}" x2="${cx}" y2="${cy + 96}" stroke="#182620"/>`;
  for (const r of R.rows.slice(0, 14)) {
    let h = 0;
    for (const ch of r.slug) h = (h * 31 + ch.charCodeAt(0)) % 628;
    const a = h / 100;
    const dist = 14 + (r.rank / 14) * 74;
    const x = (cx + dist * Math.cos(a)).toFixed(1), y = (cy + dist * Math.sin(a)).toFixed(1);
    const rad = Math.max(2.4, 5.2 * Math.sqrt(r.implied_value_usd / maxImplied));
    s += `<circle cx="${x}" cy="${y}" r="${rad.toFixed(1)}" fill="${r.watchlist ? '#ffb454' : '#2fe6a8'}" opacity="${r.rank <= 3 ? 1 : 0.75}"><title>#${r.rank} ${r.name} — ${money(r.implied_value_usd)}</title></circle>`;
  }
  s += `<circle cx="${cx}" cy="${cy}" r="2.6" fill="#2fe6a8"/>`;
  $('scope-svg').innerHTML = s;
})();

$('picks').innerHTML = R.rows.slice(0, 5).map((r) => `
  <button class="pick" data-slug="${r.slug}">
    <div class="pr">CONTACT #${r.rank}${r.watchlist ? ' · ★ WATCHLIST' : ''}</div>
    <div class="pn">${r.name}</div>
    <div class="pv">${money(r.implied_value_usd)}</div>
    <div class="pw">TVL ${money(r.tvl_usd)} · 7d <b>${pct(r.change_7d)}</b><br>${shortWhy(r)}</div>
  </button>`).join('');
for (const b of $('picks').querySelectorAll('.pick')) b.addEventListener('click', () => openDetail(b.dataset.slug));

$('multiples').innerHTML = R.multiples
  .slice(0, 12)
  .map((m) => `<span>${m.category} <b>×${m.multiple}</b> (${m.samples} traded)</span>`)
  .join('') + (R.multiples.length > 12 ? `<span>+${R.multiples.length - 12} more categories</span>` : '');
$('live').innerHTML = R.live
  .slice(0, 14)
  .map((p) => `<span><b>${p.name}</b> ${p.symbol ?? ''} · mcap ${money(p.mcap_usd)} · ×${p.ratio} TVL</span>`)
  .join('');

// --- Board: filters, presets, sort -----------------------------------------
const state = { sort: 'rank', dir: 1, q: '', cat: '', chain: '', minTvl: 0, preset: 'all' };
const PRESETS = {
  all: () => true,
  watch: (r) => r.watchlist,
  top25: (r) => r.rank <= 25,
  growing: (r) => r.change_7d !== null && r.change_7d > 0,
  veteran: (r) => r.months_live !== null && r.months_live >= 24,
  fresh: (r) => r.months_live !== null && r.months_live < 6,
};

const cats = [...new Set(R.rows.map((r) => r.category))].sort();
for (const c of cats) $('cat').insertAdjacentHTML('beforeend', `<option>${c}</option>`);
const chains = [...new Set(R.rows.flatMap((r) => r.chains))].sort();
for (const c of chains) $('chain').insertAdjacentHTML('beforeend', `<option>${c}</option>`);

function visibleRows() {
  const keep = PRESETS[state.preset] ?? PRESETS.all;
  let rows = R.rows.filter((r) =>
    keep(r) &&
    (!state.q || r.name.toLowerCase().includes(state.q) || r.slug.includes(state.q)) &&
    (!state.cat || r.category === state.cat) &&
    (!state.chain || r.chains.includes(state.chain)) &&
    r.tvl_usd >= state.minTvl);
  const key = state.sort;
  rows = [...rows].sort((a, b) => {
    const av = a[key], bv = b[key];
    if (av === null) return 1;
    if (bv === null) return -1;
    return (typeof av === 'string' ? av.localeCompare(bv) : av - bv) * state.dir;
  });
  return rows;
}

function ageBadge(r) {
  if (r.months_live === null) return '';
  if (r.months_live < 6) return '<span class="badge new">FRESH</span>';
  if (r.months_live >= 24) return '<span class="badge vet">VETERAN</span>';
  return '';
}

function render() {
  const rows = visibleRows();
  $('count').textContent = `${rows.length} of ${R.rows.length} protocols`;
  $('rows').innerHTML = rows.map((r) => {
    const d = driver(r);
    return `
    <tr data-slug="${r.slug}"${r.rank <= 3 ? ' class="top3"' : ''}>
      <td class="rank">${r.rank <= 3 ? `<b>${r.rank}</b>` : r.rank}</td>
      <td class="name">${r.name}${r.watchlist ? '<span class="badge">★ WATCHLIST</span>' : ''}${ageBadge(r)}<div class="chains">${r.chains.slice(0, 3).join(' · ')}</div></td>
      <td>${r.category}</td>
      <td class="num">${money(r.tvl_usd)}</td>
      <td class="num ${r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down'}">${pct(r.change_7d)}</td>
      <td class="num">${r.months_live === null ? '—' : `${r.months_live} mo`}</td>
      <td class="num"><b>${money(r.implied_value_usd)}</b><div class="vbar"><i style="width:${Math.max(2, (r.implied_value_usd / maxImplied) * 100)}%"></i></div></td>
      <td><span class="driver ${d.v >= 1.25 ? 'hot' : d.v <= 0.8 ? 'cold' : ''}">${d.label} <b>×${d.v}</b></span></td>
      <td><span class="plan-link">Farm plan →</span></td>
    </tr>`;
  }).join('');
  for (const tr of $('rows').querySelectorAll('tr')) {
    tr.addEventListener('click', () => openDetail(tr.dataset.slug));
  }
  for (const th of document.querySelectorAll('thead th[data-sort]')) {
    const on = th.dataset.sort === state.sort;
    th.classList.toggle('sorted', on);
    th.classList.toggle('asc', on && state.dir === 1 && state.sort !== 'rank');
  }
}

// --- Detail panel ------------------------------------------------------------
function openDetail(slug) {
  const r = R.rows.find((x) => x.slug === slug);
  if (!r) return;
  const [vLabel, vClass, vText] = verdict(r);
  const bar = (label, v, max) => `
    <div class="bar-row"><span class="lbl">${label}</span><span class="bar"><i class="${v < 1 ? 'neg' : ''}" style="width:${Math.min(100, (v / max) * 100)}%"></i></span><span class="val">×${v}</span></div>`;
  const ahead = R.rows.length - r.rank;
  $('detail-body').innerHTML = `
    <h2>${r.name}</h2>
    <div class="sub">${r.category} · contact #${r.rank} of ${R.rows.length}${r.watchlist ? ' · ★ on the make.fun watchlist' : ' · below the watchlist floor — the radar found it anyway'}</div>
    <div class="verdict ${vClass}"><b>${vLabel}</b> — ${vText}</div>
    <p class="why"><strong>Why #${r.rank}:</strong> ${whyLine(r)} Its implied value outranks ${ahead} of the ${R.rows.length} protocols on this board.</p>
    <dl class="kv">
      <dt>Implied value</dt><dd>${money(r.implied_value_usd)}</dd>
      <dt>TVL (snapshot)</dt><dd>${money(r.tvl_usd)}</dd>
      <dt>Implied × TVL</dt><dd>×${r.multiple}</dd>
      <dt>7-day TVL change</dt><dd>${pct(r.change_7d)}</dd>
      <dt>Running, no token</dt><dd>${r.months_live === null ? 'listing date not recorded' : `${r.months_live} months`}</dd>
      <dt>Chains</dt><dd>${r.chains.slice(0, 8).join(', ')}${r.chains.length > 8 ? ` +${r.chains.length - 8} more` : ''}</dd>
      <dt>Token status</dt><dd>records no token</dd>
    </dl>
    <h3>How the value is built</h3>
    ${bar('Category', r.parts.base, 2.5)}
    ${bar('Growth', r.parts.growth, 2)}
    ${bar('Maturity', r.parts.maturity, 1.5)}
    ${bar('Breadth', r.parts.breadth, 1.2)}
    <p class="sub">TVL × those four factors = ${money(r.implied_value_usd)}. The category factor is the median
    mcap/TVL of traded ${r.category} protocols in the same snapshot — the model prices this launch the way
    the market already prices its launched peers.</p>
    <h3>The farm plan</h3>
    <div class="plan-meta">Working capital ${capitalTier(r.tvl_usd)} · ~20–30 min a week · 8–12 weeks of rhythm</div>
    <ol>${r.farm_steps.map((s) => `<li>${s}</li>`).join('')}</ol>`;
  $('detail').hidden = false;
}

$('close').addEventListener('click', () => { $('detail').hidden = true; });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') $('detail').hidden = true;
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); $('q').focus(); }
});
$('q').addEventListener('input', (e) => { state.q = e.target.value.trim().toLowerCase(); render(); });
$('cat').addEventListener('change', (e) => { state.cat = e.target.value; render(); });
$('chain').addEventListener('change', (e) => { state.chain = e.target.value; render(); });
$('minTvl').addEventListener('change', (e) => { state.minTvl = Number(e.target.value); render(); });
for (const b of $('chips').querySelectorAll('button')) {
  b.addEventListener('click', () => {
    state.preset = b.dataset.preset;
    for (const x of $('chips').querySelectorAll('button')) x.classList.toggle('on', x === b);
    render();
  });
}
for (const th of document.querySelectorAll('thead th[data-sort]')) {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    if (state.sort === key) state.dir *= -1;
    else { state.sort = key; state.dir = key === 'name' || key === 'category' ? 1 : -1; }
    if (key === 'rank') state.dir = 1;
    render();
  });
}
function setPreset(name) {
  if (!PRESETS[name]) return;
  state.preset = name;
  for (const x of $('chips').querySelectorAll('button')) x.classList.toggle('on', x.dataset.preset === name);
}

// Posed views for screenshots and shared links.
const params = new URLSearchParams(window.location.search);
if (params.get('q')) { $('q').value = params.get('q'); state.q = params.get('q').toLowerCase(); }
if (params.get('cat')) { $('cat').value = params.get('cat'); state.cat = params.get('cat'); }
if (params.get('watch') === '1') setPreset('watch');
if (params.get('preset')) setPreset(params.get('preset'));
render();
if (params.get('detail')) openDetail(params.get('detail'));
