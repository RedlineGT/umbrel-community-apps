#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# test.sh — launch the Zcash Solo Miner stack locally for testing
#
# Run from the zmine-zcash-solo-miner/ directory:
#   bash test.sh [up|down|logs|status|clean]
#
# Commands:
#   up      (default) — build images and start all services
#   down    — stop and remove containers (data volumes preserved)
#   logs    — follow logs for all services
#   status  — show container status
#   clean   — stop containers AND delete local chain data (irreversible)
# ─────────────────────────────────────────────────────────────────────────
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${SCRIPT_DIR}/data"
ENV_FILE="${SCRIPT_DIR}/.env"
COMPOSE_OPTS="--project-directory ${SCRIPT_DIR} -f ${SCRIPT_DIR}/docker-compose.yml -f ${SCRIPT_DIR}/docker-compose.test.yml --env-file ${ENV_FILE}"

# ── Colour helpers ─────────────────────────────────────────────────────
RED='\033[0;31m'; YLW='\033[1;33m'; GRN='\033[0;32m'; NC='\033[0m'
info()  { echo -e "${GRN}[test]${NC} $*"; }
warn()  { echo -e "${YLW}[test]${NC} $*"; }
error() { echo -e "${RED}[test]${NC} $*" >&2; }

# ── Dependency checks ──────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
    error "Docker is not installed. Install it from https://docs.docker.com/get-docker/"
    exit 1
fi
if ! docker compose version &>/dev/null; then
    error "Docker Compose v2 not found. Install it from https://docs.docker.com/compose/install/"
    exit 1
fi

# ── .env setup ─────────────────────────────────────────────────────────
if [ ! -f "${ENV_FILE}" ]; then
    warn ".env not found — copying from .env.example"
    cp .env.example "${ENV_FILE}"
    warn "Edit .env and set MINER_ADDRESS to your ZEC transparent address,"
    warn "then re-run this script."
    exit 0
fi

# Inject APP_DATA_DIR (override whatever might be in .env)
export APP_DATA_DIR="${DATA_DIR}"

# Source .env for display purposes (mask REDIS_PASSWORD)
set -a; source "${ENV_FILE}"; set +a
export APP_DATA_DIR="${DATA_DIR}"   # ensure local data dir wins

# ── Show config ────────────────────────────────────────────────────────
info "─────────────────────────────────────────"
info "  ZEC Solo Miner — local test mode"
info "─────────────────────────────────────────"
info "  Data dir      : ${DATA_DIR}"
info "  Miner address : ${MINER_ADDRESS:-(not set — sync-only mode)}"
info "  Stratum port  : ${STRATUM_PORT:-13333}"
info "  CPU threads   : ${CPU_THREADS:-1}"
info "  Dashboard     : http://localhost:3300"
info "─────────────────────────────────────────"

if [ -z "${MINER_ADDRESS}" ]; then
    warn "MINER_ADDRESS is empty in .env"
    warn "Zebra will sync but mining rewards won't be configured."
    warn "Set it to your ZEC t1/t3 address to enable reward collection."
    echo
fi

CMD="${1:-up}"

case "${CMD}" in

  up)
    # Create data dirs with correct permissions before containers start.
    mkdir -p "${DATA_DIR}/zebra" "${DATA_DIR}/redis"

    info "Building images and starting services…"
    info "(First build takes 5–15 min — subsequent starts are fast)"
    echo
    docker compose ${COMPOSE_OPTS} up --build
    ;;

  down)
    info "Stopping containers (chain data preserved in ${DATA_DIR})…"
    docker compose ${COMPOSE_OPTS} down
    ;;

  logs)
    SERVICE="${2:-}"
    docker compose ${COMPOSE_OPTS} logs -f --tail=100 ${SERVICE}
    ;;

  status)
    docker compose ${COMPOSE_OPTS} ps
    ;;

  clean)
    warn "This will DELETE the chain data at ${DATA_DIR}."
    warn "Zebra will need to re-sync from scratch (2–3 days on mainnet)."
    read -rp "Type 'yes' to confirm: " CONFIRM
    if [ "${CONFIRM}" = "yes" ]; then
        docker compose ${COMPOSE_OPTS} down -v 2>/dev/null || true
        rm -rf "${DATA_DIR}"
        info "Data directory removed."
    else
        info "Aborted."
    fi
    ;;

  *)
    error "Unknown command: ${CMD}"
    echo "Usage: bash test.sh [up|down|logs [service]|status|clean]"
    exit 1
    ;;

esac
