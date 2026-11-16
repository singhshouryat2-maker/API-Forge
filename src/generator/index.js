/**
 * APIForge code generator: Prisma schema text -> list of { path, content } files.
 */
const { getDMMF } = require('@prisma/internals');
const { parseSchema, cleanPrismaError } = require('./parser');
const { slugify } = require('./naming');
const common = require('./templates/common');
const tpl = require('./templates/model');
const extras = require('./templates/extras');

const DEFAULT_PORT = 3000;

async function generateProject(schemaText, { projectName = 'Generated API' } = {}) {
  const started = Date.now();
  const parsed = await parseSchema(schemaText);
  const { models } = parsed;
  const slug = slugify(projectName);
  const port = DEFAULT_PORT;

  const normalizedSchema = extras.normalizeSchema(schemaText, parsed);
  if (!parsed.hasDatasource) {
    parsed.warnings.push('No datasource block found, so a SQLite datasource was added (works without a DB server).');
    try {
      await getDMMF({ datamodel: normalizedSchema });
    } catch (err) {
      parsed.warnings.push(`Schema may not be valid for SQLite: ${cleanPrismaError(err).split('\n')[0]}`);
    }
  }
  if (/^\s*generator\s+\w+\s*\{/m.test(schemaText) && !/provider\s*=\s*"prisma-client-js"\s*\n\s*\}/m.test(schemaText)) {
    parsed.warnings.push('Your generator block was replaced with the standard "prisma-client-js" generator.');
  }

  const files = [];
  const add = (path, content) => files.push({ path, content });

  // Bootstrap
  add('src/server.js', common.server());
  add('src/app.js', tpl.app(projectName, models));
  add('src/config/index.js', common.config());
  add('src/lib/prisma.js', common.prismaClient());

  // Routing
  add('src/routes/index.js', common.routesIndex());
  add('src/routes/v1/index.js', tpl.v1Index(models));

  // Per-model MVC
  for (const m of models) {
    add(`src/routes/v1/${m.camel}.routes.js`, tpl.routes(m));
    add(`src/controllers/${m.camel}.controller.js`, tpl.controller(m));
    add(`src/services/${m.camel}.service.js`, tpl.service(m));
    add(`src/validators/${m.camel}.validator.js`, tpl.validator(m));
  }

  // Middleware + utils
  add('src/middleware/validate.js', common.validateMiddleware());
  add('src/middleware/errorHandler.js', common.errorHandler());
  add('src/middleware/notFound.js', common.notFound());
  add('src/middleware/cors.js', common.cors());
  add('src/middleware/requestLogger.js', common.requestLogger());
  add('src/utils/AppError.js', common.appError());
  add('src/utils/asyncHandler.js', common.asyncHandler());
  add('src/utils/pagination.js', common.pagination());
  add('src/utils/queryBuilder.js', common.queryBuilder());

  // Prisma
  add('prisma/schema.prisma', normalizedSchema);
  add('prisma/seed.js', extras.seed(models, parsed.provider));

  // Project files
  add('package.json', extras.packageJson(slug, projectName));
  add('.env.example', extras.envFile(parsed.provider, parsed.datasourceUrlEnv, slug, port));
  add('.env', extras.envFile(parsed.provider, parsed.datasourceUrlEnv, slug, port));
  add('.gitignore', common.gitignore());
  add('postman_collection.json', extras.postman(projectName, models, port));
  add('README.md', extras.readme(projectName, parsed, files, port));

  files.sort((a, b) => a.path.localeCompare(b.path));

  return {
    files,
    slug,
    provider: parsed.provider,
    warnings: parsed.warnings,
    models: models.map((m) => ({
      name: m.name,
      route: m.route,
      fields: m.scalarFields.length,
      relations: m.relationFields.map((r) => r.name),
    })),
    endpoints: buildEndpoints(models),
    previewMeta: buildPreviewMeta(models),
    durationMs: Date.now() - started,
  };
}

function buildEndpoints(models) {
  const out = [];
  for (const m of models) {
    const base = `/api/v1/${m.route}`;
    const body = extras.sampleBody(m);
    const patch = Object.fromEntries(Object.entries(body).slice(0, 1));
    out.push(
      { model: m.name, method: 'GET', path: base, query: 'page=1&limit=5', summary: `List ${m.labelPlural.toLowerCase()}` },
      { model: m.name, method: 'POST', path: base, body, summary: `Create ${m.label.toLowerCase()}` },
      { model: m.name, method: 'GET', path: `${base}/:id`, summary: `Get ${m.label.toLowerCase()}` },
      { model: m.name, method: 'PUT', path: `${base}/:id`, body, summary: `Replace ${m.label.toLowerCase()}` },
      { model: m.name, method: 'PATCH', path: `${base}/:id`, body: patch, summary: `Update ${m.label.toLowerCase()}` },
      { model: m.name, method: 'DELETE', path: `${base}/:id`, summary: `Delete ${m.label.toLowerCase()}` }
    );
  }
  return out;
}

/** Just enough model metadata for the in-memory Prisma used by live preview */
function buildPreviewMeta(models) {
  const meta = {};
  for (const m of models) {
    meta[m.name] = {
      delegate: m.delegate,
      idField: m.idField.name,
      uniqueIndexes: m.uniqueIndexes,
      fields: m.fields.map((f) => ({
        name: f.name,
        type: f.type,
        kind: f.kind,
        isList: f.isList,
        isRequired: f.isRequired,
        isUnique: f.isUnique,
        isId: f.isId,
        isUpdatedAt: f.isUpdatedAt,
        default: f.default,
        maxLength: f.maxLength,
        relationName: f.relationName,
        relationFromFields: f.relationFromFields,
        relationToFields: f.relationToFields,
        relationOnDelete: f.relationOnDelete,
      })),
    };
  }
  return meta;
}

module.exports = { generateProject };
