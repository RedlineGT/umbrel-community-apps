#!/bin/bash
# s-nomp entrypoint — generates config.json and pool_configs/zcash.json
# from environment variables, then starts the pool manager.
#
# Security notes:
#   - Redis password is required; passed via REDIS_PASSWORD env var
#   - CLI server is bound to 127.0.0.1 only
#   - Admin center is always disabled
#   - Web UI listens on 0.0.0.0:3300 (Umbrel proxy handles external access)
#   - Stratum binds on 0.0.0.0:STRATUM_PORT for external miners
set -eo pipefail

# ── Environment ────────────────────────────────────────────────────────────
ZEBRA_HOST="${ZEBRA_HOST:-127.0.0.1}"
ZEBRA_RPC_PORT="${ZEBRA_RPC_PORT:-8232}"
REDIS_HOST="${REDIS_HOST:-127.0.0.1}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"
STRATUM_PORT="${STRATUM_PORT:-13333}"
WEB_PORT="3300"
NETWORK="${NETWORK:-Mainnet}"
POOL_ADDRESS="${POOL_ADDRESS:-}"

# ── Determine network from flag file (overrides env) ───────────────────────
if [ -f "/config/network.flag" ] && grep -q "Testnet" "/config/network.flag"; then
    NETWORK="Testnet"
    COIN_FILE="testnet/zec.json"
    POOL_ADDRESS="${POOL_ADDRESS:-}"
    echo "[nomp] Network: Testnet (from /config/network.flag)"
else
    NETWORK="Mainnet"
    COIN_FILE="zec.json"
    POOL_ADDRESS="${POOL_ADDRESS:-t1fgGy3CBkKJax8EH1RquQdPGPXPnDH5ig6}"
fi

# ── Override address from config file if present ────────────────────────────
if [ -f "/config/address.txt" ]; then
    SAVED_ADDR="$(tr -d '[:space:]' < /config/address.txt)"
    if [ -n "${SAVED_ADDR}" ]; then
        POOL_ADDRESS="${SAVED_ADDR}"
        echo "[nomp] Address loaded from /config/address.txt: ${POOL_ADDRESS}"
    fi
fi

# ── Validate Redis password ────────────────────────────────────────────────
if [ -z "${REDIS_PASSWORD}" ]; then
    echo "[nomp] WARNING: REDIS_PASSWORD is not set. Redis connection may fail." >&2
fi

# ── Wait for Redis ─────────────────────────────────────────────────────────
echo "[nomp] Waiting for Redis at ${REDIS_HOST}:6379..."
until nc -z "${REDIS_HOST}" 6379 2>/dev/null; do sleep 2; done
echo "[nomp] Redis ready."

# ── Wait for Zebra RPC ─────────────────────────────────────────────────────
echo "[nomp] Waiting for Zebra RPC at ${ZEBRA_HOST}:${ZEBRA_RPC_PORT}..."
WAIT=0
until nc -z "${ZEBRA_HOST}" "${ZEBRA_RPC_PORT}" 2>/dev/null; do
    sleep 5; WAIT=$((WAIT+5))
    [ $((WAIT % 60)) -eq 0 ] && echo "[nomp] Still waiting for Zebra RPC (${WAIT}s)…"
done
echo "[nomp] Zebra RPC ready."

# ── Generate config.json ───────────────────────────────────────────────────
cat > /app/config.json << EOF
{
    "logLevel": "warning",
    "logColors": true,
    "cliPort": 17117,
    "cliServer": "127.0.0.1",
    "clustering": { "enabled": false },
    "defaultPoolConfigs": {
        "blockRefreshInterval": 500,
        "jobRebroadcastTimeout": 55,
        "connectionTimeout": 180,
        "emitInvalidBlockHashes": false,
        "validateWorkerUsername": false,
        "banning": {
            "enabled": true,
            "time": 600,
            "invalidPercent": 50,
            "checkThreshold": 500,
            "purgeInterval": 300
        },
        "redis": {
            "host": "${REDIS_HOST}",
            "port": 6379,
            "password": "${REDIS_PASSWORD}"
        }
    },
    "website": {
        "enabled": true,
        "host": "0.0.0.0",
        "port": ${WEB_PORT},
        "stats": {
            "updateInterval": 15,
            "historicalRetention": 14400,
            "hashrateWindow": 300
        },
        "adminCenter": { "enabled": false }
    },
    "redis": {
        "host": "${REDIS_HOST}",
        "port": 6379,
        "password": "${REDIS_PASSWORD}"
    },
    "switching": {
        "switch1": { "enabled": false, "algorithm": "sha256", "ports": {} }
    },
    "profitSwitch": { "enabled": false }
}
EOF

# ── Generate pool config ───────────────────────────────────────────────────
rm -f /app/pool_configs/*.json
mkdir -p /app/pool_configs

cat > /app/pool_configs/zcash.json << EOF
{
    "enabled": true,
    "coin": "${COIN_FILE}",
    "address": "${POOL_ADDRESS}",
    "_note": "paymentProcessing disabled — all rewards go to Zebra miner_address",
    "paymentProcessing": {
        "enabled": false,
        "daemon": {
            "host": "${ZEBRA_HOST}",
            "port": ${ZEBRA_RPC_PORT},
            "user": "x",
            "password": "x"
        }
    },
    "ports": {
        "${STRATUM_PORT}": {
            "diff": 0.05,
            "varDiff": {
                "minDiff": 0.04,
                "maxDiff": 16384,
                "targetTime": 15,
                "retargetTime": 60,
                "variancePercent": 30
            }
        }
    },
    "daemons": [{
        "host": "${ZEBRA_HOST}",
        "port": ${ZEBRA_RPC_PORT},
        "user": "x",
        "password": "x"
    }]
}
EOF

echo "[nomp] ──────────────────────────────────────"
echo "[nomp] Network  : ${NETWORK} (NU6.2 / Equihash 200,9)"
echo "[nomp] Zebra RPC: ${ZEBRA_HOST}:${ZEBRA_RPC_PORT}"
echo "[nomp] Redis    : ${REDIS_HOST}:6379 (auth: $([ -n "${REDIS_PASSWORD}" ] && echo yes || echo NO))"
echo "[nomp] Stratum  : 0.0.0.0:${STRATUM_PORT}"
echo "[nomp] Web UI   : http://0.0.0.0:${WEB_PORT}"
echo "[nomp] Pool addr: ${POOL_ADDRESS}"
echo "[nomp] ──────────────────────────────────────"

# ── Log file: reset each run so viewer shows only current session ──────────
LOG_FILE="/config/nomp.log"
> "$LOG_FILE" 2>/dev/null || true

# Run node, tee output to both Docker log capture and the mounted log file
"$@" 2>&1 | tee "$LOG_FILE"
