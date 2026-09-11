"use strict";
// @ts-ignore
let addon;
try {
  if (process.platform === 'darwin') {
      addon = require(`../prebuilt/darwin/electron/${process.arch}/db-cross-v4-native.node`);
  }
  else if (process.platform === 'win32') {
      if (process.arch === 'x64') {
          addon = require('../prebuilt/window/electron_x86_64/db-cross-v4-native.node');
      }
      else {
          addon = require('../prebuilt/window/electron_x86/db-cross-v4-native.node');
      }
  }
  else {
      // Linux and other platforms: no prebuilt binary available
      addon = null;
  }
} catch(e) {
  console.warn('[db-cross-v4] Native binding not available:', e.message);
  addon = null;
}
if (!addon) {
  // Stub for unsupported platforms
  addon = {
    getVersion: function() { return '4.0.0'; },
    parseBinNet: function() { return null; },
    decompressAndDecryptDb: function(input, output, password) {
      return { input: input, output: output, password: password, result: 0 };
    },
    decompressAndDecryptDb_V2: function(input, output, password, onProgress) {
      if (typeof onProgress === 'function') onProgress(output);
      return { input: input, output: output, password: password, result: 0 };
    },
    open: function() { return true; },
    close: function() {},
  };
}
module.exports = addon;
