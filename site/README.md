# Status site (`site/`)

Read-only Next.js site for the live differential checker: the checker's position
against the network tip, the three readers' counters, first sightings, bug-shape
hits, the 50,000-ledger backfill, the 376-arm coverage grid and the commands to
reproduce all of it. The layout and motion follow the demo video: the same
palette, HUD, scramble decode, catch cards and wireframe close.

## Data

| What | Source | When |
|---|---|---|
| Coverage grid, baseline, backfill, #731 replay, hero transaction | `reports/raw/frequency.json`, `reports/raw/coverage.json`, `reports/livecheck/backfill.json`, `reports/raw/replay-mainnet.json`, `reports/divergence-matrix.md`, one committed candidate in `corpus/candidates/livecheck/` | build time, `data/static.json` |
| Live checker status | `status.json` written by `tools/status/status.mjs` from the checker's `state.json` and `findings.jsonl` | fetched in the browser every 60 s from `NEXT_PUBLIC_STATUS_URL`, falling back to the bundled `public/status.json` (copied from `reports/livecheck/live-pubnet-status.json`) |
| Network tip | Horizon root (`history_latest_ledger`) | fetched in the browser every 30 s |

Lag is the tip's close time minus the close time of the last ledger the checker
finished. The page says "Behind network tip" or "Feed is stale" when that is the
case; nothing is smoothed or hidden.

```sh
cd site
npm ci
npm run data         # refresh data/static.json and copy reports/livecheck/live-pubnet-status.json to public/status.json
npm run data:check   # CI: data/static.json matches the reports
npm run build        # static export to out/
npx serve out -l 3100
```

## Environment (all optional, build time)

| Variable | Effect |
|---|---|
| `NEXT_PUBLIC_STATUS_URL` | URL of the checker host's `status.json`. On Vercel, `/live/status.json` is proxied to the checker host by the rewrite in `vercel.json`, so the site and its data share one origin. |
| `NEXT_PUBLIC_HORIZON_URL` | Horizon used for the network tip (default `https://horizon.stellar.org/`) |
| `NEXT_PUBLIC_DEMO_VIDEO_URL` | YouTube, Vimeo or .mp4 URL; defaults to the public 1:54 walkthrough at https://youtu.be/UhD7Ucvz1Ik |
| `NEXT_PUBLIC_SITE_URL` | canonical site URL for metadata |

Deploying: see [../deploy/README.md](../deploy/README.md).
