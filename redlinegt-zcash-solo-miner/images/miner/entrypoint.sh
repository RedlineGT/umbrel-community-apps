#!/bin/bash
# nheqminer entrypoint — waits for the Stratum server to be ready,
# then starts mining using the Tromp CPU Equihash solver.
set -eo pipefail

STRATUM_HOST="${STRATUM_HOST:-nomp}"
STRATUM_PORT="${STRATUM_PORT:-13333}"
MINER_ADDRESS="${MINER_ADDRESS:-}"
CPU_THREADS="${CPU_THREADS:-1}"

# Disable the CPU miner if threads is 0
if [ "${CPU_THREADS}" = "0" ]; then
    echo "[miner] CPU_THREADS=0 — built-in CPU miner is disabled."
    echo "[miner] The container will idle. Point external miners at"
    echo "[miner] the Stratum port on your Umbrel device instead."
    exec tail -f /dev/null
fi

if [ -z "${MINER_ADDRESS}" ]; then
    echo "[miner] WARNING: MINER_ADDRESS is not set. Using a placeholder." >&2
    MINER_ADDRESS="t1fgGy3CBkKJax8EH1RquQdPGPXPnDH5ig6"
fi

# ── Wait for the Stratum port ──────────────────────────────────────────────
echo "[miner] Waiting for Stratum server at ${STRATUM_HOST}:${STRATUM_PORT}..."
WAIT=0
until nc -z "${STRATUM_HOST}" "${STRATUM_PORT}" 2>/dev/null; do
    sleep 5
    WAIT=$((WAIT + 5))
    if [ $((WAIT % 30)) -eq 0 ]; then
        echo "[miner] Still waiting for Stratum (${WAIT}s)..."
    fi
done
echo "[miner] Stratum server is ready."

echo "[miner] Starting nheqminer"
echo "[miner]   Stratum : ${STRATUM_HOST}:${STRATUM_PORT}"
echo "[miner]   Address : ${MINER_ADDRESS}"
echo "[miner]   Threads : ${CPU_THREADS}"
echo "[miner]   Solver  : Tromp (CPU)"
echo "[miner] Note: CPU solo mining on mainnet is very unlikely to find"
echo "[miner] blocks. Use this for testing or point external GPU/ASIC"
echo "[miner] miners at the Stratum port for meaningful hash-rate."

exec nheqminer \
    -l "${STRATUM_HOST}:${STRATUM_PORT}" \
    -u "${MINER_ADDRESS}.worker1" \
    -t "${CPU_THREADS}"
