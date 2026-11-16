// app.js — the radar page's behaviour: render the board from data.js
// (window.RADAR, written by main.ts from the same board.json), sort and
// filter it in place, and open a per-protocol detail panel with the value
// model's working and the full farm plan. No framework, no network.
//
// Screenshots are posed with query parameters the kit's captures use:
// ?detail=<slug> opens that protocol's panel, and the filter inputs can be
// pre-set with ?q=&cat=&watch=1 — a posed URL renders the same view a
// reader could click to.

const R = window.RADAR;
const $ = (id) => document.getElementById(id);
const money = (v) => (v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1e3)}K`);
const pct = (v) => (v === null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`);

const state = { sort: 'rank', dir: 1, q: '', cat: '', chain: '', minTvl: 0, watch: false };

// Header stats and the calibration strip.
$('stats').innerHTML = [
  [R.total_protocols, 'protocols scanned'],
  [R.pre_token, 'record no token'],
  [`${R.board_size}`, 'rows on the board'],
  [`${R.watchlist_size}/${R.watchlist_size}`, 'watchlist covered'],
  [R.as_of, 'snapshot date'],
].map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
$('multiples').innerHTML = R.multiples
  .map((m) => `<span>${m.category} <b>×${m.multiple}</b> (${m.samples} traded)</span>`)
  .join('');
$('live').innerHTML = R.live
  .slice(0, 14)
  .map((p) => `<span><b>${p.name}</b> ${p.symbol ?? ''} · mcap ${money(p.mcap_usd)} · ×${p.ratio} TVL</span>`)
  .join('');

// Filter option lists, from the data itself.
const cats = [...new Set(R.rows.map((r) => r.category))].sort();
for (const c of cats) $('cat').insertAdjacentHTML('beforeend', `<option>${c}</option>`);
const chains = [...new Set(R.rows.flatMap((r) => r.chains))].sort();
for (const c of chains) $('chain').insertAdjacentHTML('beforeend', `<option>${c}</option>`);

function visibleRows() {
  let rows = R.rows.filter((r) =>
    (!state.q || r.name.toLowerCase().includes(state.q) || r.slug.includes(state.q)) &&
    (!state.cat || r.category === state.cat) &&
    (!state.chain || r.chains.includes(state.chain)) &&
    r.tvl_usd >= state.minTvl &&
    (!state.watch || r.watchlist));
  const key = state.sort;
  rows = [...rows].sort((a, b) => {
    const av = a[key], bv = b[key];
    if (av === null) return 1;
    if (bv === null) return -1;
    return (typeof av === 'string' ? av.localeCompare(bv) : av - bv) * state.dir;
  });
  return rows;
}

function render() {
  const rows = visibleRows();
  $('count').textContent = `${rows.length} of ${R.rows.length} protocols`;
  $('rows').innerHTML = rows.map((r) => `
    <tr data-slug="${r.slug}">
      <td>${r.rank}</td>
      <td class="name">${r.name}${r.watchlist ? '<span class="badge">WATCHLIST</span>' : ''}<div class="chains">${r.chains.slice(0, 3).join(' · ')}</div></td>
      <td>${r.category}</td>
      <td class="num">${money(r.tvl_usd)}</td>
      <td class="num ${r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down'}">${pct(r.change_7d)}</td>
      <td class="num">${r.months_live === null ? '—' : `${r.months_live} mo`}</td>
      <td class="num"><b>${money(r.implied_value_usd)}</b></td>
      <td class="num">×${r.multiple}</td>
      <td><span class="plan-link">Farm plan →</span></td>
    </tr>`).join('');
  for (const tr of $('rows').querySelectorAll('tr')) {
    tr.addEventListener('click', () => openDetail(tr.dataset.slug));
  }
}

function openDetail(slug) {
  const r = R.rows.find((x) => x.slug === slug);
  if (!r) return;
  const bar = (label, v, max) => `
    <div class="bar-row"><span class="lbl">${label}</span><span class="bar"><i style="width:${Math.min(100, (v / max) * 100)}%"></i></span><span>×${v}</span></div>`;
  $('detail-body').innerHTML = `
    <h2>${r.name}</h2>
    <div class="sub">${r.category} · rank #${r.rank} of ${R.rows.length}${r.watchlist ? ' · on the make.fun watchlist' : ''}</div>
    <dl class="kv">
      <dt>Implied value</dt><dd>${money(r.implied_value_usd)}</dd>
      <dt>TVL (snapshot)</dt><dd>${money(r.tvl_usd)}</dd>
      <dt>7-day TVL change</dt><dd>${pct(r.change_7d)}</dd>
      <dt>Running, no token</dt><dd>${r.months_live === null ? 'listing date not recorded' : `${r.months_live} months`}</dd>
      <dt>Chains</dt><dd>${r.chains.join(', ')}</dd>
      <dt>Token status</dt><dd>records no token</dd>
    </dl>
    <h3>How the value is built</h3>
    ${bar('Category', r.parts.base, 2.5)}
    ${bar('Growth', r.parts.growth, 2)}
    ${bar('Maturity', r.parts.maturity, 1.5)}
    ${bar('Breadth', r.parts.breadth, 1.2)}
    <p class="sub">TVL × those four factors = ${money(r.implied_value_usd)}. The category factor is the median
    mcap/TVL of traded ${r.category} protocols in the same snapshot.</p>
    <h3>The farm plan</h3>
    <ol>${r.farm_steps.map((s) => `<li>${s}</li>`).join('')}</ol>`;
  $('detail').hidden = false;
}

$('close').addEventListener('click', () => { $('detail').hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('detail').hidden = true; });
$('q').addEventListener('input', (e) => { state.q = e.target.value.trim().toLowerCase(); render(); });
$('cat').addEventListener('change', (e) => { state.cat = e.target.value; render(); });
$('chain').addEventListener('change', (e) => { state.chain = e.target.value; render(); });
$('minTvl').addEventListener('change', (e) => { state.minTvl = Number(e.target.value); render(); });
$('watchOnly').addEventListener('change', (e) => { state.watch = e.target.checked; render(); });
for (const th of document.querySelectorAll('thead th[data-sort]')) {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    if (state.sort === key) state.dir *= -1;
    else { state.sort = key; state.dir = key === 'name' || key === 'category' ? 1 : -1; }
    if (key === 'rank') state.dir = 1;
    render();
  });
}

// Posed views for screenshots and shared links.
const params = new URLSearchParams(window.location.search);
if (params.get('q')) { $('q').value = params.get('q'); state.q = params.get('q').toLowerCase(); }
if (params.get('cat')) { $('cat').value = params.get('cat'); state.cat = params.get('cat'); }
if (params.get('watch') === '1') { $('watchOnly').checked = true; state.watch = true; }
render();
if (params.get('detail')) openDetail(params.get('detail'));
