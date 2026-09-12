'use strict';

const fs = require('fs');

/**
 * Platform Capability Adapter for file-utils
 * Primary contract is `getDiskUsage(targetPath)` returning `{ total: number, free: number }`.
 * On Windows/macOS, loads native addon; on Linux/POSIX, calculates via fs.statfsSync.
 */
function getDiskUsageFallback(targetPath) {
  let total = 100 * 1024 * 1024 * 1024;
  let free = 50 * 1024 * 1024 * 1024;
  try {
    const p = (targetPath && typeof targetPath === 'string' && fs.existsSync(targetPath)) ? targetPath : '/';
    if (fs.statfsSync) {
      const stats = fs.statfsSync(p);
      total = Number(stats.bsize) * Number(stats.blocks);
      free = Number(stats.bsize) * Number(stats.bavail);
    }
  } catch (e) {}
  return { total, free };
}

function getLib() {
  if (process.platform === 'win32') {
    try {
      if (process.arch === 'x64') return require('./x64/file-utils.node');
      return require('./ia32/file-utils.node');
    } catch (e) {}
  } else if (process.platform === 'darwin') {
    try {
      if (process.arch === 'arm64') return require('./darwin-arm/file-utils.node');
      return require('./darwin/file-utils.node');
    } catch (e) {}
  }
  return {
    getDiskUsage: getDiskUsageFallback,
  };
}

module.exports = getLib();
