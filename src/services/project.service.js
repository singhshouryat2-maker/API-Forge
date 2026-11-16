const prisma = require('../lib/prisma');
const { HttpError } = require('../utils/http');
const storage = require('./storage.service');

async function listProjects(userId) {
  const projects = await prisma.project.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    include: {
      _count: { select: { generations: true } },
      generations: { orderBy: { version: 'desc' }, take: 1, select: { id: true, version: true, createdAt: true, fileCount: true } },
    },
  });
  return projects.map(({ generations, _count, ...p }) => ({ ...p, generationCount: _count.generations, latest: generations[0] || null }));
}

function validateProjectInput({ name, description }, partial = false) {
  const data = {};
  if (name !== undefined || !partial) {
    if (typeof name !== 'string' || !name.trim()) throw new HttpError(422, 'Project name is required');
    if (name.trim().length > 100) throw new HttpError(422, 'Project name must be at most 100 characters');
    data.name = name.trim();
  }
  if (description !== undefined) {
    if (description !== null && typeof description !== 'string') throw new HttpError(422, 'Description must be text');
    data.description = description ? description.slice(0, 2000) : null;
  }
  return data;
}

async function createProject(userId, input) {
  return prisma.project.create({ data: { ...validateProjectInput(input), userId } });
}

/** Loads a project and makes sure it belongs to the user (404 otherwise, to avoid leaking ids). */
async function getOwnedProject(userId, projectId) {
  const id = Number(projectId);
  if (!Number.isInteger(id)) throw new HttpError(400, 'Invalid project id');
  const project = await prisma.project.findFirst({ where: { id, userId } });
  if (!project) throw new HttpError(404, 'Project not found');
  return project;
}

async function getProjectDetail(userId, projectId) {
  const project = await getOwnedProject(userId, projectId);
  const generations = await prisma.generation.findMany({
    where: { projectId: project.id },
    orderBy: { version: 'desc' },
    select: { id: true, version: true, fileCount: true, durationMs: true, summary: true, createdAt: true },
  });
  const latest = generations[0]
    ? await prisma.generation.findUnique({ where: { id: generations[0].id }, select: { schema: true } })
    : null;
  return { ...project, generations, latestSchema: latest ? latest.schema : null };
}

async function updateProject(userId, projectId, input) {
  const project = await getOwnedProject(userId, projectId);
  return prisma.project.update({ where: { id: project.id }, data: validateProjectInput(input, true) });
}

async function deleteProject(userId, projectId) {
  const project = await getOwnedProject(userId, projectId);
  const gens = await prisma.generation.findMany({ where: { projectId: project.id }, select: { id: true } });
  await prisma.project.delete({ where: { id: project.id } });
  await Promise.all(gens.map((g) => storage.removeGeneration(g.id)));
}

module.exports = { listProjects, createProject, getOwnedProject, getProjectDetail, updateProject, deleteProject };
