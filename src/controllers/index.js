const authService = require('../services/auth.service');
const projectService = require('../services/project.service');
const generationService = require('../services/generation.service');
const { parseSchema } = require('../generator/parser');
const { asyncHandler } = require('../utils/http');

/* ---------- auth ---------- */
exports.register = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, ...(await authService.register(req.body || {})) });
});
exports.login = asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await authService.login(req.body || {})) });
});
exports.me = asyncHandler(async (req, res) => {
  res.json({ success: true, user: await authService.me(req.user.id) });
});

/* ---------- projects ---------- */
exports.listProjects = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await projectService.listProjects(req.user.id) });
});
exports.createProject = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await projectService.createProject(req.user.id, req.body || {}) });
});
exports.getProject = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await projectService.getProjectDetail(req.user.id, req.params.projectId) });
});
exports.updateProject = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await projectService.updateProject(req.user.id, req.params.projectId, req.body || {}) });
});
exports.deleteProject = asyncHandler(async (req, res) => {
  await projectService.deleteProject(req.user.id, req.params.projectId);
  res.status(204).end();
});

/* ---------- generations ---------- */
exports.createGeneration = asyncHandler(async (req, res) => {
  const { schema } = req.body || {};
  const gen = await generationService.createGeneration(req.user.id, req.params.projectId, schema);
  res.status(201).json({ success: true, data: gen });
});
exports.getGeneration = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await generationService.getGeneration(req.user.id, req.params.generationId) });
});
exports.getDiff = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await generationService.getDiff(req.user.id, req.params.generationId, req.query.against) });
});
exports.download = asyncHandler(async (req, res) => {
  await generationService.downloadZip(req.user.id, req.params.generationId, res);
});
exports.startPreview = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await generationService.startPreview(req.user.id, req.params.generationId) });
});
exports.stopPreview = asyncHandler(async (req, res) => {
  await generationService.stopPreview(req.user.id, req.params.token);
  res.status(204).end();
});

/* ---------- schema (live validation in the editor) ---------- */
exports.validateSchema = asyncHandler(async (req, res) => {
  try {
    const parsed = await parseSchema((req.body || {}).schema);
    res.json({
      success: true,
      valid: true,
      provider: parsed.provider,
      models: parsed.models.map((m) => ({ name: m.name, route: m.route, fields: m.scalarFields.length })),
      warnings: parsed.warnings,
    });
  } catch (err) {
    if (err.name !== 'SchemaError') throw err;
    res.json({ success: true, valid: false, error: err.message });
  }
});
