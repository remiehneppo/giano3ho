'use strict';

/**
 * @module path-patcher
 * @description Intercepts Node's Module._resolveFilename to translate Windows-style
 * backslashes in require() paths to standard Unix forward slashes on Linux.
 */

const Module = require('module');

function installPathPatcher() {
  const originalResolveFilename = Module._resolveFilename;

  Module._resolveFilename = function(request, parent, isMain, options) {
    if (typeof request === 'string' && request.includes('\\')) {
      request = request.replace(/\\/g, '/');
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };
}

module.exports = {
  installPathPatcher,
};
