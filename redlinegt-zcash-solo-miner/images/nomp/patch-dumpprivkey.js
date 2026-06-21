#!/usr/bin/env node
/**
 * Build-time patch: remove the dumpprivkey call from libs/website.js.
 *
 * Zebra does not implement dumpprivkey (it's a Bitcoin-only RPC method).
 * s-nomp calls it on init to derive coin version bytes for address checking.
 * When Zebra returns {"code":-32601,"message":"Method not found"}, the error
 * handler calls cback() correctly — but the async.each completion callback
 * then fires and triggers a second HTTP response, causing:
 *   Error [ERR_HTTP_HEADERS_SENT]: Cannot set headers after they are sent
 * This makes the website process crash and restart in a loop.
 *
 * Fix: replace the dumpprivkey iterator body with an immediate cback() so
 * the async.each completes instantly with empty coinBytes/coinsForRedis.
 * This is safe — the coin version bytes are used only for address validation,
 * which is not required for solo mining against Zebra.
 */
'use strict';
var fs = require('fs');
var path = '/app/libs/website.js';

var src;
try {
    src = fs.readFileSync(path, 'utf8');
} catch (e) {
    console.error('[patch-dumpprivkey] Cannot read', path, ':', e.message);
    process.exit(1);
}

if (src.indexOf('// dumpprivkey-patched') !== -1) {
    console.log('[patch-dumpprivkey] Already patched, skipping.');
    process.exit(0);
}

// Replace the entire daemon.cmd('dumpprivkey', ...) block.
// The block starts at daemon.cmd(...) and ends at the closing }); of the
// async.each iterator. We match greedily but bounded by the known structure.
var patched = src.replace(
    /var daemon = new Stratum\.daemon\.interface\(\[coinInfo\.daemon\][^;]+;\s*daemon\.cmd\('dumpprivkey'[\s\S]*?cback\(\);\s*\}\);/,
    'cback(); // dumpprivkey-patched: not implemented by Zebra, skipped'
);

if (patched === src) {
    // Try a narrower match as fallback (in case upstream reformatted)
    patched = src.replace(
        /daemon\.cmd\('dumpprivkey'[\s\S]*?cback\(\);\s*\}\);/,
        'cback(); // dumpprivkey-patched: not implemented by Zebra, skipped'
    );
}

if (patched === src) {
    console.error('[patch-dumpprivkey] WARNING: Pattern not matched — dumpprivkey may still cause crash loop.');
    // Non-fatal: image still builds, but log clearly
} else {
    fs.writeFileSync(path, patched);
    console.log('[patch-dumpprivkey] dumpprivkey block removed from website.js — crash loop fixed.');
}
