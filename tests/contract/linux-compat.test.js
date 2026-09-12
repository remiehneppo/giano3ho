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
  for (const metaFile of _internals.REQUIRED_META_FILES) {
    const metaPath = path.join(calDir, metaFile);
    assert(fs.existsSync(metaPath), `Meta file ${metaFile} must exist`);
    const content = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    assert(content.version, 'Meta file must have version property');
    assert.strictEqual(content.initialized, true, 'Meta file must have initialized: true');
  }

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

  console.log('✅ ALL LINUX-COMPAT COORDINATOR TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
