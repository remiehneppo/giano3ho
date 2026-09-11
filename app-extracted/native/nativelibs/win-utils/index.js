function getLib(){
    if(process.platform === 'win32'){
        if(process.arch === 'x64') return require('./x64/win-utils.node');
        return require('./ia32/win-utils.node');     
    }else{
        return {error: 'not support'};
    }
}
module.exports = getLib();