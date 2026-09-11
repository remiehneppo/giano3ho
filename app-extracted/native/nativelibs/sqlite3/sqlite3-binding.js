'use strict';

/**
 * Platform-specific SQLite3 native addon loader.
 * Loads the prebuilt napi-v6 binary for the current platform/arch.
 * Falls back to an in-memory mock stub if the binary fails to load.
 */

const path = require('path');
const { EventEmitter } = require('events');
const util = require('util');

const binaryName = `node_sqlite3.node`;
const platformFolder = `napi-v6-${process.platform}-${process.arch}`;
const binaryPath = `./binding/${platformFolder}/${binaryName}`;

let binding;

try {
  binding = require(binaryPath);
} catch (loadErr) {
  console.warn(
    `[sqlite3-binding] Native sqlite3 not available at "${binaryPath}", using fallback stub:`,
    loadErr.message
  );

  function StubDatabase() {
    EventEmitter.call(this);
  }
  util.inherits(StubDatabase, EventEmitter);

  StubDatabase.prototype.run = function(sql, params, cb) {
    if (typeof params === 'function') cb = params;
    if (cb) cb(new Error('sqlite3 not available on this platform'));
    return this;
  };

  StubDatabase.prototype.get = function(sql, params, cb) {
    if (typeof params === 'function') cb = params;
    if (cb) cb(new Error('sqlite3 not available on this platform'));
    return this;
  };

  StubDatabase.prototype.all = function(sql, params, cb) {
    if (typeof params === 'function') cb = params;
    if (cb) cb(new Error('sqlite3 not available on this platform'), []);
    return this;
  };

  StubDatabase.prototype.each = function(sql, params, cb, done) {
    if (typeof params === 'function') {
      done = cb;
      cb = params;
    }
    if (done) done(null, 0);
    return this;
  };

  StubDatabase.prototype.exec = function(sql, cb) {
    if (cb) cb(new Error('sqlite3 not available on this platform'));
    return this;
  };

  StubDatabase.prototype.close = function(cb) {
    if (cb) cb();
    return this;
  };

  StubDatabase.prototype.prepare = function() {
    return this;
  };

  StubDatabase.prototype.serialize = function(cb) {
    if (cb) cb();
  };

  StubDatabase.prototype.parallelize = function(cb) {
    if (cb) cb();
  };

  binding = {
    Database: StubDatabase,
    Statement: function() {},
    OPEN_READONLY: 1,
    OPEN_READWRITE: 2,
    OPEN_CREATE: 4,
  };
}

module.exports = binding;
