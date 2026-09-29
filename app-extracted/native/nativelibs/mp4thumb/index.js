
const fs = require('fs');
const cp = require('child_process');
const path = require('path');

let CachedModule = {};

function getLib() {
    let thumbModule = null;
    try {
        if (process.platform === 'win32') {
            thumbModule = require(`./win32/${process.arch}/mp4thumb.node`);
        } else if (process.platform === 'darwin') {
            if (process.arch === 'arm64') {
                thumbModule = require('./darwin-arm64/mp4thumb.node');
            } else {
                thumbModule = require('./darwin-x64/mp4thumb.node');
            }
        }
    } catch (e) {
        thumbModule = null;
    }

    if (!thumbModule) {
        thumbModule = {
            MP4Thumb: function MP4Thumb() {
                let currentProc = null;
                return {
                    generateThumbnailAsync: async (inputPath, outputPath, maxWidth, maxHeight) => {
                        if (!inputPath || typeof inputPath !== 'string' || !fs.existsSync(inputPath)) {
                            return false;
                        }
                        if (!outputPath || typeof outputPath !== 'string') {
                            return false;
                        }

                        return new Promise((resolve) => {
                            try {
                                fs.mkdirSync(path.dirname(outputPath), { recursive: true });
                            } catch (e) {}

                            const args = ['-y', '-i', inputPath, '-ss', '00:00:00', '-vframes', '1'];
                            if (maxWidth && maxHeight) {
                                args.push('-vf', `scale='min(${maxWidth},iw)':'min(${maxHeight},ih)':force_original_aspect_ratio=decrease`);
                            } else if (maxWidth) {
                                args.push('-vf', `scale='min(${maxWidth},iw)':-1`);
                            } else if (maxHeight) {
                                args.push('-vf', `scale=-1:'min(${maxHeight},ih)'`);
                            }
                            args.push('-q:v', '3', outputPath);

                            try {
                                currentProc = cp.execFile('ffmpeg', args, (err) => {
                                    currentProc = null;
                                    if (!err && fs.existsSync(outputPath)) {
                                        resolve(true);
                                    } else {
                                        resolve(false);
                                    }
                                });
                            } catch (e) {
                                currentProc = null;
                                resolve(false);
                            }
                        });
                    },
                    generateThumbnail: (inputPath, outputPath, maxWidth, maxHeight) => {
                        if (!inputPath || typeof inputPath !== 'string' || !fs.existsSync(inputPath)) {
                            return false;
                        }
                        if (!outputPath || typeof outputPath !== 'string') {
                            return false;
                        }
                        try {
                            fs.mkdirSync(path.dirname(outputPath), { recursive: true });
                            const args = ['-y', '-i', inputPath, '-ss', '00:00:00', '-vframes', '1'];
                            if (maxWidth && maxHeight) {
                                args.push('-vf', `scale='min(${maxWidth},iw)':'min(${maxHeight},ih)':force_original_aspect_ratio=decrease`);
                            } else if (maxWidth) {
                                args.push('-vf', `scale='min(${maxWidth},iw)':-1`);
                            } else if (maxHeight) {
                                args.push('-vf', `scale=-1:'min(${maxHeight},ih)'`);
                            }
                            args.push('-q:v', '3', outputPath);
                            cp.execFileSync('ffmpeg', args, { stdio: 'ignore' });
                            return fs.existsSync(outputPath);
                        } catch (e) {
                            return false;
                        }
                    },
                    cancel: () => {
                        if (currentProc) {
                            try {
                                currentProc.kill('SIGKILL');
                            } catch (e) {}
                            currentProc = null;
                        }
                    }
                };
            }
        };
    }

    /**
    * Generate a thumbnail from a video file path
    * @param {string} inputPath - Path to the input video file
    * @param {string} outputPath - Path where the thumbnail should be saved
    * @param {number} [maxWidth] - Optional max width for this specific thumbnail
    * @param {number} [maxHeight] - Optional max height for this specific thumbnail
    * @param {string} mediaId - Media ID
    * @returns {Promise<boolean>} - True if successful
    */
    const generateThumbnail = async (inputPath, outputPath, maxWidth, maxHeight, mediaId) => {
        return new Promise((resolve, reject) => {
            const thumb = new thumbModule.MP4Thumb();
            if (mediaId != null) {
                CachedModule[mediaId] = thumb;
            }
            const done = () => {
                if (mediaId != null) {
                    delete CachedModule[mediaId];
                }
            };
            try {
                if (typeof thumb.generateThumbnailAsync === 'function') {
                    thumb.generateThumbnailAsync(inputPath, outputPath, maxWidth, maxHeight)
                        .then((ok) => { done(); resolve(ok); })
                        .catch((err) => { done(); reject(err); });
                } else {
                    const ok = thumb.generateThumbnail(inputPath, outputPath, maxWidth, maxHeight);
                    done();
                    resolve(ok);
                }
            } catch (error) {
                done();
                reject(new Error(`Failed to generate thumbnail: ${error.message}`));
            }
        });
    }

    const cancel = (mediaId) => {
        const thumb = CachedModule[mediaId];
        if (thumb) {
            thumb.cancel();
            delete CachedModule[mediaId];
        }
    }

    return {
        generateThumbnail,
        cancel
    };
}

module.exports = getLib();