'use strict';

/**
 * @module theme-manager
 * @description Manages UI theme injection, hotkey triggers, and origin validation for Zalo Linux.
 * Keeps UI presentation concerns separated from OS-level compatibility coordinator.
 */

const CYBERPUNK_BG = '#08090F';

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
 * Checks if Cyberpunk mode is forced via environment variable.
 * Opt-in only: returns true strictly when ZALO_THEME === 'cyberpunk'.
 * @returns {boolean}
 */
function isCyberpunkEnvActive() {
  return process.env.ZALO_THEME === 'cyberpunk';
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
        console.log('[Zalo Linux] Cyberpunk UI Mode: ENABLED');
      } else {
        document.documentElement.style.background = '';
        if (document.body) {
          document.body.classList.remove('scanlines');
          document.body.style.background = '';
        }
        localStorage.setItem('za_theme', JSON.stringify({ theme: 'dark' }));
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

    let url = '';
    try {
      url = contents.getURL();
    } catch (e) {
      return;
    }

    // Only apply to allowed UI windows (never worker windows like sqlite.html or shared-worker.html)
    if (!isAllowedUrl(url) || !isUIWindow(url)) return;

    // If env var is not explicitly set, renderer inline script (index.html / login.html) handles user preference
    const forceCyber = isCyberpunkEnvActive();
    if (!forceCyber) return;

    const checkAndApplyScript = `
      (function() {
        document.documentElement.style.background = '${CYBERPUNK_BG}';
        if (document.body) {
          document.body.classList.add('cyberpunk', 'dark', 'scanlines');
          document.body.style.background = '${CYBERPUNK_BG}';
        }
        console.log('[Zalo Linux] Cyberpunk UI Mode active (via env)');
      })();
    `;

    try {
      if (!win.isDestroyed() && !contents.isDestroyed()) {
        contents.executeJavaScript(checkAndApplyScript).catch(() => {});
      }
    } catch (e) {}
  });
}

module.exports = {
  CYBERPUNK_BG,
  isAllowedUrl,
  isUIWindow,
  isCyberpunkEnvActive,
  setCyberpunkTheme,
  toggleCyberpunkTheme,
  handleHotkey,
  attachWindowHooks,
};
