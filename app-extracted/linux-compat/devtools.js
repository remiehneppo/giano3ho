'use strict';

/**
 * @module devtools
 * @description Injects developer shortcuts (F12, Ctrl+Shift+I) and monitors
 * BrowserWindow lifecycle events (renderer console, navigation, load errors).
 */

const { appendLog } = require('./logger');

function installDevToolsHooks() {
  let electron;
  try {
    electron = require('electron');
  } catch (err) {
    // Electron not available in this context
    return;
  }

  const { app } = electron;
  if (!app || typeof app.on !== 'function') {
    return;
  }

  app.on('browser-window-created', (event, win) => {
    if (!win || !win.webContents) return;

    // Toggle DevTools on F12 or Ctrl+Shift+I
    win.webContents.on('before-input-event', (inputEvent, input) => {
      const isF12 = input.key === 'F12';
      const isCtrlShiftI = input.control && input.shift && input.key && input.key.toLowerCase() === 'i';

      if (isF12 || isCtrlShiftI) {
        win.webContents.toggleDevTools();
      }
    });

    // Mirror renderer console messages to terminal and debug log
    win.webContents.on('console-message', (consoleEvent, level, message) => {
      let msg = message;
      if (consoleEvent && consoleEvent.message !== undefined) {
        msg = consoleEvent.message;
      }
      appendLog('Renderer', msg);
      console.log(`[Renderer] ${msg}`);
    });

    // Log window navigation
    win.webContents.on('did-navigate', (navEvent, url) => {
      appendLog('Navigate', `did-navigate: ${url}`);
      console.log(`[Window Navigate] did-navigate to: ${url}`);
    });

    // Log window load failures
    win.webContents.on('did-fail-load', (failEvent, errorCode, errorDescription, validatedURL) => {
      const errorMsg = `did-fail-load: code ${errorCode} (${errorDescription}) URL: ${validatedURL}`;
      appendLog('Navigate ERROR', errorMsg);
      console.error(`[Window Navigate ERROR] ${errorMsg}`);
    });
  });
}

module.exports = {
  installDevToolsHooks,
};
