'use strict';

const assert = require('assert');
const path = require('path');
const nativelibs = require('../../app-extracted/native/nativelibs');

async function runTests() {
  console.log('--- Starting nativelibs Contract Tests ---');

  // 1. Test zfile
  console.log('Testing zfile contract...');
  const zfile = nativelibs.zfile();
  assert(typeof zfile === 'object', 'zfile must be an object');
  assert(typeof zfile.canReadAndWrite === 'function', 'canReadAndWrite must be a function');
  assert(typeof zfile.canRead === 'function', 'canRead must be a function');
  assert(typeof zfile.canWrite === 'function', 'canWrite must be a function');
  assert(typeof zfile.diskInfo === 'function', 'diskInfo must be a function');
  assert(typeof zfile.stat === 'function', 'stat must be a function');
  assert(typeof zfile.statFolder === 'function', 'statFolder must be a function');
  assert(typeof zfile.copyFolder === 'function', 'copyFolder must be a function');
  assert(typeof zfile.cancelCopy === 'function', 'cancelCopy must be a function');

  assert.strictEqual(zfile.canReadAndWrite('/tmp'), true, '/tmp must be readable and writable');
  assert.strictEqual(zfile.canReadAndWrite('/non_existent_folder_abcxyz'), false, 'Non-existent path must return false');

  const diskInfo = await zfile.diskInfo();
  assert(diskInfo && typeof diskInfo === 'object', 'diskInfo must return an object');
  assert(diskInfo['/'] && typeof diskInfo['/'] === 'object', "diskInfo['/'] must exist");
  assert(diskInfo['/'].totalSpace > 0, 'totalSpace must be > 0');
  assert(diskInfo['/'].usedSpace >= 0, 'usedSpace must be >= 0');
  assert.strictEqual(diskInfo['/'].isExternal, false, 'Root drive should not be external');

  // Test proxy fallback for Windows drive queries
  assert(diskInfo['C:'] && diskInfo['C:'].totalSpace > 0, "diskInfo['C:'] must resolve safely");
  assert(diskInfo['C:\\'] && diskInfo['C:\\'].totalSpace > 0, "diskInfo['C:\\'] must resolve safely");
  assert(diskInfo['Z:\\'] && diskInfo['Z:\\'].totalSpace > 0, "Arbitrary drive query must resolve safely via Proxy");
  assert.strictEqual(diskInfo.then, undefined, 'diskInfo.then must be undefined to avoid pseudo-thenable classification');
  assert.strictEqual(diskInfo.toJSON, undefined, 'diskInfo.toJSON must be undefined');

  // Test copyFolder rejection and callback
  await assert.rejects(
    async () => {
      await zfile.copyFolder('/non_existent_source_path_xyz', '/tmp/dest_test_error');
    },
    'copyFolder without callback must reject Promise on error'
  );

  let cbCalled = false;
  await zfile.copyFolder('/non_existent_source_path_xyz', '/tmp/dest_test_error', (err) => {
    cbCalled = true;
    assert(err, 'Callback should receive error');
  });
  assert.strictEqual(cbCalled, true, 'copyFolder callback must be invoked on error');

  const statRes = await zfile.stat('/tmp');
  assert.strictEqual(statRes.exists, true, 'stat on /tmp must report exists: true');
  assert.strictEqual(statRes.isDirectory, true, 'stat on /tmp must report isDirectory: true');

  // 2. Test fileUtils
  console.log('Testing fileUtils contract...');
  const fileUtils = nativelibs.fileUtils();
  assert(typeof fileUtils === 'object', 'fileUtils must be an object');
  assert(typeof fileUtils.getDiskUsage === 'function', 'getDiskUsage must be a function');

  const diskUsage = fileUtils.getDiskUsage('/');
  assert(typeof diskUsage === 'object', 'getDiskUsage must return an object');
  assert(typeof diskUsage.total === 'number' && diskUsage.total > 0, 'diskUsage.total must be > 0');
  assert(typeof diskUsage.free === 'number' && diskUsage.free > 0, 'diskUsage.free must be > 0');

  // 3. Test fileUtilities
  console.log('Testing fileUtilities contract...');
  const fileUtilities = nativelibs.fileUtilities();
  assert(typeof fileUtilities === 'object', 'fileUtilities must be an object');

  const fsSync = fileUtilities.detectFilesystemSync('/tmp');
  assert(fsSync && typeof fsSync === 'object', 'detectFilesystemSync must return an object');
  assert(typeof fsSync.filesystemType === 'string', 'filesystemType must be a string');
  assert.strictEqual(fsSync.filesystemType.toLocaleLowerCase(), 'ntfs', 'filesystemType must be ntfs to satisfy Zalo filterAvailableDrive check');

  const fsAsync = await fileUtilities.detectFilesystemAsync('/tmp');
  assert(fsAsync && typeof fsAsync === 'object', 'detectFilesystemAsync must return an object');
  assert.strictEqual(fsAsync.filesystemType.toLocaleLowerCase(), 'ntfs', 'filesystemType in async must be ntfs');

  const hlSync = fileUtilities.detectHardlinksSync('/tmp', '/tmp');
  assert(Array.isArray(hlSync), 'detectHardlinksSync must return an array');
  assert.strictEqual(hlSync.length, 0, 'detectHardlinksSync array should be empty');
  assert.doesNotThrow(() => hlSync.filter(x => x), 'Array.filter must work on detectHardlinksSync');

  const hlAsync = await fileUtilities.detectHardlinksAsync('/tmp', '/tmp');
  assert(Array.isArray(hlAsync), 'detectHardlinksAsync must resolve to an array');
  assert.strictEqual(hlAsync.hasHardlinks, false, 'hasHardlinks property should be accessible');
  assert.doesNotThrow(() => hlAsync.filter(x => x), 'Array.filter must work on detectHardlinksAsync');
  assert.doesNotThrow(() => hlAsync.some(x => x), 'Array.some must work on detectHardlinksAsync');

  const dirSizeSync = fileUtilities.getDirectorySizeSync('/tmp');
  assert(dirSizeSync && typeof dirSizeSync.totalSize === 'number', 'getDirectorySizeSync must return object with totalSize');
  const dirSizeAsync = await fileUtilities.getDirectorySizeAsync('/tmp');
  assert(dirSizeAsync && typeof dirSizeAsync.totalSize === 'number', 'getDirectorySizeAsync must return object with totalSize');

  // 4. Test zwalker
  console.log('Testing zwalker contract...');
  const zwalker = nativelibs.zwalker();
  assert(typeof zwalker === 'object', 'zwalker must be an object');
  assert(typeof zwalker.scanDirectory === 'function', 'scanDirectory must be a function');
  const scanRes = zwalker.scanDirectory();
  assert(Array.isArray(scanRes.files) && Array.isArray(scanRes.dirs), 'scanDirectory must return files and dirs arrays');
  assert(typeof scanRes.fileNumber === 'number' && typeof scanRes.size === 'number', 'scanDirectory must return fileNumber and size numbers');
  assert.strictEqual(typeof scanRes.trackingPath, 'string', 'scanDirectory must return trackingPath string');

  const delHomeless = zwalker.deleteHomelessFiles();
  assert(typeof delHomeless.deletedCount === 'number' && typeof delHomeless.fileNumber === 'number', 'deleteHomelessFiles must return deletedCount and fileNumber');

  const statUnmarked = zwalker.statUnmarkedFiles();
  assert(Array.isArray(statUnmarked.files) && typeof statUnmarked.fileNumber === 'number', 'statUnmarkedFiles must return files array and fileNumber');
  assert.strictEqual(typeof statUnmarked.trackingPath, 'string', 'statUnmarkedFiles must return trackingPath string');

  const delEmpty = zwalker.deleteEmptyFolders();
  assert(typeof delEmpty.deletedCount === 'number' && Array.isArray(delEmpty.deletedDirs), 'deleteEmptyFolders must return deletedCount and deletedDirs');

  // 5. Test winUtils
  console.log('Testing winUtils contract...');
  const winUtils = nativelibs.winUtils();
  assert(typeof winUtils === 'object', 'winUtils must be an object');
  assert('qlWin' in winUtils, 'winUtils must define qlWin property');
  assert.strictEqual(winUtils.qlWin, null, 'winUtils.qlWin should be null on Linux');

  // 6. Test dbUtils
  console.log('Testing dbUtils contract...');
  const dbUtils = nativelibs.dbUtils();
  assert(typeof dbUtils.getVersion === 'function', 'getVersion must be a function');
  assert.strictEqual(dbUtils.getVersion(), '4.0.0', 'dbUtils version should be 4.0.0');

  // 7. Test zimage
  console.log('Testing zimage contract...');
  const zimageInstance = await nativelibs.zimage();
  assert(zimageInstance && zimageInstance.Image, 'zimage must resolve with Image object');
  assert(typeof zimageInstance.Image.thumbnail === 'function', 'Image.thumbnail must be a function');
  assert(typeof zimageInstance.Image.resizeQA === 'function', 'Image.resizeQA must be a function');

  // 8. Test zcall
  console.log('Testing zcall contract...');
  const zcall = nativelibs.zcall();
  assert(typeof zcall === 'function' || typeof zcall === 'object', 'zcall must be callable or object');
  const zcallBinding = require('../../app-extracted/native/nativelibs/zcall/binding');
  const mainApp = new zcallBinding.MainApp();
  assert(typeof mainApp.init === 'function', 'MainApp.init must be a function');
  assert(typeof mainApp.getListDevices === 'function', 'MainApp.getListDevices must be a function');
  assert.strictEqual(mainApp.getListDevices(), '[]', 'getListDevices must return empty JSON array');

  console.log('✅ ALL NATIVELIBS CONTRACT TESTS PASSED SUCCESSFULLY!');
}

runTests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
