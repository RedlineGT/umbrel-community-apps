# Zcash Solo Miner — Dashboard Guide

A plain-language explanation of every piece of information on the dashboard and why it matters.
Written for people who are new to solo mining and want to understand what they're looking at.

---

## The Basics: What Is Solo Mining?

When you mine ZEC, your hardware runs billions of mathematical calculations per second trying to find a specific number — a hash — that satisfies the network's current difficulty target. The entire Zcash network is doing this simultaneously. Whoever finds a valid hash first wins the block and collects the block reward. In solo mining, that entire reward goes to you and nobody else. There is no pool fee, no middleman, no cut. But there's also no guarantee of when — or whether — you'll find a block. It's pure probability.

Everything on this dashboard is designed to answer three questions: Is my node healthy? Are my miners working? What are my chances?

---

## Header Bar

The thin bar at the top of the page is your at-a-glance health summary.

### Status Pill (Live / Syncing / Offline)

This is the most important indicator on the page. It tells you the state of your Zebra full node.

- **Live (green)** — Your node is fully synced with the Zcash mainnet, connected to 8 or more peers, and ready to submit blocks. Mining is active. This is the state you want.
- **Syncing (amber)** — Your node is still downloading and verifying the blockchain, or it has fewer than 8 peer connections. Mining is paused. You cannot win a block while syncing because your node doesn't yet have the full transaction history needed to construct a valid coinbase transaction.
- **Offline (red)** — Your node has lost connectivity entirely, or the software has crashed. Nothing is working.

### Peer Count

The number of other Zcash nodes your Zebra instance is connected to. Peers are how your node learns about new blocks and broadcasts its own. Below 8 peers is considered weak connectivity — your node may be slow to receive new block announcements or slow to propagate your own solved block. A healthy solo miner typically holds 10–20 peers.

#### Why peers matter for the Zcash network

Every node that stays online and reachable strengthens the Zcash network for everyone — not just for you. Here is why:

The Zcash network has no central server. It is a mesh of independent nodes, each one holding a full copy of the blockchain and relaying transactions and blocks to its neighbours. When you run a full node on Umbrel, you become one of those neighbours. Your node verifies every block and transaction independently, which means no one — not a mining pool, not an exchange, not even the Electric Coin Company — can tell your node what the "correct" chain is. You check for yourself.

When your node accepts inbound connections from the outside world (rather than only dialling out), it becomes an entry point for other nodes that are just joining the network, syncing for the first time, or reconnecting after going offline. Nodes that only make outbound connections contribute passively; nodes that also accept inbound connections contribute actively by being available to anyone who needs a peer.

A network with more reachable full nodes is:
- **More resilient** — harder to attack or partition, because there are more independent paths for blocks and transactions to travel.
- **More decentralised** — no single region, ISP, or datacenter dominates the peer graph.
- **More trustworthy** — the more independent verifiers exist, the harder it is for anyone to push a fraudulent transaction or a rewritten chain history.
- **Faster for new participants** — someone syncing Zcash for the first time downloads the chain from whichever reachable nodes respond first. More reachable nodes means faster initial syncs worldwide.

Your solo miner already validates every Zcash block in real time. Accepting inbound peers is the step that turns your private validator into a public service for the network.

#### Block propagation speed and the orphan race

There is a direct, personal mining incentive to having fast, well-connected peers — not just a community one.

Zcash produces one block every 75 seconds on average, but the network doesn't guarantee that only one miner finds a valid block in any given window. Occasionally — especially as global hash rate grows — two miners solve a valid block at almost exactly the same time. Both blocks are technically correct. The network cannot keep both of them. It will converge on whichever block reaches the majority of nodes first. The other block is discarded and called an **orphan**. The miner whose block was orphaned earns nothing, even though they did valid work and found a real solution.

This is the orphan race, and your peer connections are your only weapon in it.

The moment your node finds a block, it announces it to every peer it is connected to simultaneously. Each of those peers immediately relays it to their own peers, and so on — a flood that spreads outward in concentric rings across the network. The speed of that flood is determined by two things: how many peers you are directly connected to, and how low-latency those connections are. More peers means more simultaneous first hops. Lower latency means each hop completes faster. Both multiply together to determine how quickly your block reaches the tipping point where the majority of the network has seen it and will build on top of it.

A node with 20 well-connected, low-latency peers will propagate a found block significantly faster than a node with 6 high-latency peers. In a close race — two blocks found within a second or two of each other — that propagation speed difference can be the deciding factor.

For most home solo miners, orphan races are rare events. But when you do find a block — potentially after weeks or months of waiting — you want every possible advantage ensuring that block is the one the network accepts. Peer count and peer quality are the levers you actually control.

#### Impact on your home internet

Running a Zcash full node with inbound peers open has very modest bandwidth requirements. Typical usage is roughly 10–50 MB per day for block propagation and peer traffic under normal network conditions — comparable to a few minutes of video streaming. During the initial blockchain sync, usage is higher (several GB total over the multi-day sync period), but once synced, ongoing traffic is minimal.

There is no meaningful performance impact on general home internet use — video calls, gaming, and streaming are unaffected. The traffic is low-volume and spread across many small messages rather than sustained large transfers.

The only consideration is upload bandwidth, which is used when your node serves blockchain data to peers requesting it. On most broadband connections this is inconsequential. If you are on a metered connection with a monthly data cap, it is worth monitoring for the first week after enabling inbound connections.

#### Enabling inbound peer connections (port forwarding)

By default, Zebra dials out to other nodes but does not accept inbound connections, because your home router blocks unsolicited traffic from the internet. To allow inbound connections, you need to forward **TCP port 8233** from your router to your Umbrel's local IP address.

**What port 8233 is:** This is Zcash's P2P port — the port Zebra uses to communicate with other nodes on the network. It is already exposed in the Docker Compose configuration. You only need to tell your router to pass traffic on this port through to your Umbrel.

**General steps (exact menus vary by router brand):**

1. Find your Umbrel's local IP address. It is shown in your Umbrel dashboard settings, or you can look it up in your router's connected-devices list. It will look like `192.168.x.x` or `10.0.x.x`. Note it down — you will also want to assign this IP as a static/reserved DHCP lease so it does not change after a reboot.

2. Log in to your router's admin interface. This is usually at `192.168.1.1` or `192.168.0.1` in a browser. The credentials are often printed on the router itself.

3. Find the **Port Forwarding** section. It may be labelled "Virtual Server", "NAT", "Port Mapping", or "Applications & Gaming" depending on your router brand.

4. Create a new rule:
   - **External port:** `8233`
   - **Internal IP:** your Umbrel's local IP address
   - **Internal port:** `8233`
   - **Protocol:** `TCP`

5. Save and apply. Some routers require a restart.

6. To verify it worked, you can use an online port checker (search "open port checker") and test port 8233 against your home's public IP address. If it reports the port as open, inbound connections are working.

**You do not need to forward port 13333** (the stratum port) unless you want external miners — ASICs or GPU rigs not on your local network — to connect to your stratum server. The stratum port is for your mining hardware, not for the Zcash network itself.

Once port 8233 is forwarded, your peer count will typically rise within a few minutes as other nodes discover and connect to you. Your node is now a first-class citizen of the Zcash peer-to-peer network.

### ZEC / USD

The current market price of Zcash in US dollars, fetched from a live market feed. This is purely informational — it doesn't affect mining performance — but it's the number that determines what your block reward is worth in real money when you find one.

### Time / Date

The local time on your Umbrel machine. Useful for correlating events ("my miner went offline around 3pm") without having to cross-reference logs.

---

## Blockchain Sync Card

This card appears only while your Zebra node is still downloading the blockchain. Once fully synced, it disappears and the rest of the dashboard takes over.

### Progress Percentage and Sync Ring

The large percentage shows how much of the blockchain history your node has downloaded and verified. To the right of the text is a circular arc ring — it fills clockwise from the top as the sync advances, and breathes gently while the process is active, so you can see at a glance that it is live and not frozen. The number inside the ring matches the percentage on the left.

100% means fully synced. Until you reach that point, your node is not on the network in any meaningful mining sense.

### Block X / ~Y

Shows your current block height versus the estimated tip of the chain. For example, "Block 1,729,826 / ~2,573,200" means you have downloaded 1.73 million blocks out of an estimated 2.57 million. The estimated total is derived from the network — it's approximate because new blocks keep arriving while you're syncing.

### Chain Size

How much disk space the blockchain data currently occupies on your Umbrel. Zcash's blockchain grows continuously. As of 2026, a full sync requires roughly 60–80 GB. Make sure you have sufficient headroom on your storage volume.

### Peers Connected

How many other Zcash nodes Zebra is talking to during the sync process. More peers means faster block downloads, because your node can fetch different segments of the chain from different sources simultaneously. A sub-line below the peer count shows the countries and cities of your connected peers, resolved via geo-lookup — a quick way to confirm that your node has geographically diverse connections rather than clustering in one region.

### Latest Synced

The lower half of the sync card is filled by a live block feed — a continuously scrolling list of the most recently verified block heights as your node processes them. It gives you a real-time sense of how fast the sync is progressing and confirms the node is actually doing work. Once fully synced, this feed disappears along with the rest of the sync card.

### Wipe & Resync

A nuclear option. Clicking this deletes all downloaded blockchain data and starts the sync from zero. You would use this if your blockchain data became corrupted or you ran out of disk space mid-sync and need a clean start. It is irreversible — the entire multi-day sync restarts from block 1.

---

## Stratum Card

This is your mining pool's connection hub. It handles the communication layer between your Zebra node and your mining hardware.

### Stratum Address

The connection string your ASICs or GPU rigs need to point at. Format: `stratum+tcp://YOUR-IP:13333`. This is what you type into your miner's configuration — it tells your hardware where to send solved hashes. The dashboard auto-detects your Umbrel's IP address so you can copy the correct string directly.

The status line below the address reads either "Blockchain synced — accepting connections" (green) or "Waiting for sync" (amber). If it says waiting, your miners can connect to the port, but the server will not issue real mining work until the node is fully synced.

### Active Workers

The number of individual worker connections currently active in this session. A "worker" is a single mining device. If you have an ASIC with two boards configured as separate workers, that counts as two. The sub-line shows the number of unique miner addresses — relevant if multiple people are mining to the same stratum but with different reward addresses.

### Connections (TCP)

The number of raw TCP connections to the stratum port right now. This is a lower-level count than "workers" — it includes connections that have opened but haven't yet completed the stratum handshake. Under normal operation, TCP connections and active workers should match closely. A large gap (many connections, few workers) can indicate miners that are connecting and disconnecting rapidly, usually a misconfiguration on the miner side.

### Chain Storage

The path on disk where Zebra stores its blockchain data, and how large that data currently is. Useful for storage planning and for confirming that Zebra is writing to the expected location. The Copy button lets you grab the path for use in shell commands or backup scripts.

### Network Peers

An expandable section listing each peer your Zebra node is currently connected to, with the country and city resolved from their IP address. This is the same information summarised in the sync card during the download phase, but here it persists after sync is complete. A geographically diverse peer list — nodes spread across multiple countries and continents — means faster block propagation and better resilience against regional outages. The header always reads **network peers** regardless of which network (mainnet or testnet) you are running.

### Connecting Your Miner

Every ASIC, GPU rig, or CPU miner needs three pieces of information to connect to the stratum server. Enter these in your miner's pool configuration screen.

| Field | Value |
|---|---|
| **URL / Host** | `stratum+tcp://YOUR-UMBREL-IP:13333` |
| **Username** | `YOUR_ZCASH_ADDRESS.worker_name` |
| **Password** | `x` |

**URL** — Use the exact address shown in the Stratum card on the dashboard. It auto-detects your Umbrel's local IP so you can copy it directly. The protocol prefix `stratum+tcp://` is required by most miners; some older interfaces just ask for a host and port separately (`YOUR-UMBREL-IP` and `13333`).

**Username** — This is the most important field. It follows the format `address.workername`:

- `address` is your full Zcash transparent address — the same one shown in the Mining Address field (starts with `t1` or `t3`). This is where block rewards are paid. **If you enter a different address here, rewards from that worker will go to that address instead — the dashboard will flag this with a warning badge.**
- `workername` is a short label you choose to identify this specific machine. Use letters, numbers, and hyphens. Keep it short and descriptive — for example `asic-rig-1`, `gpu-tower`, or `basement-miner`. This is what appears in the Workers table on the dashboard.

Example full username: `t1fgGy3CBkKJax8EH1RquQdPGPXPnDH5ig6.asic-rig-1`

**Password** — Enter `x`. This pool does not use password authentication for workers. Any non-empty value is accepted, but `x` is the universal convention for stratum pools that don't require it. Never leave this field blank — some miners refuse to connect without a password set.

---

## Network vs Your Fleet

This card puts your operation in context by comparing you directly against the global network.

### Difficulty — Network vs Fleet

**Network difficulty** is the current target the entire Zcash network is mining against. It's a very large number — typically in the hundreds of millions — that represents how hard it is to find a valid block hash. The higher this number, the harder every miner on the planet has to work to find a block.

**Fleet** (your side) shows your best share ever submitted across all workers. A share is a hash that meets a lower difficulty threshold set by the pool server — it's proof that your miner is doing real work, even if it didn't quite meet the full block target. The closer your best share gets to the network difficulty, the closer you are to having actually found a block.

The visual bar split between the two numbers shows your proportion at a glance. If your fleet's best share is a tiny sliver of the network difficulty, you're a small fish in a big ocean — which is honest and expected for most home miners.

### Projected Next Retarget

Zcash uses Digishield, a difficulty algorithm that adjusts on every single block. The projected number estimates what the difficulty will be for the next block, based on how fast the last several blocks arrived. If blocks have been coming in faster than the 75-second target, difficulty goes up. If slower, it goes down. The percentage badge shows the expected change. This matters because a difficulty spike can push your estimated time to block significantly higher overnight.

### Hash Rate — Network vs Fleet

**Network hash rate** is the total combined Sol/s (solutions per second, Equihash 200,9) of every miner in the world right now. **Fleet** is your combined Sol/s across all connected workers.

The line below the comparison ("Pool is 0.0014% of network") is the honest number. It tells you exactly what fraction of the global hash rate you control. That fraction is also your exact probability of winning any given block. Small percentages are normal — even large solo operations are a fraction of a percent of the total network.

### Share Cadence

How frequently your fleet is submitting shares to the pool server, expressed as an average interval per worker and the fastest individual miner.

Each miner gets assigned a "share difficulty" — a target much easier than the real block target. When a miner finds a hash that meets this lower target, it submits it as a share. The cadence tells you how often that's happening.

Why it matters: share cadence is your heartbeat monitor. If a miner stops submitting shares, it has stopped working — whether due to a hardware fault, a network dropout, or a crash. Cadence drops before hashrate drops in most monitoring systems, so it's often the first warning sign that something is wrong. A secondary line shows your fastest worker by **name** — for example `⚡ gpu-rig-1 (45s)` — and its individual share interval. Only the short worker name is shown, not the full address, so it stays readable even with long wallet addresses. This line is useful for comparing performance between machines at a glance.

---

## Est. Time to Block

This card answers the question every solo miner actually wants answered: how long do I have to wait?

### The Estimate

The time shown is the statistical average — the mean time you would wait across many, many attempts if everything stayed constant. It's calculated as:

```
network difficulty ÷ your fleet's total Sol/s = expected seconds between blocks
```

If that number is 21 hours, you should expect to find roughly one block per day on average. Some days you find two. Some weeks you find none. The universe doesn't owe you one block per expected-interval; it owes you that rate only over a very long statistical run.

The sub-line "at current hash rate" is a reminder that this estimate updates every refresh cycle. If a miner goes offline, the estimate jumps up. If you add a new ASIC, it drops.

### Blocks Found

The cumulative count of blocks your operation has found since the pool started — confirmed and pending. Confirmed blocks have received enough subsequent blocks on top of them to be considered permanent. Pending blocks were found recently and are waiting for confirmation. Mining pools typically require 100 confirmations before a block is fully confirmed, because occasionally a freshly-found block can be orphaned — replaced by a competing block found at almost the same time elsewhere on the network.

### Mining Address

The Zcash transparent address (t1... or t3... for mainnet) where all block rewards are sent. Zebra is configured with this address and includes it in the coinbase transaction when it constructs block templates. Every block you find pays to this address — there is no intermediary. You can update this address from the dashboard without editing configuration files.

### Block Reward

The number of ZEC awarded per block at the current block height. Zcash started at 12.5 ZEC per block and has a halving schedule where the reward is cut in half at regular intervals. The current reward is shown here alongside how many blocks remain until the next halving and an approximate date.

### Halving Countdown

Zcash halvings reduce the block reward by 50% every 840,000 blocks (approximately every four years). The progress bar fills as you approach the next halving. When the halving happens, the reward drops instantly at that exact block height.

Why it matters: if your estimated time to block is 3 days, a reward of 3.125 ZEC is worth knowing about. If that halving is two months away, you know exactly how long the current reward persists. Halvings also tend to affect difficulty because they change the economics of mining, sometimes causing less-profitable miners to go offline which can temporarily lower the network difficulty.

---

## ZEC / USD Price

### Current Price and 24h Change

The live ZEC price in US dollars with the percentage change over the last 24 hours. The price is fetched from a market data API and updated every minute. The change indicator goes green for positive movement and red for negative. If the price drops 3% or more within the last hour, the header price chip turns red as an alert — useful for noticing sudden sell-offs while you're focused on mining operations.

### 90-Day Sparkline Chart

The thin line chart shows ZEC's price history over the last 90 days. The 90-day high and low are shown alongside. The sparkline doesn't tell you what to do — it's context. If you just found a block, it tells you whether this is a good moment in price history or a bad one.

---

## Network Difficulty

### Current Difficulty and 90-Day Chart

The same network difficulty shown in the VS panel, but here charted over 90 days. This is one of the most strategically useful charts on the dashboard for solo miners.

Rising difficulty means more hash rate has joined the network — your share of the mining pie is shrinking unless you add hardware to match. Falling difficulty means the opposite — miners have left, your relative share grew, and your expected time to block got shorter without you doing anything.

The percentage change badge shows whether difficulty is trending up or down over the period. A large sustained rise in difficulty while your hardware stays constant is the signal that your solo operation is becoming less viable unless you upgrade.

---

## Block Odds & Mining Progress

### Chance Today / Chance This Month

The raw probability that your fleet finds at least one block within the next 24 hours or 30 days. Expressed as a percentage.

These numbers come directly from your fleet's Sol/s and the network difficulty — no guessing, no optimism. A 4.4% chance today means that if you ran this exact operation 100 independent days, you'd expect to find a block on roughly 4 of them. The progress bar fills relative to a "good" threshold so you can see at a glance whether your odds are meaningful or negligible.

These numbers are the most honest reality check on whether your hardware is suited for solo mining. If the monthly chance is under 1%, a pool is almost certainly the better financial choice.

### Fleet Share Stats

A running total of every share your fleet has submitted and how many were rejected.

- **Submitted** — total valid shares accepted by the pool server across all workers, all time.
- **Rejected** — shares that were sent but refused. The most common causes are stale shares (submitted after the block moved on), or a hashrate-to-difficulty mismatch causing invalid proofs.
- **Rej %** — rejection percentage. Below 1% is excellent. Between 1–5% is acceptable. Above 5% suggests a configuration problem, high network latency between your miners and the stratum server, or overclocked hardware producing incorrect hashes.

Rejection percentage is a quality indicator for your mining operation, not a quantity one. High rejection rates waste your hardware's effort — you're burning electricity on work that doesn't count.

### Fleet's Best Share Ever

The highest-difficulty hash any worker in your fleet has ever submitted. Expressed as a difficulty number and as a percentage of the current network block difficulty.

This number is the closest your fleet has ever come to finding an actual block. A best share of "48.2% of block difficulty" means your best moment ever got you halfway there. It's partly luck — occasionally a miner gets a very lucky hash — but over time, a high best share at sustained hashrate means your operation is statistically capable of finding blocks.

The bar fill shows this as a visual fraction of the full block difficulty. When it hits 100%, you found a block.

---

## ZEC News Ticker

A scrolling feed of recent Zcash news headlines from crypto news sources, updated every 10 minutes. Each headline is clickable and opens the original article. This is purely informational — it doesn't affect mining operations — but it keeps you aware of protocol upgrades, difficulty changes, or market events that might be relevant to your setup.

---

## Workers Table (Miners Tab)

This is the detailed per-machine breakdown of your entire mining fleet.

### Worker / Address

The name your miner was configured with when you pointed it at the stratum address. Format is typically `address.workername` — for example, `t1fgG...ig6.asic-rig-1`. The address is truncated for readability; hover to see the full string. Click to filter the table to just that worker.

Below the worker name, two sub-lines can appear:

- **Hostname / IP** — the DNS name (or IP address) of the machine as seen by the stratum server. This is how you identify which physical machine the entry belongs to.
- **RTT** — the round-trip network latency between that machine and the stratum server, shown in colour: green (under 20ms, same local network), amber (20–80ms, acceptable), red (over 80ms, high latency). High RTT increases stale shares — the miner sends a solved hash after the network has already moved to the next block. Workers with no DNS match (e.g. a container or a rig with no hostname) show no RTT.

### Status

Whether the worker submitted a share in the last two minutes. **Online** (green dot) means active. **Idle** (grey dot) means nothing recent — the worker may be warming up, experiencing a connectivity issue, or was powered off. A worker that stays Idle for more than 10 minutes is almost certainly offline.

Below the badge, **uptime** shows how long this worker has been continuously connected in the current session ("4h 23m"). It resets when the worker disconnects and reconnects. Useful for spotting unstable connections that keep dropping and rejoining.

### Hash Rate

Estimated Sol/s for this worker, calculated from recent share submission frequency and difficulty. This is a live estimate — it fluctuates as shares arrive and converges to the true rated hashrate over time.

A small **trend arrow** (↑ or ↓) appears once enough samples have accumulated. It indicates whether hashrate has shifted meaningfully in the last few minutes — useful for catching gradual thermal throttling or an ASIC that is intermittently dropping cores.

### Fleet %

This worker's share of your total fleet hashrate, expressed as a percentage. Useful when you have multiple rigs of different speeds — it tells you at a glance which machines are doing most of the work and which are contributing very little. The colour scales with contribution: bright for dominant rigs, dimmed for minor ones.

### Rej %

Rejected shares as a percentage of total submitted for this worker. Below 1% is excellent. Between 1–5% is acceptable. Above 5% suggests a problem: stale shares from high latency, an overclocked card producing incorrect hashes, or a misconfigured difficulty.

A **trend arrow** (↑ or ↓) appears when the rejection rate is changing meaningfully. An upward trend on a previously clean worker is worth investigating before it gets worse.

Per-worker rejection rates let you pinpoint which specific machine is pulling up your fleet average.

### Last Share

Time since this worker last submitted a share. "43s ago" is healthy. "12 min ago" on an otherwise-online worker is a warning sign.

### All-Time Best

The highest-difficulty hash this worker has ever submitted, across all time. This is the number that represents how close this individual machine has ever come to winning a block.

A sub-line labelled **session:** shows the best hash submitted since this worker last connected. It resets on reconnect, so it reflects this specific run — useful for comparing lucky moments between sessions.

### % of Block *(compact screens only)*

The all-time best share expressed as a percentage of the current network block difficulty. "31%" means this rig's best-ever hash was 31% of the way to actually solving a block. Colour-coded: dim at low percentages, bright as it approaches 100%. When it hits 100%, a block was found.

### ℃ and Sol/W *(placeholders)*

Temperature and efficiency columns are reserved for a future direct miner API integration. They currently show "—" for all workers. When a miner API is available, these will show the GPU or ASIC chip temperature and the hash rate per watt of power consumed — the two most important hardware health metrics for long-running mining rigs.

---

## Blocks Found Table (Blocks Tab)

A complete history of every block your operation has ever found.

### Height

The block number in the Zcash chain. On mainnet this links to an external block explorer where you can verify the block and see the coinbase transaction. Higher numbers mean more recent blocks.

### Status

- **Confirmed (green checkmark)** — The block is fully accepted by the network and has received the required number of confirmations. The reward has been paid.
- **Pending (amber hourglass)** — The block was found recently. The network has accepted it but not yet accumulated enough confirmations to consider it final. Pending status is temporary and usually resolves to Confirmed within a few hours.

Occasionally a pending block gets orphaned — the network chose a competing block found at nearly the same time, and yours was discarded. This is rare but it happens.

### Worker

Which of your miners found this block. The miner address is shown, truncated for space — hover over it to see the full address.

### Block Hash

The actual 64-character hash that solved the block. Clicking copies it to clipboard. On mainnet, this hash is the link target for the block explorer URL.

### Coinbase TX Hash

The transaction hash for the coinbase transaction — the special first transaction in the block that creates new ZEC and sends it to your mining address. This is proof of your reward. You can use this hash to look up the payment in any block explorer or your Zcash wallet.

### Time Found

How long ago this block was found, shown as a relative time ("3 days ago"). Hover over it to see the precise UTC timestamp.

---

## Quick Reference: What Should I Check?

| Question | Where to look |
|---|---|
| Is my node working? | Header status pill |
| Are my miners connected? | Workers table — Online/Idle column |
| Is my hardware doing real work? | Share Cadence, worker Hashrate |
| Is anything broken? | Rej % + trend arrow, Last Share time, RTT sub-line |
| When will I find a block? | Est. Time to Block |
| Is mining worth it for my hardware? | Chance Today / This Month |
| Did I find a block? | Blocks Found counter, Blocks tab |
| Is the network getting harder? | Difficulty 90-day chart |
| What is my payout address? | Mining Address in the Est. Time card |
| How full is my disk? | Chain Storage in Stratum card |
| Am I helping the Zcash network? | Peer Count — forward port 8233 to accept inbound peers |
| Why was my found block not confirmed? | Blocks tab — Pending → Orphaned; check peer count and RTT |

---

*This guide covers the Zcash Solo Miner dashboard as of v1.3.44. Solo mining is a long-game operation — understanding what each metric means is the difference between reacting to noise and making informed decisions about your setup.*
