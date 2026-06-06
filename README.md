# RedlineGT's Umbrel Community App Store

A community app store for [Umbrel](https://umbrel.com/) with a self-contained Zcash solo mining stack.

## Add this store to Umbrel

1. Open your Umbrel dashboard
2. Go to **App Store** → **Community App Stores**
3. Paste this URL: `https://github.com/RedlineGT/umbrel-community-apps`

---

## Zcash Solo Miner

The **only app in the Umbrel ecosystem** (as of June 2026) that delivers a complete **full node + Stratum server + live dashboard** combination in a single install — running the latest Zcash network upgrade protocol (NU6.2).

Mine ZEC directly on mainnet from your Umbrel with full sovereignty: no third-party pools, no fees, all block rewards go straight to your address.

### What's included

- **Zebra v5+** — Zcash Foundation's official Rust full node, NU6.2 compatible, handles chain sync, peer connections, and RPC
- **s-nomp** (zebra-mining branch) — Stratum pool server that your ASICs and GPU rigs connect to, plus the web dashboard
- **nheqminer** — built-in CPU Equihash 200,9 solver (Tromp algorithm) for connectivity testing
- **Redis** — lightweight in-memory store for pool state

### Dashboard features

- Live pool hashrate, active workers, connected peers
- ZEC/USD price with 90-day sparkline chart and high/low range
- 90-day network difficulty chart
- Block odds calculator — daily and monthly probability, closest share ever, pool vs network hashrate
- Per-worker stats: hashrate, difficulty, session best, all-time best share, efficiency, last share time
- Complete block history with confirmation status and coinbase TX hashes
- Rolling ZEC news ticker — last 14 days of headlines, each clickable
- Stratum endpoint banner with one-click copy
- Mining address management and Mainnet/Testnet toggle — directly from the dashboard
- Umbrel home screen widget (Pool Hashrate, Blocks Found, Net Difficulty, Workers)
- OLED dark theme with collapsible sidebar navigation

### Requirements

- Point your ASIC or GPU miners at `<your-umbrel-ip>:13333` (Stratum)
- Set your Zcash `t1...` receiving address in the dashboard after install
- Allow 2–3 days for initial mainnet chain sync
