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
  const calDir = process.env.ZALO_CAL_DIR || path.join(os.tmpdir(), `zalo-test-cal-${Date.now()}`);
  _internals.initLinuxConfig(calDir);
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
  _internals.initLinuxConfig(calDir);
  const repairedContent = JSON.parse(fs.readFileSync(testCorruptPath, 'utf8'));
  assert.strictEqual(repairedContent.initialized, true, 'Empty meta file must be self-healed');

  // Clean up test corrupt meta
  try { fs.rmSync(calDir, { recursive: true, force: true }); } catch (e) {}

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

  // Returning to login means the current auth cookie was rejected. Remove it
  // before the main-process cookie check can load the authenticated page again.
  const removedCookies = [];
  let cookieStoreFlushed = false;
  const loginContents = {
    session: {
      cookies: {
        remove: async (url, name) => removedCookies.push([url, name]),
        flushStore: async () => { cookieStoreFlushed = true; },
      },
    },
  };
  await _internals.clearRejectedLoginCookie(
    loginContents,
    'file:///path/to/pc-dist/login.html?type=25'
  );
  assert.deepStrictEqual(removedCookies, [
    ['https://zaloapp.com', 'zpw_sek'],
    ['https://zalo.me', 'zpw_sek'],
    ['https://chat.zalo.me', 'zpw_sek'],
  ], 'login navigation must remove the rejected auth cookie from every written domain');
  assert.strictEqual(cookieStoreFlushed, true, 'rejected auth cookie removal must be persisted');
  assert.deepStrictEqual(global.zCookiesData, { cookies: [] }, 'rejected cookie snapshot must be cleared from main-process memory');
  assert.deepStrictEqual(global.zOldCookiesData, { cookies: [] }, 'legacy rejected cookie snapshot must be cleared from main-process memory');
  assert.strictEqual(global._callCheckCookies, false, 'pending stale-cookie checks must be cancelled');
  assert.strictEqual(global._doneGetCookies, false, 'completed stale-cookie checks must be invalidated');

  removedCookies.length = 0;
  await _internals.clearRejectedLoginCookie(loginContents, 'file:///path/to/pc-dist/index.html');
  assert.deepStrictEqual(removedCookies, [], 'authenticated navigation must keep the auth cookie');

  // Verify auth cookie synchronization across all required endpoints
  const writtenCookies = [];
  let syncStoreFlushed = false;
  const mockSyncSession = {
    cookies: {
      set: async (details) => writtenCookies.push(details),
      flushStore: async () => { syncStoreFlushed = true; },
    },
  };
  await _internals.syncAuthCookie(mockSyncSession, 'test-auth-token-12345');
  assert.strictEqual(syncStoreFlushed, true, 'syncAuthCookie must flush cookie store');
  assert.strictEqual(writtenCookies.length, _internals.AUTH_COOKIE_TARGETS.length, 'All target domains must receive cookie');
  assert(writtenCookies.some(c => c.url === 'https://wpa.chat.zalo.me' && c.domain === '.zalo.me'), 'wpa.chat.zalo.me with .zalo.me domain must be set');
  assert(writtenCookies.some(c => c.url === 'https://wpa.chat.zalo.me' && c.domain === 'wpa.chat.zalo.me'), 'wpa.chat.zalo.me host domain must be set');
  assert(writtenCookies.every(c => c.value === 'test-auth-token-12345' && c.name === 'zpw_sek'), 'All written cookies must have correct name and value');

  // Verify zfile protocol registration
  let registeredScheme = null;
  let registeredHandler = null;
  const mockProtocolSession = {
    protocol: {
      isProtocolRegistered: (scheme) => false,
      registerFileProtocol: (scheme, handler) => {
        registeredScheme = scheme;
        registeredHandler = handler;
      }
    }
  };
  _internals.registerZfileProtocol(mockProtocolSession);
  assert.strictEqual(registeredScheme, 'zfile', 'registerZfileProtocol must register zfile scheme');
  assert.strictEqual(typeof registeredHandler, 'function', 'registerZfileProtocol handler must be a function');
  let handledPath = null;
  registeredHandler({ url: 'zfile:///home/user/photo.jpg' }, (res) => { handledPath = res.path; });
  assert.strictEqual(handledPath, '/home/user/photo.jpg', 'zfile protocol must resolve file path correctly');

  // Verify zfile security against path traversal and sensitive files
  let traversalBlocked = false;
  registeredHandler({ url: 'zfile:///home/user/../../etc/passwd' }, (res) => { traversalBlocked = res && res.error === -10; });
  assert.strictEqual(traversalBlocked, true, 'zfile must block directory traversal attacks');

  let sysBlocked = false;
  registeredHandler({ url: 'zfile:///etc/shadow' }, (res) => { sysBlocked = res && res.error === -10; });
  assert.strictEqual(sysBlocked, true, 'zfile must block access to /etc');

  let dotfileBlocked = false;
  registeredHandler({ url: 'zfile:///home/user/.ssh/id_rsa' }, (res) => { dotfileBlocked = res && res.error === -10; });
  assert.strictEqual(dotfileBlocked, true, 'zfile must block access to .ssh files');

  let mediaHandled = null;
  registeredHandler({ url: 'zfile:///media/home/user/photo.jpg' }, (res) => { mediaHandled = res.path; });
  assert.strictEqual(mediaHandled, '/home/user/photo.jpg', 'zfile must resolve /media/ prefix safely');

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

  // 6. Test Windows CLI shims on Linux (powershell.exe, wmic)
  console.log('Testing Windows CLI Shims on Linux...');
  _internals.installCliShims();
  const cp = require('child_process');

  // Test powershell.exe signature verification
  const sigResult = await new Promise((resolve) => {
    cp.execFile('powershell.exe', ['-Command', 'Get-AuthenticodeSignature test | ConvertTo-Json'], (err, stdout) => {
      resolve(JSON.parse(stdout));
    });
  });
  assert.strictEqual(sigResult.Status, 0, 'powershell.exe signature verification shim must report Status: 0');

  // Test powershell.exe ConvertTo-Json
  const jsonTest = cp.execFileSync('powershell.exe', ['-Command', 'ConvertTo-Json test']);
  assert(jsonTest.toString().includes('test'), 'powershell.exe ConvertTo-Json shim must return test');

  // Test wmic os architecture
  const wmicArch = await new Promise((resolve) => {
    const proc = cp.spawn('wmic', ['os', 'get', 'osarchitecture']);
    let out = '';
    proc.stdout.on('data', d => { out += d.toString(); });
    proc.on('close', code => resolve({ out, code }));
  });
  assert.strictEqual(wmicArch.code, 0, 'wmic shim must exit with code 0');
  assert(wmicArch.out.includes('64-bit'), 'wmic shim must report 64-bit architecture');

  // Test powershell.exe batch launcher (update on quit)
  const psBatch = await new Promise((resolve) => {
    const proc = cp.spawn('powershell.exe', ['-WindowStyle', 'Hidden', '-File', 'update.bat']);
    proc.on('close', code => resolve(code));
  });
  assert.strictEqual(psBatch, 0, 'powershell.exe batch launcher shim must exit with code 0');

  // 7. Test Linux Drive & Migrate Config Invariants
  console.log('Testing Linux Drive & Migrate Config Invariants...');
  const testUserDataDir = path.join(os.tmpdir(), `zalo-test-userdata-${Date.now()}`);
  const testCalDir = path.join(testUserDataDir, 'cal');
  _internals.initLinuxConfig(testCalDir);

  const migrateConfig = path.join(testUserDataDir, 'migrate-config.json');
  assert(fs.existsSync(migrateConfig), 'migrate-config.json must be created in userDataDir');
  const migrateJson = JSON.parse(fs.readFileSync(migrateConfig, 'utf8'));
  assert.strictEqual(migrateJson.zalopc_m_c, true, 'zalopc_m_c must be true on Linux to avoid AppData fallback');

  // Clean up test userData dir
  try { fs.rmSync(testUserDataDir, { recursive: true, force: true }); } catch (e) {}

  // 8. Test System Tray & Spellchecker Configuration
  console.log('Testing System Tray & Spellchecker Configuration...');
  const iconPath = _internals.getTrayIconPath();
  assert(iconPath && fs.existsSync(iconPath), 'getTrayIconPath must return existing icon file: ' + iconPath);

  let spellcheckerDisabled = false;
  const mockSpellSession = {
    setSpellCheckerEnabled: (enabled) => {
      spellcheckerDisabled = !enabled;
    }
  };
  delete process.env.ZALO_SPELLCHECK;
  _internals.disableSpellcheckerIfConfigured(mockSpellSession);
  assert.strictEqual(spellcheckerDisabled, true, 'disableSpellcheckerIfConfigured must disable spellchecker by default');

  let trayCreated = false;
  let menuBuilt = false;
  const mockElectron = {
    app: {
      isQuitting: false,
      quit: () => {},
    },
    Tray: function(icon) {
      this.icon = icon;
      trayCreated = true;
      this.setToolTip = () => {};
      this.setContextMenu = () => {};
      this.on = () => {};
    },
    Menu: {
      buildFromTemplate: (template) => {
        menuBuilt = true;
        assert(Array.isArray(template), 'Menu template must be an array');
        assert(template.some(item => item.label === 'Mở Zalo'), 'Menu must contain Mở Zalo');
        assert(template.some(item => item.label === 'Thoát Zalo'), 'Menu must contain Thoát Zalo');
        return {};
      }
    },
    BrowserWindow: {
      getAllWindows: () => []
    }
  };
  _internals.initSystemTray(mockElectron);
  assert.strictEqual(trayCreated, true, 'initSystemTray must create Tray');
  assert.strictEqual(menuBuilt, true, 'initSystemTray must build ContextMenu');

  console.log('✅ ALL LINUX-COMPAT COORDINATOR TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
