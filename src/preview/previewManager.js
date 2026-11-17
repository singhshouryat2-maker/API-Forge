/**
 * Live preview: writes a generated project to storage/previews/<token>,
 * swaps its Prisma client for an in-memory one, requires its Express app
 * and mounts it at /preview/<token>. Previews expire automatically.
 *
 * Files live under the APIForge folder so `require('express')` inside the
 * generated code resolves to APIForge's own node_modules.
 */
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const { createMockPrisma } = require('./mockPrisma');

const PREVIEW_ROOT = path.join(config.storageDir, 'previews');
const REGISTRY_KEY = '__APIFORGE_PREVIEWS__';
global[REGISTRY_KEY] = global[REGISTRY_KEY] || {};

const previews = new Map(); // token -> preview
const MAX_PREVIEWS = 20;

const PREVIEW_FILES = /^(src\/|prisma\/seed\.js$)/;

async function startPreview({ generationId, userId, files, meta }) {
  // One live preview per user keeps memory bounded
  for (const p of previews.values()) if (p.userId === userId) await stopPreview(p.token);
  if (previews.size >= MAX_PREVIEWS) {
    const oldest = [...previews.values()].sort((a, b) => a.startedAt - b.startedAt)[0];
    await stopPreview(oldest.token);
  }

  const token = crypto.randomBytes(12).toString('hex');
  const dir = path.join(PREVIEW_ROOT, token);

  for (const file of files) {
    if (!PREVIEW_FILES.test(file.path)) continue;
    const target = path.join(dir, file.path);
    if (!target.startsWith(dir + path.sep)) continue;
    await fs.mkdir(path.dirname(target), { recursive: true });
    let content = file.content;
    if (file.path === 'src/lib/prisma.js') {
      content = `// APIForge live preview: in-memory database instead of PrismaClient\nmodule.exports = global[${JSON.stringify(REGISTRY_KEY)}][${JSON.stringify(token)}].prisma;\n`;
    }
    if (file.path === 'src/config/index.js') {
      content = `module.exports = { env: 'development', port: 0, logRequests: false };\n`;
    }
    await fs.writeFile(target, content);
  }

  const prisma = createMockPrisma(meta);
  const logs = [];
  global[REGISTRY_KEY][token] = { prisma };

  let app;
  let seeded = {};
  try {
    app = require(path.join(dir, 'src/app.js'));
    const { seed } = require(path.join(dir, 'prisma/seed.js'));
    const created = await seed(prisma, { count: 5, log: (msg) => logs.push(msg) });
    seeded = Object.fromEntries(Object.entries(created).map(([k, v]) => [k, v.length]));
  } catch (err) {
    await cleanup(token, dir);
    const e = new Error(`Preview failed to start: ${err.message}`);
    e.statusCode = 500;
    throw e;
  }

  const ttlMs = config.previewTtlMinutes * 60 * 1000;
  const preview = {
    token,
    dir,
    app,
    prisma,
    userId,
    generationId,
    startedAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
    seeded,
    logs,
    timer: setTimeout(() => stopPreview(token).catch(() => {}), ttlMs),
  };
  preview.timer.unref();
  previews.set(token, preview);
  return preview;
}

async function cleanup(token, dir) {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(dir + path.sep)) delete require.cache[key];
  }
  delete global[REGISTRY_KEY][token];
  await fs.rm(dir, { recursive: true, force: true });
}

async function stopPreview(token) {
  const p = previews.get(token);
  if (!p) return false;
  clearTimeout(p.timer);
  previews.delete(token);
  await cleanup(token, p.dir);
  return true;
}

function getPreview(token) {
  const p = previews.get(token);
  if (!p) return null;
  if (Date.now() > p.expiresAt) {
    stopPreview(token).catch(() => {});
    return null;
  }
  return p;
}

/** Express middleware mounted at /preview/:token */
function previewHandler(req, res, next) {
  const p = getPreview(req.params.token);
  if (!p) {
    return res.status(404).json({ success: false, error: { message: 'Preview not found or expired. Start a new one from APIForge.' } });
  }
  p.app(req, res, next);
}

async function stopAll() {
  await Promise.all([...previews.keys()].map(stopPreview));
  await fs.rm(PREVIEW_ROOT, { recursive: true, force: true });
}

module.exports = { startPreview, stopPreview, getPreview, previewHandler, stopAll };
