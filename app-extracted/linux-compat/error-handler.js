'use strict';

/**
 * @module error-handler
 * @description Catches unhandled promise rejections gracefully so non-critical
 * Windows-only features do not crash the application on Linux.
 */

const { appendLog } = require('./logger');

function installErrorHandler() {
  process.on('unhandledRejection', (reason) => {
    const errorMsg = (reason && reason.message) ? reason.message : String(reason);
    const logLine = `Suppressed unhandled rejection: ${errorMsg}`;
    appendLog('UnhandledRejection', logLine);
    console.warn(`[Zalo Linux] ${logLine}`);
  });
}

module.exports = {
  installErrorHandler,
};
