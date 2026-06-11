#!/usr/bin/env node
/**
 * Build-time patch for s-nomp's libs/website.js.
 * Injects after "var app = express();" (confirmed pattern from source):
 *   1. Disable X-Powered-By header leakage
 *   2. Security response headers (CSP, X-Frame-Options, etc.)
 *   3. /api/umbrel/config endpoint — exposes POOL_ADDRESS env var to dashboard
 */
'use strict';
const fs = require('fs');
const FILE = '/app/libs/website.js';

let src;
try {
    src = fs.readFileSync(FILE, 'utf8');
} catch (e) {
    console.error('[patch-website] Cannot read', FILE, ':', e.message);
    process.exit(1);
}

if (src.includes('// umbrel:patched')) {
    console.log('[patch-website] Already patched, skipping.');
    process.exit(0);
}

const INJECT = `
    // umbrel:patched — security hardening
    // Hoist all module requires to avoid per-request lookups
    var _http = require('http');
    var _https = require('https');
    var _fs = require('fs');
    var _os = require('os');
    var _cp = require('child_process');
    var _dns = require('dns');
    // Combined log written by log-collector sidecar (all containers, prefixed)
    var _logFile = '/config/combined.log';
    var _logMaxLines = 500;
    app.disable('x-powered-by');
    app.use(function umbrelSecurity(req, res, next) {
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('Content-Security-Policy', [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline' data:",
            "font-src 'self' data:",
            "img-src 'self' data: https:",
            "connect-src 'self' https://api.coingecko.com",
            "frame-ancestors 'none'"
        ].join('; '));
        res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
        next();
    });
    // Umbrel dashboard config endpoint — returns configured miner address + stratum port
    app.get('/api/umbrel/config', function(req, res) {
        res.json({
            minerAddress: process.env.POOL_ADDRESS || '',
            stratumPort: process.env.STRATUM_PORT || '13333',
            appName: process.env.APP_NAME || 'ZEC Miner',
            chainPath: process.env.APP_DATA_DIR ? process.env.APP_DATA_DIR + '/zebra' : ''
        });
    });
    // Unified Zebra node info — merges sync + netinfo into ONE endpoint.
    // Makes 3 parallel RPCs (getblockchaininfo + getmininginfo + getpeerinfo),
    // with an 8-second server-side cache so back-to-back dashboard polls
    // never cause duplicate RPC traffic.
    var _nodeCache = { ts: 0, data: null };
    var ZEBRA_HOST = process.env.ZEBRA_HOST || 'zebra';
    var ZEBRA_PORT = parseInt(process.env.ZEBRA_RPC_PORT) || 8232;
    function zebraRpc(method, cb) {
        var _called = false;
        function once(e, r) { if (_called) return; _called = true; cb(e, r); }
        var body = JSON.stringify({"jsonrpc":"2.0","id":1,"method":method,"params":[]});
        var opts = {
            host: ZEBRA_HOST, port: ZEBRA_PORT, path: '/', method: 'POST',
            headers: {'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}
        };
        var r = _http.request(opts, function(rs) {
            var d = '';
            rs.on('data', function(c) { d += c; });
            rs.on('end', function() { try { once(null, JSON.parse(d).result); } catch(e) { once(e); } });
        });
        r.setTimeout(5000, function() { try { r.abort(); } catch(e) { try { r.destroy(); } catch(e2){} } once(new Error('timeout')); });
        r.on('error', once);
        r.write(body); r.end();
    }
    // Background poller: runs getblockchaininfo every 60s with a 5-minute
    // timeout so slow Zebra responses (chain_info taking 7-13m under heavy
    // sync I/O) still populate _nodeCache without blocking the API.
    (function bgPoll() {
        var _done = false;
        function finish() { if (_done) return; _done = true; setTimeout(bgPoll, 60000); }
        var body = JSON.stringify({"jsonrpc":"2.0","id":1,"method":"getblockchaininfo","params":[]});
        var opts = { host: ZEBRA_HOST, port: ZEBRA_PORT, path: '/', method: 'POST',
            headers: {'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)} };
        var r = _http.request(opts, function(rs) {
            var d = '';
            rs.on('data', function(c) { d += c; });
            rs.on('end', function() {
                try {
                    var rr = JSON.parse(d).result;
                    var prog = parseFloat(rr.verificationprogress) || 0;
                    if (prog > 0) {
                        var prev = _nodeCache.data || {};
                        _nodeCache = { ts: Date.now(), data: Object.assign({}, prev, {
                            progress: prog,
                            blocks: parseInt(rr.blocks) || prev.blocks || 0,
                            estimatedHeight: parseInt(rr.estimatedheight) || prev.estimatedHeight || 0,
                            sizeOnDisk: parseInt(rr.size_on_disk) || prev.sizeOnDisk || 0
                        })};
                    }
                } catch(ex) {}
                finish();
            });
        });
        r.setTimeout(300000, function() { try { r.destroy(); } catch(ex) {} finish(); });
        r.on('error', finish);
        r.write(body); r.end();
    })();

    // Background size poller: reads chain directory size from the filesystem
    // every 30s so sizeOnDisk is accurate even when Zebra RPC is slow.
    (function bgSizePoll() {
        _cp.execFile('du', ['-sb', '/zebra-data/chain'], { timeout: 10000 }, function(err, stdout) {
            if (!err && stdout) {
                var sz = parseInt((stdout || '').split('\t')[0]) || 0;
                if (sz > 0) {
                    if (!_nodeCache.data) _nodeCache.data = {};
                    _nodeCache.data.sizeOnDisk = sz;
                }
            }
            setTimeout(bgSizePoll, 30000);
        });
    })();

    function buildNodeInfo(cb) {
        var now = Date.now();
        if (_nodeCache.data && now - _nodeCache.ts < 8000) return cb(null, _nodeCache.data);
        var result = { progress:0, blocks:0, estimatedHeight:0, sizeOnDisk:0,
                       difficulty:0, networkSolps:0, peers:0, diffSource:'zebra' };
        var done = 0, zebraProgress = 0, zebraDiff = 0, zebraSolps = 0;
        function finish() {
            if (++done < 3) return;
            // All 3 RPC calls finished (possibly via timeout). If Zebra was too slow
            // and returned nothing useful, serve stale cache rather than zeros.
            if (result.progress === 0 && _nodeCache.data) {
                return cb(null, _nodeCache.data);
            }
            result.difficulty = zebraDiff;
            result.networkSolps = zebraSolps;
            if (zebraProgress < 0.995 && zebraDiff === 0) {
                // Not synced and no local diff — try WhatToMine for live display
                var _wtmDone = false;
                function wtmDone() { if (_wtmDone) return; _wtmDone = true; if (result.progress > 0) _nodeCache = { ts: Date.now(), data: result }; cb(null, result); }
                var wtm = _https.get('https://whattomine.com/coins/166.json', function(ws) {
                    var d = ''; ws.on('data', function(c){ d+=c; }); ws.on('end', function() {
                        try {
                            var j = JSON.parse(d);
                            if (parseFloat(j.difficulty) > 0) { result.difficulty = parseFloat(j.difficulty); result.diffSource = 'whattomine'; }
                            if (parseFloat(j.nethash) > 0) result.networkSolps = parseFloat(j.nethash);
                        } catch(ex) {}
                        wtmDone();
                    });
                });
                wtm.setTimeout(5000, function() { wtm.destroy(); wtmDone(); });
                wtm.on('error', function() { wtmDone(); });
            } else {
                if (result.progress > 0) _nodeCache = { ts: Date.now(), data: result };
                cb(null, result);
            }
        }
        zebraRpc('getblockchaininfo', function(e, r) {
            if (!e && r) {
                zebraProgress = parseFloat(r.verificationprogress) || 0;
                zebraDiff     = parseFloat(r.difficulty) || 0;
                result.progress        = zebraProgress;
                result.blocks          = parseInt(r.blocks) || 0;
                result.estimatedHeight = parseInt(r.estimatedheight) || 0;
                result.sizeOnDisk      = parseInt(r.size_on_disk) || 0;
            }
            finish();
        });
        zebraRpc('getmininginfo', function(e, r) {
            if (!e && r) zebraSolps = parseFloat(r.networksolps) || 0;
            finish();
        });
        zebraRpc('getpeerinfo', function(e, r) {
            if (!e && Array.isArray(r)) result.peers = r.length;
            finish();
        });
    }
    // Primary unified endpoint
    app.get('/api/umbrel/nodeinfo', function(req, res) {
        buildNodeInfo(function(err, data) { res.json(data || {}); });
    });
    // Peer list with server-side geo — returns addr + direction + geo for each connected peer
    var _geoCache = {};
    function _peerIp(addr) {
        if (addr.charAt(0) === '[') return addr.split(']:')[0].slice(1);
        return addr.split(':')[0];
    }
    app.get('/api/umbrel/peers', function(req, res) {
        zebraRpc('getpeerinfo', function(e, r) {
            if (e || !Array.isArray(r)) return res.json([]);
            var peers = r.map(function(p) { return { addr: p.addr, inbound: !!p.inbound }; });
            var needed = [];
            var seen = {};
            peers.forEach(function(p) {
                var ip = _peerIp(p.addr);
                if (!_geoCache.hasOwnProperty(ip) && !seen[ip]) { needed.push(ip); seen[ip] = true; }
            });
            function attach() {
                peers.forEach(function(p) { p.geo = _geoCache[_peerIp(p.addr)] || null; });
                res.json(peers);
            }
            if (!needed.length) return attach();
            var body = JSON.stringify(needed.slice(0, 100).map(function(ip) {
                return { query: ip, fields: 'query,status,country,countryCode,region,city' };
            }));
            var _sent = false;
            var req2 = require('http').request({
                hostname: 'ip-api.com', path: '/batch?fields=query,status,country,countryCode,region,city',
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
            }, function(r2) {
                var data = '';
                r2.on('data', function(c) { data += c; });
                r2.on('end', function() {
                    if (_sent) return; _sent = true;
                    try {
                        JSON.parse(data).forEach(function(g) {
                            _geoCache[g.query] = g.status === 'success'
                                ? { country: g.country, cc: g.countryCode, region: g.region, city: g.city } : null;
                        });
                    } catch(ex) {}
                    attach();
                });
            });
            req2.on('error', function() { if (_sent) return; _sent = true; attach(); });
            req2.write(body);
            req2.end();
        });
    });
    // Address GET — returns saved address and current network
    app.get('/api/umbrel/address', function(req, res) {
        var addr = '';
        var net = 'Mainnet';
        try { addr = _fs.readFileSync('/config/address.txt', 'utf8').trim(); } catch(e) {}
        try {
            var nf = _fs.readFileSync('/config/network.flag', 'utf8').trim();
            if (nf === 'Testnet') net = 'Testnet';
        } catch(e) {}
        res.json({ address: addr, network: net });
    });
    // Ensure body-parser JSON middleware is registered before POST routes
    app.use(require('body-parser').json());
    // Simple write-rate-limiter — no external dep, POST endpoints only.
    // All Umbrel browser traffic arrives via the proxy as a single source IP;
    // 10 writes per hour is generous for deliberate config changes.
    var _writeRL = {};
    function writeRateLimit(req, res, next) {
        var ip = req.ip || (req.connection && req.connection.remoteAddress) || 'x';
        var now = Date.now();
        var e = _writeRL[ip];
        if (!e || now - e.ts > 3600000) { _writeRL[ip] = { count: 1, ts: now }; return next(); }
        if (e.count >= 10) { return res.status(429).json({ ok: false, error: 'Too many requests — wait before retrying.' }); }
        e.count++;
        next();
    }
    // Address POST — saves address to /config/address.txt, updates env immediately
    app.post('/api/umbrel/address', writeRateLimit, function(req, res) {
        var body = (req.body && typeof req.body === 'object') ? req.body : {};
        var addr = String(body.address || '').trim();
        // Validate: Zcash transparent address is exactly 35 chars — t + network prefix (1/2/3) + 33 base58check chars
        if (!addr || !/^t[123][1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) {
            return res.status(400).json({ ok: false, error: 'Invalid Zcash address. Must be a 35-character transparent address (t1.../t3... mainnet, t2... testnet).' });
        }
        try {
            try { _fs.mkdirSync('/config', { recursive: true }); } catch(e) {}
            _fs.writeFileSync('/config/address.txt', addr, 'utf8');
            process.env.POOL_ADDRESS = addr;
            res.json({ ok: true, address: addr });
        } catch(e) {
            res.status(500).json({ ok: false, error: e.message || String(e) });
        }
    });
    // Network GET — returns current network
    app.get('/api/umbrel/network', function(req, res) {
        var net = 'Mainnet';
        try {
            var nf = _fs.readFileSync('/config/network.flag', 'utf8').trim();
            if (nf === 'Testnet') net = 'Testnet';
        } catch(e) {}
        res.json({ network: net });
    });
    // Network POST — writes/removes /config/network.flag
    app.post('/api/umbrel/network', writeRateLimit, function(req, res) {
        var body = (req.body && typeof req.body === 'object') ? req.body : {};
        var net = String(body.network || '').trim();
        if (net !== 'Mainnet' && net !== 'Testnet') {
            return res.status(400).json({ ok: false, error: 'network must be Mainnet or Testnet' });
        }
        try {
            try { _fs.mkdirSync('/config', { recursive: true }); } catch(e) {}
            if (net === 'Testnet') {
                _fs.writeFileSync('/config/network.flag', 'Testnet', 'utf8');
            } else {
                try { _fs.unlinkSync('/config/network.flag'); } catch(e) {}
            }
            res.json({ ok: true, network: net });
        } catch(e) {
            res.status(500).json({ ok: false, error: e.message || String(e) });
        }
    });
    // Reset chain — writes a flag file that zebra's entrypoint detects on next
    // startup and uses to wipe all chain data before starting a fresh sync.
    app.post('/api/umbrel/reset-chain', function(req, res) {
        if (!req.body || req.body.confirm !== 'DELETE_CHAIN') {
            return res.status(400).json({ ok: false, error: 'Missing confirmation' });
        }
        try {
            _fs.writeFileSync('/config/reset-chain.flag', '1', 'utf8');
            res.json({ ok: true });
        } catch(e) {
            res.json({ ok: false, error: 'Could not write reset flag: ' + (e.message || String(e)) });
        }
    });
    // Host IP — returns first non-loopback IPv4 address of the container's host network
    app.get('/api/umbrel/hostip', function(req, res) {
        var ip = '';
        var ifaces = _os.networkInterfaces();
        Object.keys(ifaces).forEach(function(name) {
            if (ip) return;
            ifaces[name].forEach(function(iface) {
                if (iface.family === 'IPv4' && !iface.internal && !ip) ip = iface.address;
            });
        });
        res.json({ ip: ip || '' });
    });
    // Difficulty history — 90-day daily avg from Blockchair, cached 6 hours
    var _diffHistCache = { ts: 0, points: [] };
    app.get('/api/umbrel/diff-history', function(req, res) {
        var now = Date.now();
        if (now - _diffHistCache.ts < 6 * 3600 * 1000 && _diffHistCache.points.length > 0) {
            return res.json({ points: _diffHistCache.points });
        }
        var end   = new Date();
        var start = new Date(now - 90 * 24 * 3600 * 1000);
        var from  = start.toISOString().slice(0, 10);
        var to    = end.toISOString().slice(0, 10);
        var path  = '/zcash/blocks?a=date,avg(difficulty)&q=time(' + from + '..' + to + ')';
        var _dSent = false;
        function dSend(payload) { if (_dSent) return; _dSent = true; res.json(payload); }
        var r2 = _https.get({
            host: 'api.blockchair.com', path: path,
            headers: { 'User-Agent': 'zmine-umbrel/1.0' }
        }, function(rs) {
            var data = '';
            rs.on('data', function(c) { data += c; });
            rs.on('end', function() {
                try {
                    var j = JSON.parse(data);
                    var points = (j.data || []).map(function(row) {
                        return { date: row.date, diff: parseFloat(row['avg(difficulty)']) || 0 };
                    }).filter(function(p) { return p.diff > 0; });
                    if (points.length > 0) _diffHistCache = { ts: Date.now(), points: points };
                    dSend({ points: points.length > 0 ? points : _diffHistCache.points });
                } catch(e) {
                    dSend({ points: _diffHistCache.points });
                }
            });
        });
        r2.setTimeout(10000, function() { r2.destroy(); dSend({ points: _diffHistCache.points }); });
        r2.on('error', function() { dSend({ points: _diffHistCache.points }); });
    });
    // Umbrel widget endpoint — four-stats for home screen
    var _netDiffCache = { ts: 0, diff: 0 };
    app.get('/api/umbrel/widget', function(req, res) {
        var http = require('http');
        var poolHash = 0, workers = 0, blocks = 0, netDiff = 0;
        var sent = false;
        function fmtHash(h) {
            if (!h) return { text: '0', subtext: 'Sol/s' };
            if (h >= 1e9) return { text: (h/1e9).toFixed(2), subtext: 'GSol/s' };
            if (h >= 1e6) return { text: (h/1e6).toFixed(2), subtext: 'MSol/s' };
            if (h >= 1e3) return { text: (h/1e3).toFixed(1), subtext: 'kSol/s' };
            return { text: h.toFixed(0), subtext: 'Sol/s' };
        }
        function fmtDiff(d) {
            if (!d) return { text: '\u2014', subtext: '' };
            if (d >= 1e9) return { text: (d/1e9).toFixed(2)+'B', subtext: '' };
            if (d >= 1e6) return { text: (d/1e6).toFixed(1)+'M', subtext: '' };
            if (d >= 1e3) return { text: (d/1e3).toFixed(0)+'K', subtext: '' };
            return { text: String(Math.round(d)), subtext: '' };
        }
        function send() {
            if (sent) return; sent = true;
            clearTimeout(safetyNet);
            if (!netDiff && _diffHistCache.points.length > 0)
                netDiff = _diffHistCache.points[_diffHistCache.points.length-1].diff;
            var hFmt = fmtHash(poolHash);
            var dFmt = fmtDiff(netDiff);
            res.json({
                type: 'four-stats',
                refresh: '30s',
                link: '',
                items: [
                    { title: 'Pool Hashrate', text: hFmt.text,      subtext: hFmt.subtext },
                    { title: 'Blocks Found',  text: String(blocks),  subtext: 'confirmed'  },
                    { title: 'Net Difficulty',text: dFmt.text,       subtext: dFmt.subtext },
                    { title: 'Workers',       text: String(workers), subtext: 'active'     }
                ]
            });
        }
        // Safety net — always respond within 3.5 s regardless of upstream failures
        var safetyNet = setTimeout(send, 3500);
        var pending = 2;
        function done() { if (--pending <= 0) send(); }
        // --- Pool stats from s-nomp (same process, loopback) ---
        var poolDone = false;
        function onPool() { if (poolDone) return; poolDone = true; done(); }
        var sr = _http.get('http://127.0.0.1:3300/api/stats', function(r) {
            var d = ''; r.on('data', function(c){ d+=c; }); r.on('end', function(){
                try {
                    var j = JSON.parse(d);
                    Object.keys(j.pools||{}).forEach(function(p){
                        var pl = j.pools[p];
                        poolHash += parseFloat(pl.hashrate)||0;
                        workers  += parseInt(pl.workerCount)||0;
                        blocks   += parseInt((pl.blocks||{}).confirmed)||0;
                    });
                } catch(e){}
                onPool();
            });
        });
        sr.setTimeout(3000, function(){
            try { sr.abort(); } catch(e) { try { sr.destroy(); } catch(e2){} }
            onPool();
        });
        sr.on('abort', onPool);
        sr.on('error', onPool);
        // --- Network difficulty (served from shared nodeinfo cache) ---
        var diffDone = false;
        function onDiff() { if (diffDone) return; diffDone = true; done(); }
        buildNodeInfo(function(err, ni) {
            if (ni && ni.difficulty > 0) {
                netDiff = ni.difficulty;
                _netDiffCache = { ts: Date.now(), diff: ni.difficulty };
            } else if (_netDiffCache.diff > 0) {
                netDiff = _netDiffCache.diff;
            }
            onDiff();
        });
    });
    // Stratum peer latency — reads per-socket TCP RTT via ss(8)
    // DNS cache: avoid repeated reverse lookups for the same IPs (60s TTL, max 500 entries)
    var _dnsCache = {};
    app.get('/api/umbrel/stratum-peers', function(req, res) {
        // parseInt prevents any shell-injection risk if STRATUM_PORT is malformed;
        // execFile never invokes a shell — args are passed directly to ss(1) as argv.
        var port = String(parseInt(process.env.STRATUM_PORT, 10) || 13333);
        _cp.execFile('ss', ['-tinp', 'sport', '=', ':' + port], { timeout: 3000 }, function(err, stdout) {
            if (err) return res.json({ peers: [] });
            var peers = [];
            var lines = stdout.split('\\n');
            for (var i = 0; i < lines.length; i++) {
                var m = lines[i].match(/^ESTAB\s+\S+\s+\S+\s+\S+\s+(\S+)/);
                if (!m) continue;
                var remote = m[1];
                remote = remote.replace(/^\[?::ffff:/i, '').replace(/\]?$/, '');
                var ipMatch = remote.match(/^(.+):(\d+)$/);
                var ip    = ipMatch ? ipMatch[1] : remote;
                var port2 = ipMatch ? ipMatch[2] : '';
                var rttMs = null;
                var rttLine = lines[i + 1] || '';
                var rm = rttLine.match(/rtt:([0-9.]+)/);
                if (rm) rttMs = parseFloat(rm[1]);
                peers.push({ ip: ip, port: port2, rttMs: rttMs, host: null });
            }
            if (peers.length === 0) return res.json({ peers: [] });
            var now = Date.now();
            var remaining = peers.length;
            function done() { if (--remaining === 0) res.json({ peers: peers }); }
            peers.forEach(function(p) {
                var cached = _dnsCache[p.ip];
                if (cached && now - cached.ts < 60000) {
                    p.host = cached.host;
                    return done();
                }
                _dns.reverse(p.ip, function(err2, hostnames) {
                    var host = (!err2 && hostnames && hostnames.length > 0) ? hostnames[0] : null;
                    // Evict the oldest entry if the cache is at capacity (prevents unbounded growth)
                    var keys = Object.keys(_dnsCache);
                    if (keys.length >= 500) {
                        var oldest = keys.reduce(function(a, b) { return _dnsCache[a].ts < _dnsCache[b].ts ? a : b; });
                        delete _dnsCache[oldest];
                    }
                    _dnsCache[p.ip] = { host: host, ts: Date.now() };
                    p.host = host;
                    done();
                });
            });
        });
    });
    // News ticker — CoinDesk + The Block + Decrypt RSS, 14-day window, 10-min cache
    // Priority: ZEC/Zcash mentions first, then by pubDate descending
    var _newsCache = { ts: 0, items: [] };
    var NEWS_SOURCES = [
        { host: 'www.coindesk.com',  path: '/arc/outboundfeeds/rss/' },
        { host: 'www.theblock.co',   path: '/rss.xml' },
        { host: 'decrypt.co',        path: '/feed' }
    ];
    function fetchRssFeed(source, cutoff, cb) {
        var req = _https.get({
            host: source.host, path: source.path,
            headers: { 'User-Agent': 'zmine-umbrel/1.0' }
        }, function(rs) {
            if (rs.statusCode === 301 || rs.statusCode === 302) {
                rs.resume();
                return cb([]);
            }
            var data = '';
            rs.on('data', function(c) { data += c; });
            rs.on('end', function() {
                try {
                    var items = [];
                    var now = Date.now();
                    var itemRe = /<item>([\\s\\S]*?)<\\/item>/g;
                    var m;
                    while ((m = itemRe.exec(data)) !== null) {
                        var block = m[1];
                        var titleM = /<title>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/title>/.exec(block);
                        var linkM  = /<link[^>]*>([\\s\\S]*?)<\\/link>/.exec(block);
                        var dateM  = /<pubDate>([\\s\\S]*?)<\\/pubDate>/.exec(block);
                        if (!titleM || !linkM) continue;
                        var title = titleM[1].trim()
                            .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&apos;/g,"'");
                        var url = linkM[1].trim().replace(/&amp;/g,'&');
                        if (!url || url.indexOf('https://') !== 0) continue;
                        var pub = dateM ? new Date(dateM[1].trim()).getTime() : now;
                        if (isNaN(pub)) pub = now;
                        if (pub >= cutoff) {
                            var tl = title.toLowerCase();
                            var zec = (tl.indexOf('zcash') !== -1 || tl.indexOf(' zec') !== -1 || tl.indexOf('zec ') !== -1 || tl.indexOf('zec,') !== -1);
                            items.push({ title: title, url: url, date: new Date(pub).toISOString().slice(0,10), pub: pub, zec: zec });
                        }
                    }
                    cb(items);
                } catch(e) { cb([]); }
            });
        });
        req.setTimeout(10000, function() { try{req.abort();}catch(e){} cb([]); });
        req.on('error', function() { cb([]); });
    }
    app.get('/api/umbrel/news', function(req, res) {
        var now = Date.now();
        if (now - _newsCache.ts < 10 * 60 * 1000 && _newsCache.ts > 0) {
            return res.json({ items: _newsCache.items });
        }
        var cutoff = now - 14 * 24 * 3600 * 1000;
        var results = [], done = 0;
        NEWS_SOURCES.forEach(function(src) {
            fetchRssFeed(src, cutoff, function(items) {
                results = results.concat(items);
                done++;
                if (done === NEWS_SOURCES.length) {
                    // deduplicate by title (first 60 chars)
                    var seen = {};
                    results = results.filter(function(it) {
                        var key = it.title.slice(0, 60).toLowerCase();
                        if (seen[key]) return false;
                        seen[key] = true;
                        return true;
                    });
                    // sort: ZEC articles first, then newest first
                    results.sort(function(a, b) {
                        if (a.zec !== b.zec) return a.zec ? -1 : 1;
                        return b.pub - a.pub;
                    });
                    var items = results.map(function(it) {
                        return { title: it.title, url: it.url, date: it.date };
                    });
                    _newsCache = { ts: Date.now(), items: items };
                    res.json({ items: items });
                }
            });
        });
    });
    app.get('/api/umbrel/logs', function(req, res) {
        try {
            var content = _fs.readFileSync(_logFile, 'utf8');
            var lines = content.split('\\n').filter(function(l){ return l.trim(); });
            if (lines.length > _logMaxLines) lines = lines.slice(lines.length - _logMaxLines);
            res.json({ lines: lines });
        } catch(e) { res.json({ lines: [] }); }
    });
    app.get('/api/umbrel/logs/download', function(req, res) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="zmine-log.txt"');
        try { res.send(_fs.readFileSync(_logFile, 'utf8')); }
        catch(e) { res.send(''); }
    });
    app.get('/dashboard-index.html', function(req, res) {
        res.sendFile(require('path').join(__dirname, '../website/index.html'));
    });
    // end umbrel:patched
`;

// Exact pattern confirmed from source inspection
const patched = src.replace(
    /(\n    var app = express\(\);)/,
    '$1\n' + INJECT
);

if (patched === src) {
    console.error('[patch-website] WARNING: Pattern not matched — security headers not applied!');
    console.error('[patch-website] s-nomp will still run but without hardened headers.');
} else {
    console.log('[patch-website] Security headers and /api/umbrel/config injected.');
}

fs.writeFileSync(FILE, patched);
console.log('[patch-website] Done.');
