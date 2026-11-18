# Checker host: live differential checker (JS / Go / Rust readers) plus a tiny
# HTTP server that publishes status.json. Build from the repository root:
#   docker build -f deploy/checker/Dockerfile -t xck-checker .
# State lives in /data (mount a volume there); see deploy/README.md.

FROM golang:1.27-bookworm AS go
WORKDIR /src/tools/livecheck/go
COPY tools/livecheck/go/go.mod tools/livecheck/go/go.sum ./
RUN go mod download
COPY tools/livecheck/go/ ./
RUN CGO_ENABLED=0 go build -trimpath -o /out/lc-go .

FROM rust:1-bookworm AS rust
WORKDIR /src/tools/livecheck/rust
COPY tools/livecheck/rust/ ./
RUN cargo build --release --locked && mkdir -p /out && cp target/release/xck-livecheck-rust /out/

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends tini ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY tools/ ./tools/
COPY reports/raw/frequency.json ./reports/raw/frequency.json
COPY deploy/checker/entrypoint.sh /usr/local/bin/xck-entrypoint
COPY --from=go /out/lc-go /app/bin/lc-go
COPY --from=rust /out/xck-livecheck-rust /app/bin/xck-livecheck-rust
# LedgerCloseMeta JSON schema (the arm tables), generated with
# `stellar xdr types schema --type LedgerCloseMeta` (stellar-xdr 30.0.0); the image
# has no stellar CLI, so the checker reads it via XCK_LCM_SCHEMA.
COPY deploy/checker/lcm.schema.json /app/lcm.schema.json
ENV XCK_LC_GO=/app/bin/lc-go \
    XCK_LCM_SCHEMA=/app/lcm.schema.json \
    XCK_LC_RUST=/app/bin/xck-livecheck-rust \
    XCK_NET=pubnet \
    XCK_DATA=/data \
    XCK_LCM_CACHE=off \
    XCK_STATUS_EVERY_S=60 \
    XCK_LIVE_WORKERS=3 \
    PORT=8080 \
    NODE_ENV=production
RUN chmod +x /usr/local/bin/xck-entrypoint && useradd -r -u 10001 -d /data xck && mkdir -p /data && chown xck /data
USER xck
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=5s --start-period=180s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/xck-entrypoint"]
