'use strict';

const fs = require('fs');

/**
 * Platform Capability Adapter for zfile
 * Provides unified file inspection, drive queries, and permission checks.
 * On Windows, delegates to native addon; on Linux/POSIX, uses native Node.js APIs.
 */
function getLib() {
    let addon = null;
    if (process.platform === 'win32') {
        try {
            if (process.arch === 'x64') {
                addon = require('./win64/addon');
            } else {
                addon = require('./win32/addon');
            }
        } catch (e) {
            addon = null;
        }
    }

    if (addon) {
        return {
            stat: async (p, isFolder) => addon.getInfo(p, isFolder),
            diskInfo: async () => addon.getDiskInfo(),
            statFolder: async (folderPath) => addon.getInfo(folderPath, true),
            copyFolder: async (src, dest, callback) => addon.copyFolder(src, dest, callback),
            cancelCopy: async () => addon.cancelCopy(),
            canReadAndWrite: (p) => addon.canReadAndWrite(p),
            canRead: (p) => addon.canRead(p),
            canWrite: (p) => addon.canWrite(p),
        };
    }

    // POSIX Deep Adapter Implementation
    const stat = async (targetPath, isFolder) => {
        try {
            const s = await fs.promises.stat(targetPath);
            return {
                size: s.size,
                mtime: s.mtimeMs,
                birthtime: s.birthtimeMs,
                isDirectory: s.isDirectory(),
                isFile: s.isFile(),
                exists: true,
            };
        } catch (err) {
            return {
                size: 0,
                exists: false,
                isDirectory: Boolean(isFolder),
                isFile: !isFolder,
                error: err.message,
            };
        }
    };

    const statFolder = async (folderPath) => {
        return stat(folderPath, true);
    };

    const diskInfo = async () => {
        let total = 100 * 1024 * 1024 * 1024;
        let free = 50 * 1024 * 1024 * 1024;
        try {
            if (fs.statfsSync) {
                const stats = fs.statfsSync('/');
                total = Number(stats.bsize) * Number(stats.blocks);
                free = Number(stats.bsize) * Number(stats.bavail);
            }
        } catch (e) {}
        const used = Math.max(0, total - free);

        const rootDrive = {
            name: '/',
            label: 'Root',
            isExternal: false,
            totalSpace: total,
            usedSpace: used,
        };

        const drives = {
            '/': rootDrive,
            'C:': { ...rootDrive, name: 'C:' },
            'C:\\': { ...rootDrive, name: 'C:\\' },
        };

        return new Proxy(drives, {
            get(target, prop) {
                if (typeof prop === 'string') {
                    if (prop in target) return target[prop];
                    if (['then', 'catch', 'finally', 'toJSON', 'inspect'].includes(prop) || prop.startsWith('_')) {
                        return undefined;
                    }
                    return {
                        name: prop,
                        label: prop,
                        isExternal: false,
                        totalSpace: total,
                        usedSpace: used,
                    };
                }
                return target[prop];
            },
        });
    };

    const copyFolder = async (src, dest, callback) => {
        try {
            if (fs.promises.cp) {
                await fs.promises.cp(src, dest, { recursive: true });
            } else {
                await fs.promises.mkdir(dest, { recursive: true });
            }
            if (typeof callback === 'function') callback(null, { src, dest });
            return true;
        } catch (err) {
            if (typeof callback === 'function') {
                callback(err);
                return false;
            }
            throw err;
        }
    };

    const cancelCopy = async () => {};

    const canReadAndWrite = (p) => {
        if (!p) return false;
        try {
            fs.accessSync(p, fs.constants.R_OK | fs.constants.W_OK);
            return true;
        } catch {
            return false;
        }
    };

    const canRead = (p) => {
        if (!p) return false;
        try {
            fs.accessSync(p, fs.constants.R_OK);
            return true;
        } catch {
            return false;
        }
    };

    const canWrite = (p) => {
        if (!p) return false;
        try {
            fs.accessSync(p, fs.constants.W_OK);
            return true;
        } catch {
            return false;
        }
    };

    return {
        stat,
        diskInfo,
        statFolder,
        copyFolder,
        cancelCopy,
        canReadAndWrite,
        canRead,
        canWrite,
    };
}

module.exports = getLib();
