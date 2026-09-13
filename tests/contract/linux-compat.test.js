'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { initLinuxCompat, _internals } = require('../../app-extracted/linux-compat');

async function runTests() {
  console.log('--- Starting linux-compat Coordinator Tests ---');

  // 1. Verify module exports
  assert.strictEqual(typeof initLinuxCompat, 'function', 'initLinuxCompat must be a function');
  assert(typeof _internals === 'object', '_internals must be exposed for testability');

  // 2. Test Path Normalization
  console.log('Testing Path Normalization...');
  _internals.installPathPatcher();
  const Module = require('module');
  // Require native/nativelibs using Windows backslash notation from pc-dist
  const pcDistMockParent = {
    id: path.resolve(__dirname, '../../app-extracted/pc-dist/render.js'),
    filename: path.resolve(__dirname, '../../app-extracted/pc-dist/render.js'),
    paths: [path.resolve(__dirname, '../../app-extracted/pc-dist')]
  };
  const resolvedPath = Module._resolveFilename('..\\native\\nativelibs', pcDistMockParent);
  assert(!resolvedPath.includes('\\'), 'Resolved filename must not contain Windows backslashes: ' + resolvedPath);
  assert(resolvedPath.endsWith('app-extracted/native/nativelibs/index.js'), 'Must resolve to nativelibs/index.js: ' + resolvedPath);

  // 3. Test Config & Meta file creation
  console.log('Testing Config & Meta Files...');
  _internals.initLinuxConfig();
  const calDir = path.join(os.homedir(), '.config', 'ZaloData', 'cal');
  assert(fs.existsSync(calDir), 'cal directory must exist');

  // Verify login.meta and all essential process metas are included
  assert(_internals.REQUIRED_META_FILES.includes('login.meta'), 'login.meta must be in REQUIRED_META_FILES');
  assert(_internals.REQUIRED_META_FILES.includes('main.meta'), 'main.meta must be in REQUIRED_META_FILES');
  assert(_internals.REQUIRED_META_FILES.includes('render.meta'), 'render.meta must be in REQUIRED_META_FILES');

  for (const metaFile of _internals.REQUIRED_META_FILES) {
    const metaPath = path.join(calDir, metaFile);
    assert(fs.existsSync(metaPath), `Meta file ${metaFile} must exist`);
    const content = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    assert(content.version, 'Meta file must have version property');
    assert.strictEqual(content.initialized, true, 'Meta file must have initialized: true');
  }

  // Test self-healing of empty/corrupted meta files
  const testCorruptPath = path.join(calDir, 'login.meta');
  fs.writeFileSync(testCorruptPath, '', 'utf8'); // 0-byte corrupt
  _internals.initLinuxConfig();
  const repairedContent = JSON.parse(fs.readFileSync(testCorruptPath, 'utf8'));
  assert.strictEqual(repairedContent.initialized, true, 'Empty meta file must be self-healed');

  // 4. Test Diagnostic Stream & No Double Logging
  console.log('Testing Diagnostic Stream & De-duplication...');
  const testLogPath = path.join(os.tmpdir(), `zalo-test-debug-${Date.now()}.log`);
  _internals.initDiagnosticStream(testLogPath);
  _internals.writeDiagnostic('TEST', 'Test line 1');
  _internals.writeDiagnostic('OBJECT_TEST', { user: 'test-user', count: 42 });

  // Wait a moment for stream write
  await new Promise(r => setTimeout(r, 60));

  assert(fs.existsSync(testLogPath), 'Log file must be created');
  let logContent = fs.readFileSync(testLogPath, 'utf8');
  assert(logContent.includes('[TEST] Test line 1'), 'Log file must contain test line');
  assert(logContent.includes('"user":"test-user"'), 'Log file must serialize JSON object');

  // Test closing diagnostic stream
  _internals.closeDiagnosticStream();

  // Test error safety: invalid log path must not throw unhandled stream error
  assert.doesNotThrow(() => {
    _internals.initDiagnosticStream('/nonexistent_directory_error_test_xyz/zalo.log');
  }, 'initDiagnosticStream on invalid path must not throw synchronous error');

  // Clean up test log
  try { fs.unlinkSync(testLogPath); } catch (e) {}

  // 5. Test Theme Manager Separation & Origin Validation
  console.log('Testing Theme Manager & Origin Validation...');
  const themeManager = _internals.themeManager;
  assert(themeManager, 'themeManager must be exposed in _internals');
  assert.strictEqual(typeof themeManager.isAllowedUrl, 'function', 'isAllowedUrl must be a function');
  assert.strictEqual(typeof themeManager.handleHotkey, 'function', 'handleHotkey must be a function');

  // Allowed vs Disallowed origins
  assert.strictEqual(themeManager.isAllowedUrl('file:///home/user/pc-dist/index.html'), true, 'Local file URL must be allowed');
  assert.strictEqual(themeManager.isAllowedUrl('https://chat.zalo.me/'), true, 'chat.zalo.me must be allowed');
  assert.strictEqual(themeManager.isAllowedUrl('https://stc.zalo.me/app'), true, 'subdomain.zalo.me must be allowed');
  assert.strictEqual(themeManager.isAllowedUrl('https://zaloapp.com/login'), true, 'zaloapp.com must be allowed');
  assert.strictEqual(themeManager.isAllowedUrl('https://google.com'), false, 'Third-party origin must NOT be allowed');
  assert.strictEqual(themeManager.isAllowedUrl('https://attacker-zalo.me.fake.com'), false, 'Spoofed domain must NOT be allowed');
  assert.strictEqual(themeManager.isAllowedUrl(null), false, 'Null URL must return false');
  assert.strictEqual(themeManager.isAllowedUrl(''), false, 'Empty URL must return false');

  // UI window filtering (no background workers)
  assert.strictEqual(themeManager.isUIWindow('file:///path/to/pc-dist/index.html'), true, 'index.html is UI window');
  assert.strictEqual(themeManager.isUIWindow('file:///path/to/pc-dist/login.html'), true, 'login.html is UI window');
  assert.strictEqual(themeManager.isUIWindow('file:///path/to/pc-dist/sqlite.html'), false, 'sqlite.html is worker, NOT UI window');
  assert.strictEqual(themeManager.isUIWindow('file:///path/to/pc-dist/shared-worker.html'), false, 'shared-worker.html is worker, NOT UI window');

  // Cyberpunk is the DEFAULT theme; ZALO_THEME only opts out
  const originalEnv = process.env.ZALO_THEME;
  try {
    assert.strictEqual(typeof themeManager.isCyberpunkEnabled, 'function', 'isCyberpunkEnabled must be a function');
    assert.strictEqual(themeManager.THEME_PREF_KEY, 'zalo_linux_theme', 'Theme preference key must stay stable');

    delete process.env.ZALO_THEME;
    assert.strictEqual(themeManager.isCyberpunkEnabled(), true, 'Cyberpunk mode must be ON by default when ZALO_THEME is unset');

    process.env.ZALO_THEME = '';
    assert.strictEqual(themeManager.isCyberpunkEnabled(), true, 'Empty ZALO_THEME must keep Cyberpunk ON');

    process.env.ZALO_THEME = 'cyberpunk';
    assert.strictEqual(themeManager.isCyberpunkEnabled(), true, 'Cyberpunk mode must stay ON when explicitly selected');

    for (const optOut of ['dark', 'light', 'default', 'off', '0', 'false', 'zalo', 'classic']) {
      process.env.ZALO_THEME = optOut;
      assert.strictEqual(themeManager.isCyberpunkEnabled(), false, `Cyberpunk mode must be OFF when ZALO_THEME=${optOut}`);
    }

    process.env.ZALO_THEME = 'DEFAULT';
    assert.strictEqual(themeManager.isCyberpunkEnabled(), false, 'Opt-out values must be case-insensitive');

    // Legacy alias keeps working for external callers
    delete process.env.ZALO_THEME;
    assert.strictEqual(themeManager.isCyberpunkEnvActive(), true, 'isCyberpunkEnvActive must mirror isCyberpunkEnabled');
  } finally {
    if (originalEnv !== undefined) {
      process.env.ZALO_THEME = originalEnv;
    } else {
      delete process.env.ZALO_THEME;
    }
  }

  // Hotkey dispatch
  assert.strictEqual(themeManager.handleHotkey(null, { key: 'F10' }), true, 'F10 key should be handled');
  assert.strictEqual(themeManager.handleHotkey(null, { key: 'F11' }), false, 'F11 key should not be handled');

  console.log('✅ ALL LINUX-COMPAT COORDINATOR TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
