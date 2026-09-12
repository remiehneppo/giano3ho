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
  if (!win || !win.webContents) return;

  const url = win.webContents.getURL();
  if (!isAllowedUrl(url)) return;

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

  win.webContents.executeJavaScript(code).catch(() => {});
}

/**
 * Toggles Cyberpunk mode on hotkey.
 * @param {import('electron').BrowserWindow} win
 */
function toggleCyberpunkTheme(win) {
  if (!win || !win.webContents) return;

  const url = win.webContents.getURL();
  if (!isAllowedUrl(url)) return;

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

  win.webContents.executeJavaScript(toggleScript).catch(() => {});
}

/**
 * Handle hotkeys for theme management (F10 by default).
 * @param {import('electron').BrowserWindow} win
 * @param {object} input
 * @returns {boolean} true if hotkey was handled
 */
function handleHotkey(win, input) {
  if (!input) return false;

  // F10 toggles Cyberpunk UI Mode
  if (input.key === 'F10') {
    toggleCyberpunkTheme(win);
    return true;
  }

  return false;
}

/**
 * Attaches theme lifecycle hooks to a window's webContents.
 * @param {import('electron').BrowserWindow} win
 */
function attachWindowHooks(win) {
  if (!win || !win.webContents) return;

  win.webContents.on('dom-ready', () => {
    const url = win.webContents.getURL();
    if (!isAllowedUrl(url)) return;

    const forceCyber = isCyberpunkEnvActive();

    // Respect user's saved preference or env var; do NOT force on undefined env
    const checkAndApplyScript = `
      (function() {
        const forceCyber = ${forceCyber ? 'true' : 'false'};
        let isCyber = forceCyber;

        if (!forceCyber) {
          try {
            const zaThemeStr = localStorage.getItem('za_theme');
            if (zaThemeStr) {
              const parsed = JSON.parse(zaThemeStr);
              if (parsed && parsed.theme === 'cyberpunk') {
                isCyber = true;
              }
            }
          } catch(e) {}
        }

        if (isCyber) {
          document.documentElement.style.background = '${CYBERPUNK_BG}';
          if (document.body) {
            document.body.classList.add('cyberpunk', 'dark', 'scanlines');
            document.body.style.background = '${CYBERPUNK_BG}';
          }
          console.log('[Zalo Linux] Cyberpunk UI Mode active');
        }
      })();
    `;

    win.webContents.executeJavaScript(checkAndApplyScript).catch(() => {});
  });
}

module.exports = {
  CYBERPUNK_BG,
  isAllowedUrl,
  isCyberpunkEnvActive,
  setCyberpunkTheme,
  toggleCyberpunkTheme,
  handleHotkey,
  attachWindowHooks,
};
