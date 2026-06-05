#!/bin/bash
# Generate zebrad.toml from environment variables and hand off to the
# official Zebra entrypoint (entrypoint.sh), which handles setpriv
# privilege-dropping and CONFIG_FILE_PATH support.
set -eo pipefail

DATA_DIR="${DATA_DIR:-/data}"
MINER_ADDRESS="${MINER_ADDRESS:-}"
RPC_PORT="${RPC_PORT:-8232}"
P2P_PORT="${P2P_PORT:-8233}"

# Read network from flag file (default: Mainnet)
NETWORK="Mainnet"
if [ -f "/config/network.flag" ] && grep -q "Testnet" "/config/network.flag"; then
    NETWORK="Testnet"
    echo "[zebra-config] Network: Testnet (from /config/network.flag)"
fi

# Override miner address from config file if present
if [ -f "/config/address.txt" ]; then
    SAVED_ADDR="$(cat /config/address.txt | tr -d '[:space:]')"
    if [ -n "${SAVED_ADDR}" ]; then
        MINER_ADDRESS="${SAVED_ADDR}"
        echo "[zebra-config] Miner address loaded from /config/address.txt"
    fi
fi

# Build network-specific peer list
if [ "${NETWORK}" = "Testnet" ]; then
    PEERS_TOML='initial_testnet_peers = [
    "dnsseed.testnet.z.cash:18233",
]'
else
    PEERS_TOML='initial_mainnet_peers = [
    "dnsseed.z.cash:8233",
    "dnsseed.str4d.xyz:8233",
    "mainnet.seeder.zfnd.org:8233",
    "mainnet.is.yolo.money:8233",
]'
fi

echo "[zebra-config] Preparing Zebra ${NETWORK} configuration..."

# Ensure /config is writable by the pool process (nomp, uid 1000)
mkdir -p /config
chmod 777 /config

# Ensure the data directory tree is accessible before setpriv takes over.
# The official entrypoint will also chown ZEBRA_STATE__CACHE_DIR.
mkdir -p "${DATA_DIR}/chain" "${DATA_DIR}/rpc"

CONFIG_FILE="${DATA_DIR}/zebrad.toml"

# --------------------------------------------------------
# Build the TOML config
# --------------------------------------------------------
cat > "${CONFIG_FILE}" << TOMLEOF
[consensus]
checkpoint_sync = true

[mempool]
eviction_memory_time = "1h"
tx_cost_limit = 80000000

[network]
network = "${NETWORK}"
listen_addr = "0.0.0.0:${P2P_PORT}"
peerset_initial_target_size = 25
${PEERS_TOML}

[rpc]
listen_addr = "0.0.0.0:${RPC_PORT}"
enable_cookie_auth = false
parallel_cpu_threads = 0

[state]
cache_dir = "${DATA_DIR}/chain"
delete_old_database = true
ephemeral = false

[sync]
checkpoint_verify_concurrency_limit = 1000
download_concurrency_limit = 50
full_verify_concurrency_limit = 20
parallel_cpu_threads = 0

[tracing]
use_color = false
buffer_limit = 128000
TOMLEOF

# Append [mining] section only when an address is provided.
# An empty or missing miner_address causes Zebra to reject the config.
if [ -n "${MINER_ADDRESS}" ]; then
    cat >> "${CONFIG_FILE}" << TOMLEOF

[mining]
miner_address = "${MINER_ADDRESS}"
TOMLEOF
    echo "[zebra-config] Mining address: ${MINER_ADDRESS}"
else
    echo "[zebra-config] WARNING: MINER_ADDRESS is not set."
    echo "[zebra-config] Zebra will sync and validate blocks but mining"
    echo "[zebra-config] rewards will not be configured."
    echo "[zebra-config] Set MINER_ADDRESS in docker-compose.yml to enable mining."
fi

echo "[zebra-config] Config written to ${CONFIG_FILE}"
echo "[zebra-config] Network : ${NETWORK}"
echo "[zebra-config] P2P     : 0.0.0.0:${P2P_PORT}"
echo "[zebra-config] RPC     : 0.0.0.0:${RPC_PORT}"

# Export CONFIG_FILE_PATH so the official entrypoint picks it up,
# and export state/cookie dirs so it creates and chowns them correctly.
export CONFIG_FILE_PATH="${CONFIG_FILE}"
export ZEBRA_STATE__CACHE_DIR="${DATA_DIR}/chain"
export ZEBRA_RPC__COOKIE_DIR="${DATA_DIR}/rpc"

echo "[zebra-config] Handing off to official Zebra entrypoint..."
exec /usr/local/bin/entrypoint.sh "$@"
