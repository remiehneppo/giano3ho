'use strict';

/**
 * @module config-init
 * @description Ensures necessary Linux configuration directories and metadata files
 * exist before Zalo processes attempt to read them.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const APP_VERSION = '26.7.10';

// Metadata files required by Zalo processes to avoid "Failed to parse meta" errors
const REQUIRED_META_FILES = [
  'main.meta',
  'preload-sqlite.meta',
  'shared-worker.meta',
  'render.meta',
];

function initLinuxConfig() {
  const homeDir = os.homedir();
  const zaloDataDir = path.join(homeDir, '.config', 'ZaloData');
  const calDir = path.join(zaloDataDir, 'cal');

  try {
    fs.mkdirSync(calDir, { recursive: true });
  } catch (err) {
    // Directory already exists or cannot be created
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
      } catch (err) {
        // Silently continue if write fails
      }
    }
  }
}

module.exports = {
  initLinuxConfig,
  REQUIRED_META_FILES,
};
