# makefun-token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Mpusoyen/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Mpusoyen/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Pre-Token Radar: a radar instrument for finding token launches before they happen. It ranks 320 pre-token protocols from the sealed DefiLlama snapshot by an implied value calibrated from the snapshot's own traded protocols (median mcap/TVL per category, adjusted for 7-day growth, maturity and chain breadth). The dashboard opens on a live radar scope of the top 14 contacts and a top-5 "start here" strip with a plain-language reason for each rank; every board row carries its dominant value driver, an age badge (fresh / veteran) and a value bar, and preset sweeps (watchlist, top 25, growing, veterans, fresh) sit beside full search, category/chain/TVL filters and column sorting. Each protocol's detail view tells the story of its rank — a farm-first / speculative verdict, a "why this rank" line, the model's four factors as bars, and a concrete farm plan with working-capital tier, weekly time and an explicit risk step. Protocols whose tokens already trade are separated into the calibration set and never ranked as farm targets.

## Run it

```sh
node main.ts --input <snapshot.json> writes board.json, data.js, dashboard/ and dossier.json to the output dir; open the dashboard index.html to browse the board.
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=nfdszqgp&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
