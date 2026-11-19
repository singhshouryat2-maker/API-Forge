const { Router } = require('express');
const c = require('../controllers');
const { requireAuth } = require('../middleware/auth');

const router = Router();

// Auth
router.post('/auth/register', c.register);
router.post('/auth/login', c.login);
router.get('/auth/me', requireAuth, c.me);

// Schema check (no account needed)
router.post('/schema/validate', c.validateSchema);

// Everything below requires a JWT
router.use(requireAuth);

router.route('/projects').get(c.listProjects).post(c.createProject);
router.route('/projects/:projectId').get(c.getProject).patch(c.updateProject).delete(c.deleteProject);
router.post('/projects/:projectId/generations', c.createGeneration);

router.get('/generations/:generationId', c.getGeneration);
router.get('/generations/:generationId/diff', c.getDiff);
router.get('/generations/:generationId/download', c.download);
router.post('/generations/:generationId/preview', c.startPreview);
router.delete('/previews/:token', c.stopPreview);

module.exports = router;
