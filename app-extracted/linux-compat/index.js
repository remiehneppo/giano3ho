'use strict';

/**
 * @module linux-compat
 * @description Consolidated Linux Compatibility Coordinator for Zalo PC.
 * Deep module encapsulating path normalization, configuration & metadata initialization,
 * non-blocking diagnostic streaming, window lifecycle hooks, and exception resilience.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const util = require('util');
const Module = require('module');
const themeManager = require('./theme-manager');

const APP_VERSION = '26.7.10';
const REQUIRED_META_FILES = [
  'main.meta',
  'login.meta',
  'preload-sqlite.meta',
  'shared-worker.meta',
  'render.meta',
  'znotification.meta',
  'u-process-media.meta',
];

let isInitialized = false;
let logWriteStream = null;
let resolvedLogPath = null;
let originalConsole = null;

// ==========================================
// 1. Path Normalization (Windows -> Unix)
// ==========================================
function installPathPatcher() {
  const originalResolveFilename = Module._resolveFilename;
  Module._resolveFilename = function(request, parent, isMain, options) {
    if (typeof request === 'string' && request.includes('\\')) {
      request = request.replace(/\\/g, '/');
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };
}

// ==========================================
// 2. Linux Config & Metadata Initialization
// ==========================================
function initLinuxConfig(customCalDir) {
  const homeDir = os.homedir();
  const calDir = customCalDir || process.env.ZALO_CAL_DIR || path.join(homeDir, '.config', 'ZaloData', 'cal');
  const zaloDataDir = path.dirname(calDir);

  try {
    fs.mkdirSync(calDir, { recursive: true });
  } catch (err) {
    // Directory already exists or handled gracefully
  }

  // Ensure migration status is marked complete on Linux to prevent falling back to Windows AppData path
  const migrateConfigPath = path.join(zaloDataDir, 'migrate-config.json');
  if (!fs.existsSync(migrateConfigPath)) {
    try {
      fs.writeFileSync(migrateConfigPath, JSON.stringify({ zalopc_m_c: true }), 'utf8');
    } catch (err) {}
  }

  const defaultMetaContent = JSON.stringify({
    version: APP_VERSION,
    initialized: true,
  });

  for (const file of REQUIRED_META_FILES) {
    const metaPath = path.join(calDir, file);
    let shouldWrite = false;

    if (!fs.existsSync(metaPath)) {
      shouldWrite = true;
    } else {
      try {
        const content = fs.readFileSync(metaPath, 'utf8').trim();
        if (!content) {
          shouldWrite = true;
        } else {
          JSON.parse(content);
        }
      } catch (err) {
        shouldWrite = true;
      }
    }

    if (shouldWrite) {
      try {
        fs.writeFileSync(metaPath, defaultMetaContent, 'utf8');
      } catch (err) {}
    }
  }
}

// ==========================================
// 3. Non-blocking Diagnostic Observer
// ==========================================
function resolveLogPath() {
  if (process.env.ZALO_DEBUG_LOG) {
    return process.env.ZALO_DEBUG_LOG;
  }
  return path.resolve(__dirname, '..', '..', 'zalo-debug.log');
}

function closeDiagnosticStream() {
  if (logWriteStream && !logWriteStream.destroyed) {
    try {
      logWriteStream.end();
    } catch (e) {}
    logWriteStream = null;
  }
}

function initDiagnosticStream(customPath) {
  resolvedLogPath = customPath || resolveLogPath();

  if (logWriteStream && !logWriteStream.destroyed) {
    closeDiagnosticStream();
  }

  try {
    if (fs.existsSync(resolvedLogPath)) {
      const stats = fs.statSync(resolvedLogPath);
      if (stats.size > 5 * 1024 * 1024) {
        fs.unlinkSync(resolvedLogPath);
      }
    }
    logWriteStream = fs.createWriteStream(resolvedLogPath, { flags: 'a', encoding: 'utf8' });
    logWriteStream.on('error', (err) => {
      if (originalConsole) {
        originalConsole.warn(`[Zalo Linux] Diagnostic stream error: ${err.message}`);
      }
      logWriteStream = null;
    });
    const header = `\n=== Zalo Linux Session Started ${new Date().toISOString()} ===\n`;
    logWriteStream.write(header);
  } catch (err) {
    logWriteStream = null;
    return;
  }
}

function writeDiagnostic(prefix, message) {
  if (!logWriteStream || logWriteStream.destroyed || logWriteStream.writableEnded) return;

  const timestamp = new Date().toISOString();
  let text = message;
  if (typeof text === 'object' && text !== null) {
    try {
      text = JSON.stringify(text);
    } catch (e) {
      text = String(text);
    }
  }
  logWriteStream.write(`[${timestamp}] [${prefix}] ${text}\n`);
}

function installConsoleInterception() {
  if (originalConsole) return;

  originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };

  console.log = function(...args) {
    const msg = util.format(...args);
    // Filter out messages that already carry window/renderer prefixes to eliminate duplicate entries
    if (!msg.startsWith('[Renderer]') && !msg.startsWith('[Window Navigate]')) {
      writeDiagnostic('Main LOG', msg);
    }
    originalConsole.log.apply(console, args);
  };

  console.warn = function(...args) {
    const msg = util.format(...args);
    writeDiagnostic('Main WARN', msg);
    originalConsole.warn.apply(console, args);
  };

  console.error = function(...args) {
    const msg = util.format(...args);
    writeDiagnostic('Main ERROR', msg);
    originalConsole.error.apply(console, args);
  };
}

// ==========================================
// 4. Exception & Rejection Resilience
// ==========================================
function installErrorHandler() {
  process.on('unhandledRejection', (reason) => {
    const errorMsg = (reason && reason.message) ? reason.message : String(reason);
    const stack = (reason && reason.stack) ? `\nStack: ${reason.stack}` : '';
    const logLine = `Suppressed unhandled rejection: ${errorMsg}${stack}`;
    writeDiagnostic('UnhandledRejection', logLine);
    if (originalConsole) {
      originalConsole.warn(`[Zalo Linux] Suppressed unhandled rejection: ${errorMsg}`);
    } else {
      console.warn(`[Zalo Linux] Suppressed unhandled rejection: ${errorMsg}`);
    }
  });

  process.on('uncaughtException', (error) => {
    const errorMsg = (error && error.message) ? error.message : String(error);
    const stack = (error && error.stack) ? `\nStack: ${error.stack}` : '';
    writeDiagnostic('UncaughtException', `${errorMsg}${stack}`);
    if (originalConsole) {
      originalConsole.error(`[Zalo Linux] Uncaught exception: ${errorMsg}`);
    } else {
      console.error(`[Zalo Linux] Uncaught exception: ${errorMsg}`);
    }
  });
}

const LOGIN_COOKIE_URLS = [
  'https://zaloapp.com',
  'https://zalo.me',
  'https://chat.zalo.me',
];

const AUTH_COOKIE_TARGETS = [
  { url: 'https://wpa.chat.zalo.me', domain: '.zalo.me' },
  { url: 'https://wpa.chat.zalo.me', domain: '.chat.zalo.me' },
  { url: 'https://wpa.chat.zalo.me', domain: 'wpa.chat.zalo.me' },
  { url: 'https://chat.zalo.me', domain: 'chat.zalo.me' },
  { url: 'https://chat.zalo.me', domain: '.chat.zalo.me' },
  { url: 'https://zalo.me', domain: 'zalo.me' },
  { url: 'https://zalo.me', domain: '.zalo.me' },
  { url: 'https://zaloapp.com', domain: 'zaloapp.com' },
];

let latestAuthCookie = null;
let lastAuthCookieTimestamp = 0;

async function syncAuthCookie(sessionInstance, token) {
  if (!sessionInstance || !sessionInstance.cookies || !token) return;
  const expiry = Math.floor(Date.now() / 1000) + 604800 * 4;
  for (const target of AUTH_COOKIE_TARGETS) {
    try {
      await sessionInstance.cookies.set({
        url: target.url,
        name: 'zpw_sek',
        value: token,
        domain: target.domain,
        httpOnly: true,
        secure: true,
        expirationDate: expiry,
        sameSite: 'no_restriction',
      });
    } catch (e) {}
  }
  if (typeof sessionInstance.cookies.flushStore === 'function') {
    try { await sessionInstance.cookies.flushStore(); } catch (e) {}
  }
}

async function clearRejectedLoginCookie(contents, url) {
  if (typeof url !== 'string' || !url.startsWith('file:')) return;

  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    return;
  }
  if (!parsed.pathname.endsWith('/login.html')) return;

  if (Date.now() - lastAuthCookieTimestamp < 10000) {
    writeDiagnostic('Auth', 'Skipped clearRejectedLoginCookie: fresh login cookie set within last 10s');
    return;
  }

  latestAuthCookie = null;
  global.zCookiesData = { cookies: [] };
  global.zOldCookiesData = { cookies: [] };
  global._callCheckCookies = false;
  global._doneGetCookies = false;

  const cookies = contents && contents.session && contents.session.cookies;
  if (!cookies || typeof cookies.remove !== 'function') return;

  await Promise.all(LOGIN_COOKIE_URLS.map(cookieUrl => cookies.remove(cookieUrl, 'zpw_sek')));
  if (typeof cookies.flushStore === 'function') await cookies.flushStore();
  writeDiagnostic('Auth', 'Removed rejected zpw_sek cookie after login navigation');
}

function sanitizeZfilePath(rawUrl) {
  if (typeof rawUrl !== 'string') return null;
  let p;
  try {
    p = decodeURIComponent(rawUrl.replace(/^zfile:\/+/i, '/'));
  } catch (e) {
    return null;
  }
  if (p.includes('\0')) return null;
  if (p.startsWith('/media/')) p = p.substring(6);
  p = path.normalize(p);
  if (!path.isAbsolute(p)) return null;

  // Block sensitive OS root directories
  const blockedPrefixes = ['/etc', '/proc', '/sys', '/dev', '/boot', '/root'];
  if (blockedPrefixes.some(prefix => p === prefix || p.startsWith(prefix + '/'))) {
    return null;
  }
  // Block sensitive credentials and dotfiles
  if (/[\/\\]\.(ssh|gnupg|aws|bashrc|bash_profile|zshrc)($|[\/\\])/i.test(p)) {
    return null;
  }
  return p;
}

function registerZfileProtocol(ses) {
  if (!ses || !ses.protocol) return;
  try {
    if (typeof ses.protocol.isProtocolRegistered === 'function' && ses.protocol.isProtocolRegistered('zfile')) {
      return;
    }
    ses.protocol.registerFileProtocol('zfile', (request, callback) => {
      const sanitized = sanitizeZfilePath(request.url);
      if (!sanitized) {
        writeDiagnostic('Protocol WARN', `Blocked potentially unsafe zfile request: ${request.url}`);
        return callback({ error: -10 });
      }
      callback({ path: sanitized });
    });
    writeDiagnostic('Protocol', 'Registered zfile file protocol for session');
  } catch (e) {
    writeDiagnostic('Protocol WARN', `Failed to register zfile protocol: ${e.message}`);
  }
}

let appTray = null;

function getTrayIconPath() {
  const possibleIcons = [
    path.resolve(__dirname, '..', 'pc-dist', 'favicon-32x32.png'),
    path.resolve(__dirname, '..', 'pc-dist', 'favicon-96x96.v1.png'),
    path.resolve(__dirname, '..', 'pc-dist', 'favicon-128x128.png'),
    path.resolve(__dirname, '..', 'pc-dist', 'favicon.ico'),
  ];
  for (const iconPath of possibleIcons) {
    if (fs.existsSync(iconPath)) return iconPath;
  }
  return null;
}

function disableSpellcheckerIfConfigured(ses) {
  if (!ses) return;
  // By default on Linux, disable spellchecker unless ZALO_SPELLCHECK=1
  // This prevents red squiggly underlines on all Vietnamese chat messages
  if (process.env.ZALO_SPELLCHECK !== '1' && typeof ses.setSpellCheckerEnabled === 'function') {
    try {
      ses.setSpellCheckerEnabled(false);
      writeDiagnostic('Session', 'Disabled spellchecker to prevent red underlines on Vietnamese text');
    } catch (e) {
      writeDiagnostic('Session WARN', `Failed to disable spellchecker: ${e.message}`);
    }
  }
}

function initSystemTray(electron) {
  if (appTray || process.env.ZALO_DISABLE_TRAY === '1') return;
  const { app, Tray, Menu, nativeImage, BrowserWindow } = electron;
  if (!Tray || !Menu || !BrowserWindow) return;

  const iconPath = getTrayIconPath();
  if (!iconPath) return;

  try {
    const icon = nativeImage && typeof nativeImage.createFromPath === 'function'
      ? nativeImage.createFromPath(iconPath)
      : iconPath;
    appTray = new Tray(icon);
    appTray.setToolTip('Zalo PC (Linux)');

    const showMainWindow = () => {
      const allWindows = BrowserWindow.getAllWindows();
      const uiWin = allWindows.find(w => {
        if (!w || w.isDestroyed()) return false;
        let url = '';
        try {
          url = w.webContents && !w.webContents.isDestroyed() ? w.webContents.getURL() : '';
        } catch (e) {}
        return themeManager.isUIWindow(url) || !url;
      }) || allWindows[0];

      if (uiWin) {
        if (uiWin.isMinimized()) uiWin.restore();
        uiWin.show();
        uiWin.focus();
      }
    };

    const toggleMainWindow = () => {
      const allWindows = BrowserWindow.getAllWindows();
      const uiWin = allWindows.find(w => {
        if (!w || w.isDestroyed()) return false;
        let url = '';
        try {
          url = w.webContents && !w.webContents.isDestroyed() ? w.webContents.getURL() : '';
        } catch (e) {}
        return themeManager.isUIWindow(url) || !url;
      }) || allWindows[0];

      if (uiWin) {
        if (uiWin.isVisible() && !uiWin.isMinimized()) {
          uiWin.hide();
        } else {
          if (uiWin.isMinimized()) uiWin.restore();
          uiWin.show();
          uiWin.focus();
        }
      }
    };

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Mở Zalo',
        click: () => showMainWindow(),
      },
      {
        label: 'Giao diện Cyberpunk',
        type: 'checkbox',
        checked: themeManager.isCyberpunkEnabled(),
        click: (menuItem) => {
          const allWindows = BrowserWindow.getAllWindows();
          for (const w of allWindows) {
            themeManager.setCyberpunkTheme(w, menuItem.checked);
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Thoát Zalo',
        click: () => {
          app.isQuitting = true;
          app.quit();
        },
      },
    ]);

    appTray.setContextMenu(contextMenu);
    appTray.on('click', () => {
      toggleMainWindow();
    });
    writeDiagnostic('Tray', 'System tray initialized successfully');
  } catch (err) {
    writeDiagnostic('Tray WARN', `Failed to initialize system tray: ${err.message}`);
  }
}

function handleCheckAutoLaunch() {
  try {
    const autostartFile = path.join(os.homedir(), '.config', 'autostart', 'zalo.desktop');
    return fs.existsSync(autostartFile);
  } catch (e) {
    return false;
  }
}

function handleToggleAutoLaunch(enable) {
  try {
    const autostartDir = path.join(os.homedir(), '.config', 'autostart');
    const autostartFile = path.join(autostartDir, 'zalo.desktop');
    const shouldEnable = Boolean(enable);
    if (shouldEnable) {
      fs.mkdirSync(autostartDir, { recursive: true });
      const runShPath = path.resolve(__dirname, '..', '..', 'run.sh');
      const iconPath = path.resolve(__dirname, '..', 'pc-dist', 'favicon-512x512.png');
      const content = `[Desktop Entry]\nVersion=1.0\nType=Application\nName=Zalo (Autostart)\nComment=Zalo Desktop Client (Start Minimized)\nExec="${runShPath}" --minimized\nIcon=${iconPath}\nTerminal=false\nStartupWMClass=Zalo\nCategories=Network;InstantMessaging;Chat;\nX-GNOME-Autostart-enabled=true\n`;
      fs.writeFileSync(autostartFile, content, 'utf8');
      writeDiagnostic("AutoLaunch", "Enabled Linux autostart (~/.config/autostart/zalo.desktop)");
    } else {
      if (fs.existsSync(autostartFile)) {
        fs.unlinkSync(autostartFile);
        writeDiagnostic("AutoLaunch", "Disabled Linux autostart");
      }
    }
    return shouldEnable;
  } catch (e) {
    writeDiagnostic("AutoLaunch WARN", `Failed to toggle autostart: ${e.message}`);
    return false;
  }
}

// ==========================================
// 5. Window Lifecycle & DevTools Hooks
// ==========================================
function installWindowHooks() {
  const probedSessions = new WeakSet();
  let electron;
  try {
    electron = require('electron');
  } catch (err) {
    return;
  }

  const { app } = electron;
  if (!app || typeof app.on !== 'function') {
    return;
  }

  const IS_DEBUG = process.env.ZALO_LINUX_DEBUG === '1' || process.env.DEBUG === '1';

  if (typeof app.whenReady === 'function') {
    app.whenReady().then(() => {
      try {
        if (electron.session) {
          const persistSes = electron.session.fromPartition('persist:zalo');
          registerZfileProtocol(persistSes);
          disableSpellcheckerIfConfigured(persistSes);
          if (electron.session.defaultSession) {
            registerZfileProtocol(electron.session.defaultSession);
            disableSpellcheckerIfConfigured(electron.session.defaultSession);
          }
        }
        initSystemTray(electron);
      } catch (e) {}
    }).catch(() => {});
  }

  const originalHandle = electron.ipcMain.handle.bind(electron.ipcMain);
  electron.ipcMain.handle = (channel, listener) => {
    const watched = channel === "_electron_set-app-cookie" || channel === "login-success";
    if (IS_DEBUG && watched) writeDiagnostic("DEBUG-ipc-register", channel);
    return originalHandle(channel, async (event, ...args) => {
      if (channel === "_electron_set-app-cookie") {
        const token = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].value ? args[0].value : null);
        if (token && token.length > 0) {
          latestAuthCookie = token;
          lastAuthCookieTimestamp = Date.now();
          writeDiagnostic("Auth", `Captured zpw_sek via _electron_set-app-cookie (len=${token.length})`);
          try {
            const persistSes = electron.session.fromPartition("persist:zalo");
            syncAuthCookie(persistSes, token).catch(() => {});
          } catch (e) {}
        }
      } else if (channel === "login-success") {
        writeDiagnostic("Auth", "login-success IPC received from renderer");
        if (latestAuthCookie) {
          global.zCookiesData = { cookies: [{ name: 'zpw_sek', value: latestAuthCookie, domain: '.zalo.me' }] };
          global.zOldCookiesData = { cookies: [{ name: 'zpw_sek', value: latestAuthCookie, domain: '.zalo.me' }] };
        }
      } else if (channel === "check-auto-launch") {
        return handleCheckAutoLaunch();
      } else if (channel === "toggle-auto-launch") {
        return handleToggleAutoLaunch(args[0]);
      }

      if (IS_DEBUG && watched) {
        writeDiagnostic("DEBUG-ipc-call", {
          channel,
          partition: event.sender.session === electron.session.fromPartition("persist:zalo")
            ? "persist:zalo"
            : "other",
          valueLength: typeof args[0] === "string" ? args[0].length : -1,
        });
      }

      let result;
      try {
        result = await listener(event, ...args);
      } catch (err) {
        writeDiagnostic("IPC ERROR", `Error in handler for '${channel}': ${err.message}`);
        if (channel === "check-auto-launch") return false;
        if (channel === "toggle-auto-launch") return false;
        throw err;
      }

      // Ensure result can be structured-cloned across IPC boundary without throwing
      if (result && typeof result === 'object' && !(result instanceof Buffer) && !(result instanceof Error)) {
        try {
          structuredClone(result);
        } catch (cloneErr) {
          try {
            result = JSON.parse(JSON.stringify(result));
          } catch (jsonErr) {}
        }
      }

      if (IS_DEBUG && watched) {
        const cookies = await electron.session.fromPartition("persist:zalo").cookies.get({
          url: "https://wpa.chat.zalo.me",
          name: "zpw_sek",
        });
        writeDiagnostic("DEBUG-ipc-result", {
          channel,
          cookieCount: cookies.length,
          domains: cookies.map(cookie => cookie.domain),
        });
      }
      return result;
    });
  };

  app.on("browser-window-created", (event, win) => {
    if (!win || win.isDestroyed() || !win.webContents || win.webContents.isDestroyed()) return;

    const ses = win.webContents.session;
    if (ses && !probedSessions.has(ses)) {
      probedSessions.add(ses);
      registerZfileProtocol(ses);
      disableSpellcheckerIfConfigured(ses);
      const partition = electron.session && ses === electron.session.fromPartition('persist:zalo')
        ? 'persist:zalo'
        : 'other';
      const reportHeader = (stage, details) => {
        if (!IS_DEBUG || !details.url.includes('/api/login/getLoginInfo')) return;
        const header = details.requestHeaders.Cookie || details.requestHeaders.cookie || '';
        const authCookie = header.split(';').map(part => part.trim())
          .find(part => part.startsWith('zpw_sek='));
        writeDiagnostic('DEBUG-auth-header', JSON.stringify({
          stage,
          partition,
          hasCookie: Boolean(authCookie),
          length: authCookie ? authCookie.length - 8 : 0,
        }));
      };

      const authFilter = { urls: ['https://*.zalo.me/*', 'https://*.chat.zalo.me/*'] };

      ses.webRequest.onHeadersReceived(authFilter, (details, callback) => {
        const headers = details.responseHeaders || {};
        const setCookieHeaders = headers['set-cookie'] || headers['Set-Cookie'] || [];
        for (const cookieStr of setCookieHeaders) {
          const match = cookieStr.match(/zpw_sek=([^;]+)/);
          if (match && match[1] && match[1].length > 0) {
            latestAuthCookie = match[1];
            lastAuthCookieTimestamp = Date.now();
            writeDiagnostic('Auth', `Captured zpw_sek from Set-Cookie response on ${details.url}`);
            syncAuthCookie(ses, latestAuthCookie).catch(() => {});
            break;
          }
        }
        callback({ responseHeaders: details.responseHeaders });
      });

      ses.webRequest.onBeforeSendHeaders(authFilter, (details, callback) => {
        const headers = details.requestHeaders;
        let cookieHeader = headers.Cookie || headers.cookie || '';

        // Inject or deduplicate zpw_sek for all API and auth requests
        if (latestAuthCookie && (details.url.includes('/api/') || details.url.includes('chat.zalo.me') || details.url.includes('zalo.me'))) {
          const parts = cookieHeader.split(';').map(p => p.trim()).filter(Boolean);
          const nonAuth = parts.filter(p => !p.startsWith('zpw_sek='));
          nonAuth.unshift(`zpw_sek=${latestAuthCookie}`);
          headers.Cookie = nonAuth.join('; ');
          delete headers.cookie;
        }

        if (IS_DEBUG) {
          reportHeader('before', details);
          if (details.url.includes('/api/login/getLoginInfo')) {
            ses.cookies.get({ url: 'https://wpa.chat.zalo.me' }).then(cookies => {
              writeDiagnostic('DEBUG-auth-store', JSON.stringify({
                partition,
                cookies: cookies.filter(cookie => cookie.name === 'zpw_sek').map(cookie => ({
                  domain: cookie.domain,
                  path: cookie.path,
                  secure: cookie.secure,
                  sameSite: cookie.sameSite,
                  expirationDate: cookie.expirationDate,
                })),
              }));
            }).catch(() => {});
          }
        }
        callback({ requestHeaders: headers });
      });

      if (IS_DEBUG) {
        ses.webRequest.onSendHeaders(authFilter, details => reportHeader('sent', details));
      }
    }

    // Shortcuts: DevTools (F12, Ctrl+Shift+I) & Theme triggers
    win.webContents.on('before-input-event', (inputEvent, input) => {
      if (win.isDestroyed() || win.webContents.isDestroyed()) return;
      const isF12 = input.key === 'F12';
      const isCtrlShiftI = input.control && input.shift && input.key && input.key.toLowerCase() === 'i';

      if (isF12 || isCtrlShiftI) {
        win.webContents.toggleDevTools();
        return;
      }

      themeManager.handleHotkey(win, input);
    });

    // Theme lifecycle hooks
    themeManager.attachWindowHooks(win);

    // Directly stream renderer console messages to diagnostic log (no double logging)
    win.webContents.on('console-message', (consoleEvent, level, message) => {
      if (win.isDestroyed() || win.webContents.isDestroyed()) return;
      let msg = message;
      if (consoleEvent && consoleEvent.message !== undefined) {
        msg = consoleEvent.message;
      }
      writeDiagnostic('Renderer', msg);
      if (originalConsole) {
        originalConsole.log(`[Renderer] ${msg}`);
      } else {
        console.log(`[Renderer] ${msg}`);
      }
    });

    // Window navigation tracking
    win.webContents.on('did-navigate', (navEvent, url) => {
      if (win.isDestroyed() || win.webContents.isDestroyed()) return;
      writeDiagnostic('Navigate', `did-navigate: ${url}`);
      clearRejectedLoginCookie(win.webContents, url).catch((err) => {
        writeDiagnostic('Auth ERROR', `Failed to remove rejected login cookie: ${err.message}`);
      });
      if (originalConsole) {
        originalConsole.log(`[Window Navigate] did-navigate to: ${url}`);
      } else {
        console.log(`[Window Navigate] did-navigate to: ${url}`);
      }
    });

    // Window navigation load failures
    win.webContents.on('did-fail-load', (failEvent, errorCode, errorDescription, validatedURL) => {
      if (win.isDestroyed() || win.webContents.isDestroyed()) return;
      const errorMsg = `did-fail-load: code ${errorCode} (${errorDescription}) URL: ${validatedURL}`;
      writeDiagnostic('Navigate ERROR', errorMsg);
      if (originalConsole) {
        originalConsole.error(`[Window Navigate ERROR] ${errorMsg}`);
      } else {
        console.error(`[Window Navigate ERROR] ${errorMsg}`);
      }
    });

    // Minimize to tray on close if tray is enabled
    win.on('close', (closeEvent) => {
      if (app.isQuitting) return;
      if (process.env.ZALO_DISABLE_TRAY === '1') return;

      let url = '';
      try {
        url = win.webContents && !win.webContents.isDestroyed() ? win.webContents.getURL() : '';
      } catch (e) {}

      if (themeManager.isUIWindow(url) || !url) {
        closeEvent.preventDefault();
        win.hide();
        writeDiagnostic('Window', `Window minimized to tray instead of closing: ${url || 'initial'}`);
      }
    });

    // Handle startup --minimized / --hidden
    if (process.argv.some(arg => arg === '--minimized' || arg === '--hidden')) {
      win.webContents.once('did-finish-load', () => {
        if (!win.isDestroyed()) {
          win.hide();
          writeDiagnostic('Window', 'Window launched minimized to tray');
        }
      });
    }
  });
}

// ==========================================
// 6. Windows CLI Shims for Linux (powershell.exe, wmic)
// ==========================================
function installCliShims() {
  const cp = require('child_process');
  const { EventEmitter } = require('events');
  const { Readable, Writable } = require('stream');

  function createMockChildProcess(stdoutData = '', exitCode = 0) {
    const proc = new EventEmitter();
    proc.pid = 100000 + Math.floor(Math.random() * 10000);
    const stdout = new Readable({
      read() {
        this.push(stdoutData);
        this.push(null);
      }
    });
    const stderr = new Readable({ read() { this.push(null); } });
    proc.stdout = stdout;
    proc.stderr = stderr;
    proc.stdin = new Writable({ write(chunk, enc, cb) { cb(); } });
    proc.unref = () => proc;
    proc.ref = () => proc;
    proc.kill = () => true;

    let exitEmitted = false;
    const emitExit = () => {
      if (exitEmitted) return;
      exitEmitted = true;
      process.nextTick(() => {
        proc.emit('exit', exitCode, null);
        proc.emit('close', exitCode, null);
      });
    };
    stdout.on('end', emitExit);
    setImmediate(emitExit);
    return proc;
  }

  if (cp._linuxCompatShimsInstalled) return;
  cp._linuxCompatShimsInstalled = true;

  const originalSpawn = cp.spawn;
  cp.spawn = function(command, args, options) {
    const base = String(command).split(/[\\/]/).pop().toLowerCase();
    if (base === 'wmic' || base === 'wmic.exe') {
      const argStr = Array.isArray(args) ? args.join(' ') : String(args || '');
      if (/osarchitecture/i.test(argStr)) {
        return createMockChildProcess('OSArchitecture\r\n64-bit\r\n', 0);
      }
      if (/process/i.test(argStr)) {
        return createMockChildProcess('CreationDate KernelModeTime ParentProcessId ProcessId UserModeTime WorkingSetSize\r\n', 0);
      }
      return createMockChildProcess('', 0);
    }
    if (base === 'powershell' || base === 'powershell.exe') {
      return createMockChildProcess('', 0);
    }
    return originalSpawn.apply(this, arguments);
  };

  const originalExecFile = cp.execFile;
  cp.execFile = function(file, args, options, callback) {
    let cb = typeof args === 'function' ? args : (typeof options === 'function' ? options : callback);
    const base = String(file).split(/[\\/]/).pop().toLowerCase();
    if (base === 'powershell' || base === 'powershell.exe') {
      const argStr = Array.isArray(args) ? args.join(' ') : String(args || '');
      if (/Get-AuthenticodeSignature/i.test(argStr)) {
        const mockResult = JSON.stringify({ Status: 0, SignerCertificate: { Status: 0 } });
        if (typeof cb === 'function') {
          process.nextTick(() => cb(null, mockResult, ''));
        }
        return createMockChildProcess(mockResult, 0);
      }
      if (typeof cb === 'function') {
        process.nextTick(() => cb(null, '', ''));
      }
      return createMockChildProcess('', 0);
    }
    if (base === 'wmic' || base === 'wmic.exe') {
      const argStr = Array.isArray(args) ? args.join(' ') : String(args || '');
      let res = '';
      if (/osarchitecture/i.test(argStr)) {
        res = 'OSArchitecture\r\n64-bit\r\n';
      }
      if (typeof cb === 'function') {
        process.nextTick(() => cb(null, res, ''));
      }
      return createMockChildProcess(res, 0);
    }
    return originalExecFile.apply(this, arguments);
  };

  const originalExecFileSync = cp.execFileSync;
  cp.execFileSync = function(file, args, options) {
    const base = String(file).split(/[\\/]/).pop().toLowerCase();
    if (base === 'powershell' || base === 'powershell.exe') {
      const argStr = Array.isArray(args) ? args.join(' ') : String(args || '');
      if (/ConvertTo-Json/i.test(argStr)) {
        return Buffer.from('test\r\n');
      }
      return Buffer.from('');
    }
    if (base === 'wmic' || base === 'wmic.exe') {
      const argStr = Array.isArray(args) ? args.join(' ') : String(args || '');
      if (/osarchitecture/i.test(argStr)) {
        return Buffer.from('OSArchitecture\r\n64-bit\r\n');
      }
      return Buffer.from('');
    }
    return originalExecFileSync.apply(this, arguments);
  };
}

// ==========================================
// Central Coordinator Entry Point
// ==========================================
function initLinuxCompat(options = {}) {
  if (process.platform !== 'linux') {
    return;
  }

  if (isInitialized) {
    return;
  }
  isInitialized = true;

  const {
    enableLogger = true,
    enableDevTools = true,
    logPath,
  } = options;

  // 1. Path resolver patch
  installPathPatcher();

  // 2. Configuration directory & meta files
  initLinuxConfig();

  // 3. Non-blocking diagnostic stream & console capture
  if (enableLogger) {
    initDiagnosticStream(logPath);
    installConsoleInterception();
  }

  // 4. Exception & rejection resilience
  installErrorHandler();

  // 5. Windows CLI shims for Linux
  installCliShims();

  // 6. Window hooks & DevTools
  if (enableDevTools) {
    installWindowHooks();
  }
}

module.exports = {
  initLinuxCompat,
  _internals: {
    installPathPatcher,
    initLinuxConfig,
    initDiagnosticStream,
    closeDiagnosticStream,
    writeDiagnostic,
    installErrorHandler,
    installCliShims,
    clearRejectedLoginCookie,
    syncAuthCookie,
    AUTH_COOKIE_TARGETS,
    registerZfileProtocol,
    sanitizeZfilePath,
    getLogPath: () => resolvedLogPath,
    REQUIRED_META_FILES,
    themeManager,
    initSystemTray,
    disableSpellcheckerIfConfigured,
    getTrayIconPath,
    getAppTray: () => appTray,
    handleCheckAutoLaunch,
    handleToggleAutoLaunch,
  },
};
