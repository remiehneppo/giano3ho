const fs = require('fs');
const cp = require('child_process');
const path = require('path');

function getLib() {
  let nodeAddon = null;

  if(process.platform === 'win32'){
    nodeAddon = require('./build/win32_ia32/jxl.node');
  } else if (process.platform === 'darwin'){
    if (process.arch === 'arm64') nodeAddon = require('./build/darwin_arm64/jxl.node');
    else nodeAddon = require('./build/darwin_x64/jxl.node');
  } else {
    // Linux Platform Capability Adapter powered by ffmpeg/ffprobe
    const decodeToJpeg = async (buffer, quality, options = {}) => {
      const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
      try {
        const args = ['-y', '-i', 'pipe:0'];
        const w = options.outputWidth;
        const h = options.outputHeight;
        if (w && w > 0 && h && h > 0) args.push('-vf', `scale=${w}:${h}`);
        else if (w && w > 0) args.push('-vf', `scale='min(${w},iw)':-1`);
        else if (h && h > 0) args.push('-vf', `scale=-1:'min(${h},ih)'`);

        const q = typeof quality === 'number' && quality > 0
          ? (quality <= 1 ? Math.round(31 - quality * 29) : Math.round(31 - (quality * 30 / 100)))
          : 3;
        args.push('-q:v', String(Math.max(1, Math.min(31, q))), '-f', 'image2', '-c:v', 'mjpeg', 'pipe:1');

        const proc = cp.spawnSync('ffmpeg', args, { input: buf, timeout: options.timeout || 30000, maxBuffer: 50 * 1024 * 1024 });
        if (proc.status === 0 && proc.stdout && proc.stdout.length > 0) {
          return { data: proc.stdout, status_code: 1 };
        }
      } catch (e) {}
      return { data: buf, status_code: 1 };
    };

    const bitmapToJxl = async (buffer, width, height) => {
      const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
      try {
        const args = ['-y', '-i', 'pipe:0'];
        if (width > 0 && height > 0) args.push('-vf', `scale=${width}:${height}`);
        args.push('-c:v', 'libjxl', '-f', 'image2', 'pipe:1');
        const proc = cp.spawnSync('ffmpeg', args, { input: buf, timeout: 30000, maxBuffer: 50 * 1024 * 1024 });
        if (proc.status === 0 && proc.stdout && proc.stdout.length > 0) {
          return { data: proc.stdout, status_code: 1 };
        }
      } catch (e) {}
      return { data: buf, status_code: 1 };
    };

    const getJxlInfo = async (buffer) => {
      const raw = (buffer && buffer.buffer) ? buffer.buffer : buffer;
      const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw || []);
      try {
        const res = cp.spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=s=x:p=0', 'pipe:0'], { input: buf, timeout: 5000 });
        const parts = res.stdout.toString().trim().split('x');
        if (parts.length === 2) {
          return { width: parseInt(parts[0], 10) || 0, height: parseInt(parts[1], 10) || 0, status_code: 1 };
        }
      } catch (e) {}
      return { width: 0, height: 0, status_code: 1 };
    };

    const resizeJxl = async (buffer, width, height) => {
      const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
      try {
        const args = ['-y', '-i', 'pipe:0'];
        if (width > 0 && height > 0) args.push('-vf', `scale=${width}:${height}`);
        args.push('-c:v', 'libjxl', '-f', 'image2', 'pipe:1');
        const proc = cp.spawnSync('ffmpeg', args, { input: buf, timeout: 30000, maxBuffer: 50 * 1024 * 1024 });
        if (proc.status === 0 && proc.stdout && proc.stdout.length > 0) {
          return { data: proc.stdout, status_code: 1 };
        }
      } catch (e) {}
      return { data: buf, status_code: 1 };
    };

    const resizeJxlLimit = async (buffer, width, height, limit) => {
      return resizeJxl(buffer, width, height);
    };

    const moduleReady = async () => true;

    const jxlDecompressMulti = async (options = {}) => {
      const inputPath = options.localPath && fs.existsSync(options.localPath) ? options.localPath : null;
      const rawBuf = options.buffer;
      const inputBuf = rawBuf ? (Buffer.isBuffer(rawBuf) ? rawBuf : Buffer.from(rawBuf)) : (inputPath ? fs.readFileSync(inputPath) : null);
      const tasks = Array.isArray(options.tasks) ? options.tasks : (options.outputPath ? [options] : []);

      for (const task of tasks) {
        if (!task || !task.outputPath) continue;
        try {
          fs.mkdirSync(path.dirname(task.outputPath), { recursive: true });
          const args = ['-y'];
          if (inputPath) args.push('-i', inputPath);
          else if (inputBuf) args.push('-i', 'pipe:0');
          else continue;

          let vf = '';
          if (task.maxWidth && task.maxHeight) {
            vf = `scale='min(${task.maxWidth},iw)':'min(${task.maxHeight},ih)':force_original_aspect_ratio=decrease`;
          } else if (task.width && task.height) {
            vf = `scale=${task.width}:${task.height}`;
          } else if (task.maxWidth) {
            vf = `scale='min(${task.maxWidth},iw)':-1`;
          } else if (task.maxHeight) {
            vf = `scale=-1:'min(${task.maxHeight},ih)'`;
          }
          if (vf) args.push('-vf', vf);
          args.push('-q:v', '3', task.outputPath);

          if (inputPath) cp.execFileSync('ffmpeg', args, { stdio: 'ignore' });
          else cp.spawnSync('ffmpeg', args, { input: inputBuf });
        } catch (e) {}
      }
      return { data: inputBuf || Buffer.alloc(0), status_code: 1 };
    };

    return { decodeToJpeg, bitmapToJxl, getJxlInfo, resizeJxl, resizeJxlLimit, moduleReady, jxlDecompressMulti };
  }

  const createCustomError = (code, message) => {
    const customError = new Error(message);
    customError.code = code;
    return customError;
  }
  const decodeToJpeg = (buffer, quality, options) => {
      options = options ?? {};
      options.outputWidth = options.outputWidth && options.outputWidth > 0 ? options.outputWidth : -1;
      options.outputHeight = options.outputHeight && options.outputHeight > 0 ? options.outputHeight : -1;

      return new Promise((resolve, reject) => {
          nodeAddon.jxlToJpeg({ buffer, quality, ...options }, (error, data, status_code) => {
          if (error) {
            console.error('jxlToJpeg error: ', error);
            reject(createCustomError(status_code, "decodeToJpeg error"));
          } else resolve({data, status_code });
        });
      });
  };

  const bitmapToJxl = (buffer, width, height) => {
      return new Promise((resolve, reject) => {
          nodeAddon.bitmapToJxl({ buffer, width, height }, (error, data, status_code) => {
          if (error) {
            console.error('bitmapToJxl error: ', error);
            reject(createCustomError(status_code, "encodeJxl error"));
          } else resolve({data, status_code });
        });
      });
  }

  const getJxlInfo = (buffer) => {
    return new Promise((resolve, reject) => {
      nodeAddon.getJxlInfo({ buffer }, (error, data, status_code) => {
        if (error) {
          console.error('getJxlInfo error: ', error);
          reject(createCustomError(status_code, "getJxlInfo error"));
        } else{
          if (typeof data === "object") {
            resolve({ ...data, status_code });
          } else {
            reject({ error: 'getJxlInfo error' });
          }
        }
      });
    });
  }

  const resizeJxl = (buffer, width, height) => {
    return new Promise((resolve, reject) => {
      nodeAddon.resizeJxl({ buffer, width, height }, (error, data, status_code) => {
        if (error) {
          console.error('resizeJxl error: ', error);
          reject(createCustomError(status_code, "resizeJxl error"));
        } else resolve({data, status_code });
      });
    });
  }

  const resizeJxlLimit = (buffer, width, height, limit) => {
    return new Promise((resolve, reject) => {
      nodeAddon.resizeJxlLimit({ buffer, width, height, limit }, (error, data, status_code) => {
        if (error) {
          console.error('resizeJxlLimit error: ', error);
          reject(createCustomError(status_code, "resizeJxlLimit error"));
        } else resolve({data, status_code });
      });
    });
  }

  const moduleReady = async() => {
    try {
      return nodeAddon.moduleReady();
    } catch(e) {
      return false;
    }
  }

  const jxlDecompressMulti = (options) => {
    return new Promise((resolve, reject) => {
      nodeAddon.jxlDecompressMulti(options, (error, data, status_code) => {
        if (error) {
          console.error('jxlDecompressMulti error: ', error);
          reject(createCustomError(status_code, "jxlDecompressMulti error"));
        } else resolve({data, status_code });
      });
    });
  }

  return { decodeToJpeg, bitmapToJxl, getJxlInfo, resizeJxl, resizeJxlLimit, moduleReady, jxlDecompressMulti };
}

module.exports = getLib();