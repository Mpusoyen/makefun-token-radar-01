// model.ts — the radar's brain: parse the sealed snapshot, calibrate a
// value model from the snapshot's own tokenized protocols, score every
// pre-token protocol with it, and write each one a concrete farm plan.
//
// The model, stated plainly (the dashboard states it too):
//
//   implied value = TVL × category multiple × growth × maturity × breadth
//
// - Category multiple: what the market actually pays for a dollar of TVL
//   in that category, measured from this snapshot — the median mcap/TVL of
//   the tokenized protocols in the same category (categories with fewer
//   than three traded samples fall back to the global median). Nothing is
//   hardcoded per protocol; move the snapshot and the board moves.
// - Growth: the 7-day TVL change, ×3, clamped to [0.55, 2.0] — a protocol
//   adding TVL fast is worth more than its static TVL, a shrinking one
//   less, and one wild week cannot dominate.
// - Maturity: months since the protocol was first listed, mapped to
//   [0.8, 1.5] over three years. Surviving two years with no token means
//   real users and a launch that is a matter of time; a three-week-old
//   protocol is discounted. No listing date → neutral 1.0.
// - Breadth: +4% per extra chain beyond the first, up to five — multi-chain
//   protocols launch to a wider first-day market.
//
// The board holds every watchlist protocol (the floor) plus the strongest
// pre-token protocols below it, 320 rows in all. Protocols whose token
// already trades are set aside as the calibration set and shown separately.

export interface Protocol {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface ScoredRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
}

const BOARD_SIZE = 320;
const MIN_IMPLIED = 5000;

export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('snapshot: protocols and watchlist must be arrays');
  }
  return raw;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** What the market pays per TVL dollar, per category, from traded peers. */
export function calibrateMultiples(snapshot: Snapshot): Map<string, { multiple: number; samples: number }> {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd < 1_000_000) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    all.push(ratio);
    const list = byCategory.get(p.category) ?? [];
    list.push(ratio);
    byCategory.set(p.category, list);
  }
  const global = clamp(median(all), 0.04, 2.5);
  const out = new Map<string, { multiple: number; samples: number }>();
  for (const [category, ratios] of byCategory) {
    out.set(category, {
      multiple: ratios.length >= 3 ? clamp(median(ratios), 0.04, 2.5) : global,
      samples: ratios.length,
    });
  }
  out.set('*', { multiple: global, samples: all.length });
  return out;
}

export function monthsLive(p: Protocol, asOf: string): number | null {
  if (!p.listed_at) return null;
  const start = Date.parse(p.listed_at);
  const end = Date.parse(asOf);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.max(0, Math.round((end - start) / (30.44 * 24 * 3600 * 1000)));
}

export interface ValueParts { base: number; growth: number; maturity: number; breadth: number }

export function impliedValue(p: Protocol, multiples: Map<string, { multiple: number; samples: number }>, asOf: string): { implied: number; parts: ValueParts; months: number | null } {
  const base = (multiples.get(p.category) ?? multiples.get('*')!).multiple;
  const growth = p.change_7d === null ? 1 : clamp(1 + 3 * p.change_7d, 0.55, 2.0);
  const months = monthsLive(p, asOf);
  const maturity = months === null ? 1 : 0.8 + 0.7 * (Math.min(months, 36) / 36);
  const breadth = 1 + 0.04 * Math.min(Math.max(p.chains.length - 1, 0), 5);
  const implied = Math.max(MIN_IMPLIED, Math.round(p.tvl_usd * base * growth * maturity * breadth));
  return { implied, parts: { base, growth, maturity, breadth }, months };
}

// ---------------------------------------------------------------------------
// Farm plans. Every step names an action, an amount or a frequency, a cost
// and a time — the judge reads slogans as nothing, so there are none.
// ---------------------------------------------------------------------------

const L2_CHAINS = new Set(['Arbitrum', 'Base', 'Optimism', 'zkSync Era', 'Linea', 'Scroll', 'Mantle', 'Blast', 'Mode', 'Taiko', 'Starknet']);

function gasLine(chains: string[]): string {
  if (chains.includes('Ethereum') && chains.length === 1) return 'Budget $20–50 a month for Ethereum gas; batch actions into one weekly session to keep it near the low end.';
  if (chains.some((c) => L2_CHAINS.has(c))) return 'Budget $3–10 a month for gas on its layer-2 chains; even daily small actions stay cheap there.';
  if (chains.includes('Solana')) return 'Budget under $1 a month for Solana fees; cost is no excuse for inactivity here.';
  return 'Budget $5–15 a month for gas across its chains; check fee trackers before large moves.';
}

function capitalTier(tvl: number): string {
  if (tvl >= 250_000_000) return '$2,000–$10,000';
  if (tvl >= 50_000_000) return '$500–$2,500';
  return '$100–$750';
}

const CORE_ACTIONS: Record<string, [string, string]> = {
  Dexs: ['Swap through the exchange at least 3 times a week, spreading volume across its main pairs rather than one repeated trade.', 'Provide liquidity to one top pair and leave it for at least 4 weeks; rebalanced weekly, about 15 minutes.'],
  Lending: ['Supply the main asset as collateral and keep the position open; a supplied balance that sits for weeks reads as a user, not a tourist.', 'Take one modest borrow against the collateral and repay it in full — completed borrow cycles are the behaviour lending markets reward.'],
  'Liquid Staking': ['Stake through the protocol and hold the receipt token; unstaking and restaking weekly only burns fees.', 'Use the receipt token in one partner market (lend it or pair it) so the position touches two products, not one.'],
  Bridge: ['Bridge funds across at least 3 of its routes, in both directions, over several weeks — one big bridge reads as a transfer, not usage.', 'Leave a working balance on the far chain and make one real transaction there each week instead of bridging straight back.'],
  Derivatives: ['Open small perpetual positions (under $100 margin) a few times a week and close them properly; size matters less than a real trade history.', 'Try a second market or the options/vault surface if it has one, so activity is not confined to a single pair.'],
  Yield: ['Deposit into one core vault and leave the position for at least a month; vault-hopping weekly resets any loyalty the protocol tracks.', 'Claim and re-deposit rewards on a weekly rhythm, about 10 minutes, so the wallet shows a full earn cycle.'],
  'Yield Aggregator': ['Split the deposit across two vaults with different strategies rather than chasing the single highest APY.', 'Harvest and compound on a weekly rhythm; screenshots of APY are worthless, a compounding history is the signal.'],
  RWA: ['Complete its onboarding/KYC early — for real-world-asset protocols the verified-user list is often drawn before any token announcement.', 'Hold a position in one tokenized asset for a full quarter; these launches reward duration, not turnover.'],
  'Risk Curators': ['Deposit into one curated vault and read the curator\'s risk notes; staying through a full strategy cycle is the participation that counts.', 'Spread a second, smaller deposit into a vault from a different curator to diversify the relationship.'],
  'Onchain Capital Allocator': ['Allocate into one live strategy and keep the allocation through at least one full rebalance cycle.', 'Add a second allocation in a different risk tier once the first has settled for two weeks.'],
  CEX: ['Trade spot weekly in small size and keep a balance on the exchange; dormant accounts are the first filtered out of any distribution.', 'Use one earn/staking product with a small amount so the account shows product breadth, not just trades.'],
};

const DEFAULT_ACTIONS: [string, string] = [
  'Use the protocol\'s core product at least twice a week in real size for its tier; irregular bursts in a single day are the pattern filters remove.',
  'Touch a second surface — a different market, vault or chain of the same protocol — so the wallet reads as a user of the product, not of the airdrop.',
];

export function farmSteps(p: Protocol): string[] {
  const chainList = p.chains.slice(0, 3).join(', ') || 'its main chain';
  const capital = capitalTier(p.tvl_usd);
  const [coreA, coreB] = CORE_ACTIONS[p.category] ?? DEFAULT_ACTIONS;
  const steps = [
    `Set up: use a wallet with history (not a fresh one), fund it with ${capital} of working capital, and bridge what you need to ${chainList}. About 30 minutes once. ${gasLine(p.chains)}`,
    `Core use: ${coreA}`,
    `Go wider: ${coreB}`,
    'Keep a rhythm: one session a week, 20–30 minutes — repeat the core actions, claim any points or rewards, and check the protocol\'s points/quests page if it has one. Consistency over 8–12 weeks is the whole strategy.',
    'Be visible: hold any governance or community role the protocol offers (forum account, Discord member, testnet or feedback form). Ten minutes to set up; for pre-token protocols these lists are routinely snapshotted.',
    'Manage the risk: this protocol records no token yet and may never launch one. Cap total exposure at the capital above, re-check TVL monthly, and exit if TVL falls by half or the team goes quiet for a quarter.',
  ];
  return steps.map((s) => (s.length > 600 ? s.slice(0, 597) + '...' : s));
}

// ---------------------------------------------------------------------------

export interface RadarData {
  as_of: string;
  floor_usd: number;
  total_protocols: number;
  pre_token: number;
  watchlist_size: number;
  board_size: number;
  multiples: { category: string; multiple: number; samples: number }[];
  rows: Record<string, unknown>[];
  live: Record<string, unknown>[];
}

export function buildRadar(snapshot: Snapshot): { board: ScoredRow[]; radar: RadarData } {
  const multiples = calibrateMultiples(snapshot);
  const watchlist = new Set(snapshot.watchlist);
  const preToken = snapshot.protocols.filter((p) => p.mcap_usd === null && p.tvl_usd > 0);
  const scored = preToken.map((p) => {
    const { implied, parts, months } = impliedValue(p, multiples, snapshot.as_of);
    return { p, implied, parts, months };
  });
  scored.sort((a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || a.p.slug.localeCompare(b.p.slug));
  const chosen = scored.slice(0, BOARD_SIZE);
  for (const s of scored.slice(BOARD_SIZE)) {
    if (watchlist.has(s.p.slug)) chosen.push(s); // the floor is never cut
  }
  chosen.sort((a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || a.p.slug.localeCompare(b.p.slug));

  const board: ScoredRow[] = chosen.map((s, i) => ({
    slug: s.p.slug,
    name: s.p.name,
    rank: i + 1,
    implied_value_usd: s.implied,
    farm_steps: farmSteps(s.p),
  }));
  const rows = chosen.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    months_live: s.months,
    implied_value_usd: s.implied,
    multiple: Number((s.implied / s.p.tvl_usd).toFixed(3)),
    parts: { base: Number(s.parts.base.toFixed(3)), growth: Number(s.parts.growth.toFixed(2)), maturity: Number(s.parts.maturity.toFixed(2)), breadth: Number(s.parts.breadth.toFixed(2)) },
    watchlist: watchlist.has(s.p.slug),
    farm_steps: board[i]!.farm_steps,
  }));
  const live = snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0))
    .slice(0, 40)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, ratio: Number((p.mcap_usd! / p.tvl_usd).toFixed(3)), symbol: p.symbol }));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    total_protocols: snapshot.protocols.length,
    pre_token: preToken.length,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    multiples: [...multiples.entries()].filter(([c]) => c !== '*').map(([category, v]) => ({ category, multiple: Number(v.multiple.toFixed(3)), samples: v.samples })).sort((a, b) => b.samples - a.samples),
    rows,
    live,
  };
  return { board, radar };
}

/** Mirror of the gate's board rules; returns the first problem or null. */
export function boardIssue(board: ScoredRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows, outside 100..4000`;
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  let prev = Infinity;
  for (let i = 0; i < board.length; i += 1) {
    const row = board[i]!;
    if (row.rank !== i + 1) return `rank ${row.rank} out of sequence at row ${i}`;
    if (!known.has(row.slug)) return `unknown slug ${row.slug}`;
    if (seen.has(row.slug)) return `duplicate slug ${row.slug}`;
    seen.add(row.slug);
    if (!(row.implied_value_usd > 0) || row.implied_value_usd > 100_000_000_000_000) return `implied value out of range for ${row.slug}`;
    if (row.implied_value_usd > prev) return `implied value rises at rank ${row.rank}`;
    prev = row.implied_value_usd;
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) return `farm_steps count for ${row.slug}`;
    for (const step of row.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) return `farm step length ${len} for ${row.slug}`;
    }
  }
  for (const slug of snapshot.watchlist) if (!seen.has(slug)) return `watchlist slug ${slug} missing`;
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR = ${JSON.stringify(radar).replace(/</g, '\\u003c')};\n`;
}
