# syntax=docker/dockerfile:1
# s-nomp — ZcashFoundation fork, zebra-mining branch (Mainnet / NU6.2)
#
# Key constraints:
#   - Node.js 10.24.1  — equihashverify V8 API incompatible with Node 12+
#   - Python 3.10      — node-gyp 5.x incompatible with Python 3.11+
#   - libboost dummy   — modern Boost is header-only but binding.gyp links it
#   - libsodium-dev    — required by node-stratum-pool
#   - daemon.js patches — Content-Type + jsonrpc 2.0 for Zebra RPC compat
#   - website.js patch  — CSP headers, X-Frame-Options, /api/umbrel/config
#   - Web UI port: 3300 (non-standard)

FROM ubuntu:22.04

ARG DEBIAN_FRONTEND=noninteractive

# ── System dependencies ──────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        build-essential \
        git \
        curl \
        netcat-openbsd \
        libsodium-dev \
        libboost-all-dev \
        libgmp-dev \
        python3 \
        npm \
    && rm -rf /var/lib/apt/lists/*

# ── Dummy libboost_system.so ─────────────────────────────────────────────
# Modern Boost makes boost_system header-only, but the old equihash
# binding.gyp still passes -lboost_system to the linker.
RUN printf 'void boost_system_dummy(void) {}\n' > /tmp/bsd.c \
    && gcc -shared -fPIC -o /usr/lib/libboost_system.so /tmp/bsd.c \
    && rm /tmp/bsd.c

# ── Node.js 10.24.1 via n ───────────────────────────────────────────────
RUN npm install -g n \
    && n 10.24.1 \
    && npm install -g npm@6

ENV PATH="/usr/local/bin:${PATH}"

# ── Clone s-nomp (ZcashFoundation zebra-mining branch) ──────────────────
WORKDIR /app
# Pin to exact commit — if the branch advances, this build will fail loudly
# rather than silently pulling in unreviewed upstream changes.
# To update: verify the new SHA, then replace the value below.
# Current: 49fd89bf (zebra-mining tip as of 2026-06-08)
RUN for attempt in 1 2 3; do \
        git clone --depth 1 --branch zebra-mining \
            https://github.com/ZcashFoundation/s-nomp.git . \
        && git checkout 49fd89bf32fac6fe2440143d16622650e061e5a0 \
        && break; \
        echo "Git clone attempt ${attempt}/3 failed — retrying in 15s..."; \
        rm -rf /app/* /app/.[!.]* 2>/dev/null || true; \
        sleep 15; \
    done && test -f /app/init.js

# ── Install Node dependencies ────────────────────────────────────────────
ENV CXXFLAGS="-std=gnu++17"
RUN npm update --no-audit --no-fund && npm install --no-audit --no-fund

# ── Patch stratum-pool/lib/daemon.js for Zebra RPC compatibility ─────────
# 1. Add Content-Type: application/json header
# 2. Add jsonrpc: "2.0" to batch requests
# 3. Add jsonrpc: "2.0" to single requests
RUN DAEMON_JS=/app/node_modules/stratum-pool/lib/daemon.js; \
    sed -i "s/'Content-Length': jsonData.length/'Content-Length': jsonData.length,\n                'Content-Type': 'application\/json'/" "${DAEMON_JS}"; \
    sed -i 's/requestJson\.push({/requestJson.push({ jsonrpc: "2.0",/' "${DAEMON_JS}"; \
    sed -i 's/var requestJson = JSON\.stringify({/var requestJson = JSON.stringify({ jsonrpc: "2.0",/' "${DAEMON_JS}"

# ── Patch libs/website.js — security headers + /api/umbrel/config ────────
COPY patch-website.js /tmp/patch-website.js
RUN node /tmp/patch-website.js && rm /tmp/patch-website.js

# ── Patch libs/website.js — remove dumpprivkey call (unsupported by Zebra) ──
# Zebra does not implement dumpprivkey. The website.js code calls it on init
# to derive coin version bytes, fails with Method not found, then crashes with
# ERR_HTTP_HEADERS_SENT, respawning the website process in an infinite loop.
# Fix: replace the whole dumpprivkey block with an immediate cback() call.
COPY patch-dumpprivkey.js /tmp/patch-dumpprivkey.js
RUN node /tmp/patch-dumpprivkey.js && rm /tmp/patch-dumpprivkey.js

# ── Replace website/index.html with OLED dark dashboard ──────────────────
COPY dashboard-index.html /app/website/index.html
COPY guide.html /app/website/guide.html

# ── Native library search path for equihashverify ────────────────────────
ENV LD_LIBRARY_PATH="/app/node_modules/stratum-pool/node_modules/equihashverify/build/Release:/app/node_modules/equihashverify/build/Release"

# ── Create non-root user and fix ownership ───────────────────────────────
RUN groupadd -g 1000 nomp \
    && useradd -u 1000 -g 1000 -d /app -s /sbin/nologin nomp \
    && chown -R 1000:1000 /app

# ── Entrypoint ───────────────────────────────────────────────────────────
COPY entrypoint.sh /usr/local/bin/nomp-entrypoint.sh
RUN chmod 755 /usr/local/bin/nomp-entrypoint.sh

USER 1000:1000

EXPOSE 13333 3300

ENTRYPOINT ["/usr/local/bin/nomp-entrypoint.sh"]
CMD ["node", "init.js"]
