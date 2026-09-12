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
  'preload-sqlite.meta',
  'shared-worker.meta',
  'render.meta',
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
function initLinuxConfig() {
  const homeDir = os.homedir();
  const calDir = path.join(homeDir, '.config', 'ZaloData', 'cal');

  try {
    fs.mkdirSync(calDir, { recursive: true });
  } catch (err) {
    // Directory already exists or handled gracefully
  }

  const defaultMetaContent = JSON.stringify({
    version: APP_VERSION,
    initialized: true,
  });

  for (const file of REQUIRED_META_FILES) {
    const metaPath = path.join(calDir, file);
    if (!fs.existsSync(metaPath)) {
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

// ==========================================
// 5. Window Lifecycle & DevTools Hooks
// ==========================================
function installWindowHooks() {
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

  app.on('browser-window-created', (event, win) => {
    if (!win || !win.webContents) return;

    // Shortcuts: DevTools (F12, Ctrl+Shift+I) & Theme triggers
    win.webContents.on('before-input-event', (inputEvent, input) => {
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
      writeDiagnostic('Navigate', `did-navigate: ${url}`);
      if (originalConsole) {
        originalConsole.log(`[Window Navigate] did-navigate to: ${url}`);
      } else {
        console.log(`[Window Navigate] did-navigate to: ${url}`);
      }
    });

    // Window navigation load failures
    win.webContents.on('did-fail-load', (failEvent, errorCode, errorDescription, validatedURL) => {
      const errorMsg = `did-fail-load: code ${errorCode} (${errorDescription}) URL: ${validatedURL}`;
      writeDiagnostic('Navigate ERROR', errorMsg);
      if (originalConsole) {
        originalConsole.error(`[Window Navigate ERROR] ${errorMsg}`);
      } else {
        console.error(`[Window Navigate ERROR] ${errorMsg}`);
      }
    });
  });
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

  // 5. Window hooks & DevTools
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
    getLogPath: () => resolvedLogPath,
    REQUIRED_META_FILES,
    themeManager,
  },
};
