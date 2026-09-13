'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

/**
 * Contract test for the QR login polling window.
 *
 * Background: Zalo's QR login long-polls the "polling/qr/waiting" endpoint in
 * ~20s server-side holds and treats the HTTP 408 the server returns as "still
 * waiting". The upstream client used the server-provided `qr_retry` verbatim
 * (3), so it stopped polling after ~60s while the server keeps the same QR
 * valid for minutes. Users who did not finish scanning inside that minute saw
 * "Mã QR đã hết hạn" and had to reload, which minted a new QR and invalidated
 * the code their phone had just confirmed -> endless "scan QR" loop.
 *
 * The Linux port therefore enforces a minimum retry floor in the active login
 * state machine (`login-startup` chunk) so the rendered QR stays polled for the
 * full server-side lifetime.
 */

const LOGIN_CHUNK = path.resolve(
  __dirname,
  '../../app-extracted/pc-dist/lazy/login-startup.f816b8688bc1ffa52694.js'
);

function runTests() {
  console.log('--- Starting login QR polling contract tests ---');

  assert(fs.existsSync(LOGIN_CHUNK), 'login-startup chunk must exist: ' + LOGIN_CHUNK);
  const source = fs.readFileSync(LOGIN_CHUNK, 'utf8');

  // The QR waiting generator must exist and must be the one fed by chk_wait_scan.
  assert(
    source.includes('chkWaitScan'),
    'login chunk must drive the QR waiting poll from chk_wait_scan'
  );
  assert(
    source.includes('getStatusQRCode'),
    'login chunk must poll the QR status endpoint'
  );

  const generatorMatch = /async function\*Dr\(e,r,i\)\{([^]*?)for\(let u=i;u>0;u--\)try\{/.exec(
    source
  );
  assert(generatorMatch, 'QR polling generator Dr(e, r, i) must be present');

  const prologue = generatorMatch[1];
  const floorMatch = /i=Math\.max\(i\|\|0,(\d+)\)/.exec(prologue);
  assert(
    floorMatch,
    'QR polling generator must clamp the retry budget to a minimum (i=Math.max(i||0,N))'
  );

  const floor = Number(floorMatch[1]);
  // Each long-poll is bounded by the server-side hold (~20s), and the server
  // keeps the QR code valid for minutes. Anything below 6 retries (~2 min)
  // reproduces the "expired before I can scan" loop.
  assert(
    floor >= 6,
    `QR polling retry floor must cover the server QR lifetime (got ${floor}, need >= 6)`
  );

  console.log('✅ LOGIN QR POLLING CONTRACT TESTS PASSED SUCCESSFULLY!');
}

runTests();
