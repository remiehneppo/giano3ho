'use strict';

function getLib() {
    if (process.platform === 'win32') {
        try {
            if (process.arch === 'x64') return require('./x64/win-utils.node');
            return require('./ia32/win-utils.node');
        } catch (e) {}
    }
    return {
        qlWin: null,
        error: 'not support',
    };
}

module.exports = getLib();
