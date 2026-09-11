'use strict';

/**
 * @module logger
 * @description Provides file-backed debug logging and console interception for Zalo Linux.
 */

const fs = require('fs');
const path = require('path');

let debugLogFilePath = null;
let isInitialized = false;

function resolveLogPath() {
  if (process.env.ZALO_DEBUG_LOG) {
    return process.env.ZALO_DEBUG_LOG;
  }
  // Default to zalo-debug.log in the project root (one level above app-extracted)
  return path.resolve(__dirname, '..', '..', 'zalo-debug.log');
}

function appendLog(prefix, message) {
  if (!debugLogFilePath) return;

  const timestamp = new Date().toISOString();
  let text = message;
  if (typeof text === 'object' && text !== null) {
    try {
      text = JSON.stringify(text);
    } catch (e) {
      text = String(text);
    }
  }

  try {
    fs.appendFileSync(debugLogFilePath, `[${timestamp}] [${prefix}] ${text}\n`);
  } catch (err) {
    // Ignore file write errors to prevent cascading failures
  }
}

function installLogger(options = {}) {
  if (isInitialized) return;
  isInitialized = true;

  debugLogFilePath = options.logPath || resolveLogPath();

  // Append session start header (rotate if > 5MB)
  try {
    if (fs.existsSync(debugLogFilePath)) {
      const stats = fs.statSync(debugLogFilePath);
      if (stats.size > 5 * 1024 * 1024) {
        fs.unlinkSync(debugLogFilePath);
      }
    }
    const sessionHeader = `\n=== Zalo Linux Session Started ${new Date().toISOString()} ===\n`;
    fs.appendFileSync(debugLogFilePath, sessionHeader, 'utf8');
  } catch (err) {
    // Cannot write log file, disable file logging
    debugLogFilePath = null;
    return;
  }

  // Intercept standard console output to mirror to debug log
  const originalLog = console.log;
  console.log = function(...args) {
    appendLog('Main LOG', args.join(' '));
    originalLog.apply(console, args);
  };

  const originalError = console.error;
  console.error = function(...args) {
    appendLog('Main ERROR', args.join(' '));
    originalError.apply(console, args);
  };

  const originalWarn = console.warn;
  console.warn = function(...args) {
    appendLog('Main WARN', args.join(' '));
    originalWarn.apply(console, args);
  };
}

module.exports = {
  installLogger,
  appendLog,
  getLogPath: () => debugLogFilePath,
};
