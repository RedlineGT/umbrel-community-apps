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
            stratumPort: process.env.STRATUM_PORT || '13333'
        });
    });
    // Zebra sync progress endpoint — proxies getblockchaininfo
    app.get('/api/umbrel/sync', function(req, res) {
        var http = require('http');
        var body = JSON.stringify({"jsonrpc":"2.0","id":1,"method":"getblockchaininfo","params":[]});
        var opts = {
            host: process.env.ZEBRA_HOST || 'zebra',
            port: parseInt(process.env.ZEBRA_RPC_PORT) || 8232,
            path: '/',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        };
        var req2 = http.request(opts, function(r2) {
            var data = '';
            r2.on('data', function(c) { data += c; });
            r2.on('end', function() {
                try {
                    var j = JSON.parse(data);
                    var r = j.result || {};
                    res.json({
                        progress: r.verificationprogress || 0,
                        blocks: r.blocks || 0,
                        estimatedHeight: r.estimatedheight || 0,
                        sizeOnDisk: r.size_on_disk || 0
                    });
                } catch(e) {
                    res.json({ progress: 0, blocks: 0, estimatedHeight: 0, sizeOnDisk: 0 });
                }
            });
        });
        req2.on('error', function() {
            res.json({ progress: 0, blocks: 0, estimatedHeight: 0 });
        });
        req2.write(body);
        req2.end();
    });
    // Zebra network info endpoint — difficulty, hashrate, peers (works during sync)
    app.get('/api/umbrel/netinfo', function(req, res) {
        var http = require('http');
        var host = process.env.ZEBRA_HOST || 'zebra';
        var port = parseInt(process.env.ZEBRA_RPC_PORT) || 8232;
        function rpc(method, cb) {
            var body = JSON.stringify({"jsonrpc":"2.0","id":1,"method":method,"params":[]});
            var opts = {
                host: host, port: port, path: '/', method: 'POST',
                headers: {'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}
            };
            var r2 = http.request(opts, function(rs) {
                var data = '';
                rs.on('data', function(c) { data += c; });
                rs.on('end', function() {
                    try { cb(null, JSON.parse(data).result); } catch(e) { cb(e); }
                });
            });
            r2.on('error', cb);
            r2.write(body);
            r2.end();
        }
        var result = { difficulty: 0, networkSolps: 0, peers: 0, diffSource: 'zebra' };
        var done = 0;
        // After all 3 RPCs complete, if Zebra is not yet synced (< 99.5%)
        // fall back to WhatToMine public API for current-tip difficulty + hashrate.
        var zebraProgress = 0;
        var zebraDiff = 0;
        var zebraSolps = 0;
        function finish() {
            if (++done < 3) return;
            if (zebraProgress >= 0.995) {
                // Fully synced — Zebra's values are authoritative
                result.difficulty = zebraDiff;
                result.networkSolps = zebraSolps;
                res.json(result);
            } else {
                // Still syncing — fetch live difficulty from WhatToMine
                var https = require('https');
                var wtmReq = https.get('https://whattomine.com/coins/166.json', function(wtmRes) {
                    var d = '';
                    wtmRes.on('data', function(c) { d += c; });
                    wtmRes.on('end', function() {
                        try {
                            var wtm = JSON.parse(d);
                            var liveDiff = parseFloat(wtm.difficulty);
                            var liveHash = parseFloat(wtm.nethash);
                            if (liveDiff > 0) {
                                result.difficulty = liveDiff;
                                result.diffSource = 'whattomine';
                            }
                            if (liveHash > 0) result.networkSolps = liveHash;
                        } catch(ex) { /* use Zebra values if parse fails */ }
                        if (result.difficulty === 0) result.difficulty = zebraDiff;
                        if (result.networkSolps === 0) result.networkSolps = zebraSolps;
                        res.json(result);
                    });
                });
                wtmReq.setTimeout(5000, function() { wtmReq.destroy(); });
                wtmReq.on('error', function() {
                    // WhatToMine unreachable — fall back to Zebra's historical values
                    if (result.difficulty === 0) result.difficulty = zebraDiff;
                    if (result.networkSolps === 0) result.networkSolps = zebraSolps;
                    res.json(result);
                });
            }
        }
        rpc('getblockchaininfo', function(e, r) {
            if (!e && r) {
                zebraDiff = parseFloat(r.difficulty) || 0;
                zebraProgress = parseFloat(r.verificationprogress) || 0;
            }
            finish();
        });
        rpc('getmininginfo', function(e, r) {
            if (!e && r) zebraSolps = parseFloat(r.networksolps) || 0;
            finish();
        });
        rpc('getpeerinfo', function(e, r) {
            if (!e && Array.isArray(r)) result.peers = r.length;
            finish();
        });
    });
    // Address GET — returns saved address and current network
    app.get('/api/umbrel/address', function(req, res) {
        var fs = require('fs');
        var addr = '';
        var net = 'Mainnet';
        try { addr = fs.readFileSync('/config/address.txt', 'utf8').trim(); } catch(e) {}
        try {
            var nf = fs.readFileSync('/config/network.flag', 'utf8').trim();
            if (nf === 'Testnet') net = 'Testnet';
        } catch(e) {}
        res.json({ address: addr, network: net });
    });
    // Ensure body-parser JSON middleware is registered before POST routes
    app.use(require('body-parser').json());
    // Address POST — saves address to /config/address.txt, updates env immediately
    app.post('/api/umbrel/address', function(req, res) {
        var fs = require('fs');
        var body = (req.body && typeof req.body === 'object') ? req.body : {};
        var addr = String(body.address || '').trim();
        // Validate: must be a plausible Zcash transparent address (base58, starts with t)
        if (!addr || !/^t[1-9A-HJ-NP-Za-km-z]{25,50}$/.test(addr)) {
            return res.status(400).json({ ok: false, error: 'Invalid Zcash address. Must start with t1/t3 (mainnet) or t2/tm (testnet).' });
        }
        try {
            try { fs.mkdirSync('/config', { recursive: true }); } catch(e) {}
            fs.writeFileSync('/config/address.txt', addr, 'utf8');
            process.env.POOL_ADDRESS = addr;
            res.json({ ok: true, address: addr });
        } catch(e) {
            res.status(500).json({ ok: false, error: e.message || String(e) });
        }
    });
    // Network GET — returns current network
    app.get('/api/umbrel/network', function(req, res) {
        var fs = require('fs');
        var net = 'Mainnet';
        try {
            var nf = fs.readFileSync('/config/network.flag', 'utf8').trim();
            if (nf === 'Testnet') net = 'Testnet';
        } catch(e) {}
        res.json({ network: net });
    });
    // Network POST — writes/removes /config/network.flag
    app.post('/api/umbrel/network', function(req, res) {
        var fs = require('fs');
        var body = (req.body && typeof req.body === 'object') ? req.body : {};
        var net = String(body.network || '').trim();
        if (net !== 'Mainnet' && net !== 'Testnet') {
            return res.status(400).json({ ok: false, error: 'network must be Mainnet or Testnet' });
        }
        try {
            try { fs.mkdirSync('/config', { recursive: true }); } catch(e) {}
            if (net === 'Testnet') {
                fs.writeFileSync('/config/network.flag', 'Testnet', 'utf8');
            } else {
                try { fs.unlinkSync('/config/network.flag'); } catch(e) {}
            }
            res.json({ ok: true, network: net });
        } catch(e) {
            res.status(500).json({ ok: false, error: e.message || String(e) });
        }
    });
    // Host IP — returns first non-loopback IPv4 address of the container's host network
    app.get('/api/umbrel/hostip', function(req, res) {
        var os = require('os');
        var ip = '';
        var ifaces = os.networkInterfaces();
        Object.keys(ifaces).forEach(function(name) {
            if (ip) return;
            ifaces[name].forEach(function(iface) {
                if (iface.family === 'IPv4' && !iface.internal && !ip) {
                    ip = iface.address;
                }
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
        var https = require('https');
        var end   = new Date();
        var start = new Date(now - 90 * 24 * 3600 * 1000);
        var from  = start.toISOString().slice(0, 10);
        var to    = end.toISOString().slice(0, 10);
        var path  = '/zcash/blocks?a=date,avg(difficulty)&q=time(' + from + '..' + to + ')';
        var r2 = https.get({
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
                    res.json({ points: points.length > 0 ? points : _diffHistCache.points });
                } catch(e) {
                    res.json({ points: _diffHistCache.points });
                }
            });
        });
        r2.setTimeout(10000, function() { r2.destroy(); res.json({ points: _diffHistCache.points }); });
        r2.on('error', function() { res.json({ points: _diffHistCache.points }); });
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
            return { text: String(Math.round(d)), subtext: 'diff' };
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
        var sr = http.get('http://127.0.0.1:3300/api/stats', function(r) {
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
        // --- Network difficulty (5-min cache → Zebra RPC) ---
        var diffDone = false;
        function onDiff() { if (diffDone) return; diffDone = true; done(); }
        var now = Date.now();
        if (now - _netDiffCache.ts < 300000 && _netDiffCache.diff > 0) {
            netDiff = _netDiffCache.diff; onDiff();
        } else {
            var body = JSON.stringify({"jsonrpc":"2.0","id":1,"method":"getblockchaininfo","params":[]});
            var opts = { host: process.env.ZEBRA_HOST||'zebra', port: parseInt(process.env.ZEBRA_RPC_PORT)||8232,
                path:'/', method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)} };
            var rr = http.request(opts, function(r2){
                var d=''; r2.on('data',function(c){d+=c;}); r2.on('end',function(){
                    try {
                        var diff = parseFloat((JSON.parse(d).result||{}).difficulty)||0;
                        if (diff > 0) { netDiff = diff; _netDiffCache = { ts: Date.now(), diff: diff }; }
                    } catch(e){}
                    onDiff();
                });
            });
            rr.setTimeout(3000, function(){
                try { rr.abort(); } catch(e) { try { rr.destroy(); } catch(e2){} }
                onDiff();
            });
            rr.on('abort', onDiff);
            rr.on('error', onDiff);
            rr.write(body); rr.end();
        }
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
