const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { HttpError } = require('../utils/http');
const { generateProject } = require('../generator');
const storage = require('./storage.service');
const diff = require('./diff.service');
const projectService = require('./project.service');
const preview = require('../preview/previewManager');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/**
 * Runs the generator, stores the result as a new Generation (version N+1),
 * writes the files to disk and computes what changed vs. the previous version.
 */
async function createGeneration(userId, projectId, schema) {
  const project = await projectService.getOwnedProject(userId, projectId);
  const result = await generateProject(schema, { projectName: project.name });
  const files = result.files.map((f) => ({ ...f, hash: sha256(f.content) }));

  const previous = await prisma.generation.findFirst({
    where: { projectId: project.id },
    orderBy: { version: 'desc' },
    include: { files: { select: { path: true, content: true, hash: true } } },
  });

  const changes = previous ? diff.summarize(previous.files, files) : null;
  const summary = {
    models: result.models,
    endpoints: result.endpoints,
    warnings: result.warnings,
    provider: result.provider,
    slug: result.slug,
    previewMeta: result.previewMeta,
    changes,
    previousVersion: previous ? previous.version : null,
  };

  const generation = await prisma.$transaction(async (tx) => {
    const gen = await tx.generation.create({
      data: {
        projectId: project.id,
        version: previous ? previous.version + 1 : 1,
        schema,
        fileCount: files.length,
        durationMs: result.durationMs,
        summary,
      },
    });
    await tx.generatedFile.createMany({
      data: files.map((f) => ({ generationId: gen.id, path: f.path, content: f.content, hash: f.hash })),
    });
    await tx.project.update({ where: { id: project.id }, data: { updatedAt: new Date() } });
    return gen;
  });

  await storage.writeGenerationFiles(generation.id, files);

  return { ...generation, files: files.map(({ path, content }) => ({ path, content })) };
}

async function getOwnedGeneration(userId, generationId, { withFiles = false } = {}) {
  const id = Number(generationId);
  if (!Number.isInteger(id)) throw new HttpError(400, 'Invalid generation id');
  const gen = await prisma.generation.findFirst({
    where: { id, project: { userId } },
    include: { project: { select: { id: true, name: true } }, ...(withFiles ? { files: { orderBy: { path: 'asc' } } } : {}) },
  });
  if (!gen) throw new HttpError(404, 'Generation not found');
  return gen;
}

async function getGeneration(userId, generationId) {
  const gen = await getOwnedGeneration(userId, generationId, { withFiles: true });
  return {
    ...gen,
    files: gen.files.map((f) => ({ path: f.path, content: f.content })),
  };
}

/** Diff of `generationId` against `againstId` (defaults to the previous version). */
async function getDiff(userId, generationId, againstId) {
  const gen = await getOwnedGeneration(userId, generationId, { withFiles: true });
  let base;
  if (againstId) {
    base = await getOwnedGeneration(userId, againstId, { withFiles: true });
    if (base.projectId !== gen.projectId) throw new HttpError(400, 'Generations belong to different projects');
  } else {
    base = await prisma.generation.findFirst({
      where: { projectId: gen.projectId, version: { lt: gen.version } },
      orderBy: { version: 'desc' },
      include: { files: true },
    });
  }
  const baseFiles = base ? base.files : [];
  return {
    from: base ? { id: base.id, version: base.version } : null,
    to: { id: gen.id, version: gen.version },
    summary: diff.summarize(baseFiles, gen.files),
    files: diff.fileDiffs(baseFiles, gen.files),
  };
}

/** Makes sure files are on disk (they may have been cleaned up), then streams the ZIP. */
async function downloadZip(userId, generationId, res) {
  const gen = await getOwnedGeneration(userId, generationId, { withFiles: true });
  if (!(await storage.existsOnDisk(gen.id))) await storage.writeGenerationFiles(gen.id, gen.files);
  const folder = `${(gen.summary && gen.summary.slug) || 'generated-api'}-v${gen.version}`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${folder}.zip"`);
  await storage.streamZip(gen.id, folder, res);
}

async function startPreview(userId, generationId) {
  const gen = await getOwnedGeneration(userId, generationId, { withFiles: true });
  const meta = gen.summary && gen.summary.previewMeta;
  if (!meta) throw new HttpError(400, 'This generation has no preview data; regenerate it.');
  const p = await preview.startPreview({ generationId: gen.id, userId, files: gen.files, meta });
  return {
    token: p.token,
    baseUrl: `/preview/${p.token}`,
    expiresAt: new Date(p.expiresAt).toISOString(),
    seeded: p.seeded,
    endpoints: gen.summary.endpoints,
  };
}

async function stopPreview(userId, token) {
  const p = preview.getPreview(token);
  if (!p || p.userId !== userId) throw new HttpError(404, 'Preview not found');
  await preview.stopPreview(token);
}

module.exports = { createGeneration, getGeneration, getDiff, downloadZip, startPreview, stopPreview };
