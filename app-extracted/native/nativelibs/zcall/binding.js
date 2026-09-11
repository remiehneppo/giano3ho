function getLib(){
    if(process.platform === 'win32'){
        if(process.arch === 'x64') return require('./zcall_x64.node');
        return require('./zcall_ia32.node');
    }else if(process.platform === 'darwin'){
    	return require('./zcall_mac.node');
    }else{
        return {
            MainApp: function() {
                return {
                    init: function() {},
                    setCallback: function() {},
                    makeCall: function() {},
                    stop: function() {},
                    getEventMessage: function() { return null; },
                    getVideoFrame: function() { return null; },
                    getVideoFrameLocal: function() { return null; },
                    getActiveAudioCodecs: function() { return ''; },
                    holdAudio: function() {},
                    mute: function() {},
                    stopCapture: function() {},
                    getCallInfo: function() { return ''; },
                    getJsonStats406: function() { return ''; },
                    changeAudioDevice: function() {},
                    setAudioVolume: function() { return 0; },
                    changeVideoDevice: function() {},
                    setAgc: function() {},
                    startDesktopCapture: function() {},
                    stopDesktopCapture: function() {},
                    changeMinMaxMobileBitrate: function() {},
                    getExtendData: function() { return ''; },
                    getListDevices: function() { return '[]'; },
                    check: function() { return 0; },
                    incomingCall: function() {},
                    setConfigData: function() { return Promise.resolve(); },
                    updateCallerInfo: function() {},
                };
            },
            error: 'not support'
        };
    }
}
module.exports = getLib();