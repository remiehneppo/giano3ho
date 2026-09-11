'use strict';

/**
 * Zalo PC - Main Bootstrap Entry Point
 * Handles platform compatibility initialization and delegates execution
 * to either the compact app or main application process.
 */

// 1. Initialize Linux compatibility layer when running on Linux
if (process.platform === 'linux') {
  const { initLinuxCompat } = require('./linux-compat');
  initLinuxCompat({
    enableLogger: true,
    enableDevTools: true,
  });
}

/**
 * Loads and delegates to the Compact App entry point.
 */
const handleEntryCompactApp = () => {
  return require('./main-dist/compact-app');
};

/**
 * Core application bootstrap routine.
 * Records startup performance milestones and dispatches to the appropriate bundle.
 */
function bootstrap() {
  const { app } = require('electron');

  // Performance tracing setup
  require('./libs/perf-tracing/runtime');
  if (typeof perf !== 'undefined' && perf.record) {
    perf.record(perf.STARTUP);
  }

  // Database and schema migration
  require('./main-dist/migration');
  if (typeof perf !== 'undefined' && perf.record) {
    perf.record(perf.MIGRATION_DONE);
  }

  const isCompactApp = process.argv.some((arg) => arg.startsWith('--launch-compact-app'));

  // Ensure single instance lock across processes
  const hasInstanceLock = app.requestSingleInstanceLock();

  if (isCompactApp) {
    if (hasInstanceLock) {
      return handleEntryCompactApp();
    }
    return require('./main-dist/second-instance');
  }

  if (hasInstanceLock) {
    if (typeof perf !== 'undefined' && perf.record) {
      perf.record(perf.MAIN_SCRIPT);
    }
    return require('./main-dist/main');
  }

  return require('./main-dist/second-instance');
}

bootstrap();
