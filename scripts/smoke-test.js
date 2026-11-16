/**
 * Generator smoke test (no database needed):
 *   1. generates a project from public/sample.prisma
 *   2. boots it through the live-preview pipeline (in-memory Prisma)
 *   3. hits every kind of endpoint and checks status codes
 *
 *   npm run test:generator
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://unused';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test';

const fs = require('fs');
const path = require('path');
const express = require('express');
const { generateProject } = require('../src/generator');
const preview = require('../src/preview/previewManager');

let failures = 0;
function check(label, cond, extra) {
  console.log(`${cond ? '  ✔' : '  ✘'} ${label}${!cond && extra ? ' -> ' + JSON.stringify(extra).slice(0, 300) : ''}`);
  if (!cond) failures++;
}

(async () => {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'public', 'sample.prisma'), 'utf8');
  const t = Date.now();
  const result = await generateProject(schema, { projectName: 'Blog API' });
  console.log(`Generated ${result.files.length} files in ${Date.now() - t}ms`);
  result.warnings.forEach((w) => console.log('  warning:', w));

  // Every generated JS file must at least parse
  const vm = require('vm');
  for (const f of result.files.filter((x) => x.path.endsWith('.js'))) {
    try {
      new vm.Script(f.content, { filename: f.path });
    } catch (e) {
      check(`syntax ${f.path}: ${e.message}`, false);
    }
  }
  for (const f of result.files.filter((x) => x.path.endsWith('.json'))) JSON.parse(f.content);
  check('all generated JS/JSON parses', failures === 0);

  const p = await preview.startPreview({ generationId: 0, userId: 1, files: result.files, meta: result.previewMeta });
  check('preview seeded data', Object.values(p.seeded).every((n) => n > 0), p.seeded);

  const host = express();
  host.use('/preview/:token', preview.previewHandler);
  const server = host.listen(0);
  const base = `http://localhost:${server.address().port}/preview/${p.token}/api/v1`;
  const call = async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };

  let r = await call('GET', '/users?page=1&limit=2&sort=-id');
  check('GET /users paginated', r.status === 200 && r.body.data.length === 2 && r.body.meta.total === 5, r);
  check('password omitted', r.body.data[0] && !('password' in r.body.data[0]), r.body.data[0]);

  r = await call('POST', '/users', { email: 'not-an-email', name: '' });
  check('POST /users invalid -> 422', r.status === 422 && r.body.error.details.length >= 2, r);

  r = await call('POST', '/users', { email: 'Ada@Example.com', name: 'Ada', password: 'secret123', role: 'ADMIN' });
  check('POST /users -> 201', r.status === 201 && r.body.data.email === 'ada@example.com', r);
  const userId = r.body.data && r.body.data.id;

  r = await call('POST', '/users', { email: 'ada@example.com', name: 'Ada 2', password: 'x' });
  check('duplicate email -> 409', r.status === 409, r);

  r = await call('GET', '/users?role=ADMIN');
  check('filter enum', r.status === 200 && r.body.data.every((u) => u.role === 'ADMIN'), r);

  r = await call('GET', `/users/${userId}?include=posts,profile`);
  check('GET /users/:id include', r.status === 200 && Array.isArray(r.body.data.posts), r);

  r = await call('PATCH', `/users/${userId}`, { name: 'Ada Lovelace' });
  check('PATCH /users/:id', r.status === 200 && r.body.data.name === 'Ada Lovelace', r);

  r = await call('PUT', `/users/${userId}`, { name: 'Missing fields' });
  check('PUT requires all required fields -> 422', r.status === 422, r);

  r = await call('POST', '/posts', { title: 'Hello', authorId: 9999 });
  check('bad foreign key -> 400', r.status === 400, r);

  r = await call('POST', '/posts', { title: 'Hello', authorId: userId, views: 'lots' });
  check('wrong type -> 422', r.status === 422, r);

  r = await call('POST', '/posts', { title: 'Hello world', authorId: userId, views: 10 });
  check('POST /posts -> 201', r.status === 201, r);

  r = await call('GET', '/posts?views_gte=10&title=hello');
  check('range + contains filter', r.status === 200 && r.body.data.some((x) => x.title === 'Hello world'), r);

  r = await call('DELETE', `/users/${userId}`);
  check('delete user with posts -> blocked (Restrict)', r.status === 400, r);

  r = await call('GET', '/users/abc');
  check('bad id -> 400', r.status === 400, r);

  r = await call('GET', '/users/424242');
  check('missing -> 404', r.status === 404, r);

  r = await call('GET', '/comments?limit=1');
  check('uuid model list', r.status === 200 && typeof r.body.data[0].id === 'string', r);
  r = await call('DELETE', `/comments/${r.body.data[0].id}`);
  check('DELETE -> 204', r.status === 204, r);

  r = await call('GET', '/nope');
  check('unknown route -> 404', r.status === 404, r);

  r = await call('GET', '/users?sort=password');
  check('cannot sort by sensitive field -> 400', r.status === 400, r);

  server.close();
  await preview.stopAll();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
