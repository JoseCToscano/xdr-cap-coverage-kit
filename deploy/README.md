# Deploying the status site and the checker host

Two pieces:

1. **Site** (`site/`): a static export. Vercel, or any static host.
2. **Checker host**: one always-on machine that runs the live follower
   (`tools/livecheck/run-live.sh`), rewrites `status.json` every 60 s
   (`tools/status/status.mjs --tip --watch 60`) and serves it with CORS
   (`tools/status/serve.mjs`: `/status.json`, `/findings.jsonl`, `/latest.md`, `/healthz`).
   Everything is in `deploy/checker/Dockerfile`.

## Why a separate always-on host

The follower must run continuously. When its host is suspended the process
does not run at all, so it falls behind the network (about 10 ledgers a
minute) and has to catch up on resume. The follower records each such gap in
`state.json` as `host_pauses` (count, total seconds, last gap) and its own
`lag` measurement (cursor vs network tip, catch-up rate, ETA); the site shows
both. A development machine or sandbox that sleeps is therefore not a
suitable host: use a VM or a machine that is never stopped (`auto_stop_machines
= "off"`, `min_machines_running = 1` on Fly.io), with the container on
`restart: unless-stopped`. On restart the follower resumes at the next ledger.

## Choosing a host

| Option | Size | Notes |
| --- | --- | --- |
| DigitalOcean Basic Droplet | 2 vCPU, 4 GiB | Recommended. US regions near the ledger archive (us-east-2); runs `docker-compose.yml` as is. |
| Hetzner Cloud CX33 | 4 vCPU, 8 GB | Lowest cost; EU locations only. |
| Fly.io performance-2x | 2 vCPU, 4 GB | No VM to manage; `fly.toml` included. Shared-CPU presets are throttled once their burst budget is used, which hurts catch-up. |

All three run the same `deploy/checker/Dockerfile`.

## Sizing

Measured on the current follower: at the network tip one process checks a
ledger in well under its ~5.5 s close interval; while catching up, each extra
worker process uses about 0.4 GB RSS and one full core (Go and Rust readers are
about 60 MB each). Use 2 vCPUs and 4 GB RAM with `XCK_LIVE_WORKERS=3` (the default in the image); disk use is
small (the state directory is a few MB) because the ledger cache is off in the
container (`XCK_LCM_CACHE=off`). Outbound HTTPS to
`aws-public-blockchain.s3.us-east-2.amazonaws.com` and `horizon.stellar.org`.

## Site on Vercel

Project settings: Root Directory `site`, framework Next.js (picked up from
`site/vercel.json`, output `out`). Environment variable
`NEXT_PUBLIC_STATUS_URL=https://<checker-host>/status.json`. Then
`vercel --cwd site` or connect the repository in the Vercel dashboard.

## Checker host, option A: one VM with Docker (Hetzner, DigitalOcean)

```sh
# on the VM (Ubuntu 24.04, Docker installed), a DNS A record for STATUS_HOST pointing at it
git clone https://github.com/JoseCToscano/xdr-cap-coverage-kit && cd xdr-cap-coverage-kit
cd deploy/checker && STATUS_HOST=status.example.org docker compose up -d --build
curl https://status.example.org/status.json
```

Caddy gets the TLS certificate. To keep the existing run's totals, copy the
current state directory into the volume before the first start (the follower
resumes at the next ledger):

```sh
docker compose run --rm --no-deps -v ~/pubnet:/seed checker bash -c 'mkdir -p /data/pubnet && cp /seed/state.json /seed/findings.jsonl /data/pubnet/'
```

## Checker host, option B: Fly.io

```sh
fly launch --no-deploy --copy-config --config deploy/checker/fly.toml --name <app>
fly volumes create xck_data --size 5 --region iad --config deploy/checker/fly.toml
fly deploy . --config deploy/checker/fly.toml --dockerfile deploy/checker/Dockerfile
curl https://<app>.fly.dev/status.json
```

Use a `performance` CPU: shared CPUs are throttled to a 6.25% baseline per vCPU
once their burst balance runs out.

## Optional

- `XCK_RPC_URL`: a Stellar RPC endpoint the follower uses for `getLedgers` when
  a ledger has not reached the archive after 2 minutes.
- `XCK_STATUS_EVERY_S`: status rewrite interval (default 60).
