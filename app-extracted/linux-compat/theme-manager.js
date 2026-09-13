'use strict';

/**
 * @module theme-manager
 * @description Manages UI theme injection, hotkey triggers, and origin validation for Zalo Linux.
 * Keeps UI presentation concerns separated from OS-level compatibility coordinator.
 */

const CYBERPUNK_BG = '#08090F';

/**
 * Renderer-side preference key owned by this compatibility layer.
 * Kept separate from Zalo's own `za_theme` so the default Cyberpunk theme cannot
 * be clobbered by the application writing its stock theme setting on startup.
 */
const THEME_PREF_KEY = 'zalo_linux_theme';

/**
 * `ZALO_THEME` values that explicitly opt out of the default Cyberpunk theme.
 * Any other value (including an unset variable) keeps Cyberpunk enabled.
 */
const CYBERPUNK_DISABLED_VALUES = new Set([
  '0',
  'false',
  'off',
  'no',
  'none',
  'default',
  'zalo',
  'classic',
  'light',
  'dark',
]);

/**
 * Validates whether the given URL is safe and intended for theme injection.
 * Prevents script injection on external third-party pages (OAuth, webviews, external links).
 * @param {string} url
 * @returns {boolean}
 */
function isAllowedUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  // Allow local file distribution
  if (url.startsWith('file://')) {
    return true;
  }

  // Allow official Zalo application domains
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'chat.zalo.me' ||
      host === 'zalo.me' ||
      host.endsWith('.zalo.me') ||
      host === 'zaloapp.com' ||
      host.endsWith('.zaloapp.com')
    );
  } catch (e) {
    return false;
  }
}

/**
 * Ensures script injection only targets user-facing UI windows.
 * Avoids touching background workers (sqlite.html, shared-worker.html, znotification.html).
 * @param {string} url
 * @returns {boolean}
 */
function isUIWindow(url) {
  if (!url || typeof url !== 'string') return false;
  return (
    url.includes('index.html') ||
    url.includes('login.html') ||
    url.includes('chat.zalo.me') ||
    url.includes('zalo.me')
  );
}

/**
 * Cyberpunk is the default UI theme on Linux.
 * Opt out by setting `ZALO_THEME` to one of CYBERPUNK_DISABLED_VALUES
 * (e.g. `ZALO_THEME=default`), or toggle at runtime with F10.
 * @returns {boolean}
 */
function isCyberpunkEnabled() {
  const raw = process.env.ZALO_THEME;
  if (raw === undefined || raw === null) return true;

  const normalized = String(raw).trim().toLowerCase();
  if (normalized === '') return true;

  return !CYBERPUNK_DISABLED_VALUES.has(normalized);
}

/**
 * Backwards-compatible alias of {@link isCyberpunkEnabled}.
 * @deprecated use isCyberpunkEnabled instead.
 * @returns {boolean}
 */
function isCyberpunkEnvActive() {
  return isCyberpunkEnabled();
}

/**
 * Injects Cyberpunk theme styling and classes into the target window.
 * @param {import('electron').BrowserWindow} win
 * @param {boolean} enable
 */
function setCyberpunkTheme(win, enable) {
  if (!win || win.isDestroyed()) return;
  const contents = win.webContents;
  if (!contents || contents.isDestroyed() || contents.isCrashed()) return;

  let url = '';
  try {
    url = contents.getURL();
  } catch (e) {
    return;
  }
  if (!isAllowedUrl(url) || !isUIWindow(url)) return;

  const code = enable
    ? `
      (function() {
        document.documentElement.style.background = '${CYBERPUNK_BG}';
        if (document.body) {
          document.body.classList.add('cyberpunk', 'dark', 'scanlines');
          document.body.style.background = '${CYBERPUNK_BG}';
        }
        localStorage.setItem('za_theme', JSON.stringify({ theme: 'cyberpunk' }));
        localStorage.setItem('${THEME_PREF_KEY}', 'cyberpunk');
        console.log('[Zalo Linux] Cyberpunk UI Mode: ENABLED');
      })();
    `
    : `
      (function() {
        document.documentElement.style.background = '';
        if (document.body) {
          document.body.classList.remove('cyberpunk', 'scanlines');
          document.body.style.background = '';
        }
        localStorage.setItem('za_theme', JSON.stringify({ theme: 'dark' }));
        localStorage.setItem('${THEME_PREF_KEY}', 'stock');
        console.log('[Zalo Linux] Cyberpunk UI Mode: DISABLED');
      })();
    `;

  try {
    if (!win.isDestroyed() && !contents.isDestroyed()) {
      contents.executeJavaScript(code).catch(() => {});
    }
  } catch (e) {}
}

/**
 * Toggles Cyberpunk mode on hotkey.
 * @param {import('electron').BrowserWindow} win
 */
function toggleCyberpunkTheme(win) {
  if (!win || win.isDestroyed()) return;
  const contents = win.webContents;
  if (!contents || contents.isDestroyed() || contents.isCrashed()) return;

  let url = '';
  try {
    url = contents.getURL();
  } catch (e) {
    return;
  }
  if (!isAllowedUrl(url) || !isUIWindow(url)) return;

  const toggleScript = `
    (function() {
      const isCyber = document.body ? document.body.classList.toggle('cyberpunk') : false;
      if (isCyber) {
        document.documentElement.style.background = '${CYBERPUNK_BG}';
        if (document.body) {
          document.body.classList.add('dark', 'scanlines');
          document.body.style.background = '${CYBERPUNK_BG}';
        }
        localStorage.setItem('za_theme', JSON.stringify({ theme: 'cyberpunk' }));
        localStorage.setItem('${THEME_PREF_KEY}', 'cyberpunk');
        console.log('[Zalo Linux] Cyberpunk UI Mode: ENABLED');
      } else {
        document.documentElement.style.background = '';
        if (document.body) {
          document.body.classList.remove('scanlines');
          document.body.style.background = '';
        }
        localStorage.setItem('za_theme', JSON.stringify({ theme: 'dark' }));
        localStorage.setItem('${THEME_PREF_KEY}', 'stock');
        console.log('[Zalo Linux] Cyberpunk UI Mode: DISABLED');
      }
    })();
  `;

  try {
    if (!win.isDestroyed() && !contents.isDestroyed()) {
      contents.executeJavaScript(toggleScript).catch(() => {});
    }
  } catch (e) {}
}

/**
 * Handle hotkeys for theme management (F10 by default).
 * @param {import('electron').BrowserWindow} win
 * @param {object} input
 * @returns {boolean} true if hotkey was handled
 */
function handleHotkey(win, input) {
  if (!input || input.key !== 'F10') return false;

  if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
    toggleCyberpunkTheme(win);
  }

  return true;
}

/**
 * Attaches theme lifecycle hooks to a window's webContents.
 * Defensively verifies window/frame lifecycle to avoid destroyed frame errors.
 * @param {import('electron').BrowserWindow} win
 */
function attachWindowHooks(win) {
  if (!win || win.isDestroyed()) return;
  const contents = win.webContents;
  if (!contents || contents.isDestroyed()) return;

  contents.on('dom-ready', () => {
    if (win.isDestroyed() || contents.isDestroyed() || contents.isCrashed()) return;

    // DEBUG: capture unhandled promise rejections in renderer to diagnose login loop
    if (!win.isDestroyed() && !contents.isDestroyed()) {
      contents.executeJavaScript(`
        if (!window.__debugRejectionInstalled) {
          window.__debugRejectionInstalled = true;
          window.addEventListener('unhandledrejection', function(e) {
            var val = e.reason;
            var msg = '';
            try { msg = JSON.stringify(val); } catch(ex) { try { msg = String(val); } catch(ex2) { msg = 'unknown'; } }
            console.error('[DEBUG-RENDERER] Unhandled rejection: ' + msg + ' stack=' + (val && val.stack ? val.stack : 'none'));
          });
        }
      `).catch(function(){});
    }

    let url = '';
    try {
      url = contents.getURL();
    } catch (e) {
      return;
    }

    // Only apply to allowed UI windows (never worker windows like sqlite.html or shared-worker.html)
    if (!isAllowedUrl(url) || !isUIWindow(url)) return;

    // Cyberpunk is the default theme. The rendered preference key keeps an
    // explicit in-app toggle (F10) and the ZALO_THEME opt-out authoritative,
    // without depending on Zalo's own `za_theme` value.
    const cyberpunkEnabled = isCyberpunkEnabled();

    const themeScript = cyberpunkEnabled
      ? `
      (function() {
        var preference = null;
        try {
          preference = localStorage.getItem('${THEME_PREF_KEY}');
        } catch (e) {}
        if (preference === 'stock') {
          console.log('[Zalo Linux] Cyberpunk UI Mode: skipped (user preference: stock)');
          return;
        }
        document.documentElement.style.background = '${CYBERPUNK_BG}';
        if (document.body) {
          document.body.classList.add('cyberpunk', 'dark', 'scanlines');
          document.body.style.background = '${CYBERPUNK_BG}';
        }
        localStorage.setItem('za_theme', JSON.stringify({ theme: 'cyberpunk' }));
        localStorage.setItem('${THEME_PREF_KEY}', 'cyberpunk');
        console.log('[Zalo Linux] Cyberpunk UI Mode: ENABLED (default)');
      })();
    `
      : `
      (function() {
        document.documentElement.style.background = '';
        if (document.body) {
          document.body.classList.remove('cyberpunk', 'scanlines');
          document.body.style.background = '';
        }
        localStorage.setItem('za_theme', JSON.stringify({ theme: 'dark' }));
        localStorage.setItem('${THEME_PREF_KEY}', 'stock');
        console.log('[Zalo Linux] Cyberpunk UI Mode: DISABLED (ZALO_THEME opt-out)');
      })();
    `;

    try {
      if (!win.isDestroyed() && !contents.isDestroyed()) {
        contents.executeJavaScript(themeScript).catch(() => {});
      }
    } catch (e) {}
  });
}

module.exports = {
  CYBERPUNK_BG,
  THEME_PREF_KEY,
  CYBERPUNK_DISABLED_VALUES,
  isAllowedUrl,
  isUIWindow,
  isCyberpunkEnabled,
  isCyberpunkEnvActive,
  setCyberpunkTheme,
  toggleCyberpunkTheme,
  handleHotkey,
  attachWindowHooks,
};
