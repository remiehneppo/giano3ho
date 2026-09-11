'use strict';

/**
 * @module linux-compat
 * @description Central coordinator for Zalo PC Linux compatibility layer.
 * Applies path resolution patches, config initialization, logger, devtools hooks,
 * and error handlers.
 */

const { installPathPatcher } = require('./path-patcher');
const { initLinuxConfig } = require('./config-init');
const { installLogger } = require('./logger');
const { installDevToolsHooks } = require('./devtools');
const { installErrorHandler } = require('./error-handler');

let isInitialized = false;

/**
 * Initialize all Linux compatibility mechanisms.
 * @param {Object} [options]
 * @param {boolean} [options.enableLogger=true] - Whether to redirect logs to file
 * @param {boolean} [options.enableDevTools=true] - Whether to enable F12 DevTools shortcut
 * @param {string} [options.logPath] - Custom path for debug log
 */
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

  // 1. Path resolver patch (Windows backslash to Unix slash)
  installPathPatcher();

  // 2. Setup Linux configuration directory and placeholder meta files
  initLinuxConfig();

  // 3. Setup file-backed debug logging
  if (enableLogger) {
    installLogger({ logPath });
  }

  // 4. Register unhandled rejection error handlers
  installErrorHandler();

  // 5. Register DevTools and renderer monitoring hooks
  if (enableDevTools) {
    installDevToolsHooks();
  }
}

module.exports = {
  initLinuxCompat,
};
