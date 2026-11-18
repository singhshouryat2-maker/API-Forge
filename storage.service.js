/**
 * fs + streams: writes generated files to disk and streams them back as a ZIP.
 */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const archiver = require('archiver');
const config = require('../config');

const GENERATIONS_DIR = path.join(config.storageDir, 'generations');

const dirFor = (generationId) => path.join(GENERATIONS_DIR, String(generationId));

function safeJoin(root, relative) {
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep)) throw new Error(`Unsafe path: ${relative}`);
  return target;
}

/** Writes each file with a write stream (content piped from a Readable). */
async function writeGenerationFiles(generationId, files) {
  const root = dirFor(generationId);
  await fsp.rm(root, { recursive: true, force: true });
  await fsp.mkdir(root, { recursive: true });
  for (const file of files) {
    const target = safeJoin(root, file.path);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await pipeline(Readable.from([file.content]), fs.createWriteStream(target, { encoding: 'utf8' }));
  }
  return root;
}

async function existsOnDisk(generationId) {
  try {
    await fsp.access(path.join(dirFor(generationId), 'package.json'));
    return true;
  } catch {
    return false;
  }
}

/**
 * Streams a ZIP of the generation folder straight into the HTTP response:
 * archiver reads files from disk and pipes compressed chunks to `res`,
 * so the whole archive never sits in memory.
 */
function streamZip(generationId, folderName, res) {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('warning', (err) => (err.code === 'ENOENT' ? console.warn(err) : reject(err)));
    archive.on('error', reject);
    res.on('close', resolve);
    archive.pipe(res);
    archive.directory(dirFor(generationId), folderName, (entry) => {
      // .env is included so `npm start` works immediately; mark scripts executable-friendly
      entry.mode = 0o644;
      return entry;
    });
    archive.finalize();
  });
}

async function removeGeneration(generationId) {
  await fsp.rm(dirFor(generationId), { recursive: true, force: true });
}

module.exports = { writeGenerationFiles, existsOnDisk, streamZip, removeGeneration, dirFor };
