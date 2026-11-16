/**
 * Templates for per-model files: validator, service, controller, routes.
 */

const TYPE_MAP = {
  String: 'string',
  Int: 'int',
  BigInt: 'bigint',
  Float: 'float',
  Decimal: 'decimal',
  Boolean: 'boolean',
  DateTime: 'datetime',
  Json: 'json',
};

const q = (s) => JSON.stringify(s);
const ident = (s) => (/^[A-Za-z_$][\w$]*$/.test(s) ? s : q(s));

/** Validation rule for one field, used by validate.js in the generated app */
function ruleFor(field) {
  const rule = { type: field.kind === 'enum' ? 'enum' : TYPE_MAP[field.type] || 'json' };
  if (field.kind === 'enum') rule.values = field.enumValues;
  rule.required = field.isRequired && !field.hasDefault && !field.isList;
  if (!field.isRequired) rule.nullable = true;
  if (field.isList) rule.list = true;
  if (field.format) rule.format = field.format;
  if (field.maxLength) rule.maxLength = field.maxLength;
  return rule;
}

function renderRule(rule) {
  const parts = Object.entries(rule).map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.map(q).join(', ')}]` : typeof v === 'string' ? `'${v}'` : v}`);
  return `{ ${parts.join(', ')} }`;
}

function validator(model) {
  const lines = model.writableFields.map((f) => `  ${ident(f.name)}: ${renderRule(ruleFor(f))},`);
  const notes = [];
  const fks = model.writableFields.filter((f) => f.isForeignKey).map((f) => f.name);
  if (fks.length) notes.push(` * Foreign keys (${fks.join(', ')}) must reference existing records.`);
  const readOnly = model.scalarFields.filter((f) => !model.writableFields.includes(f)).map((f) => f.name);
  if (readOnly.length) notes.push(` * Read-only (set by the database): ${readOnly.join(', ')}.`);

  return `/**
 * Validation rules for ${model.name}, derived from the Prisma schema field types.
 * Used by src/middleware/validate.js.
${notes.join('\n')}${notes.length ? '\n' : ''} */
const ${model.camel}Schema = {
${lines.join('\n')}
};

module.exports = { ${model.camel}Schema };
`;
}

function filterType(f) {
  return f.kind === 'enum' ? 'Enum' : f.type;
}

function service(model) {
  const d = model.delegate;
  const id = model.idField;
  const filterable = model.filterableFields.map((f) => `  ${ident(f.name)}: '${filterType(f)}',`).join('\n');
  const sortable = model.sortableFields.map(q).join(', ');
  const relations = model.relationFields.filter((r) => r.targetSupported !== false).map((r) => q(r.name)).join(', ');
  const hasOmit = model.sensitiveFields.length > 0;
  const omitLine = hasOmit
    ? `\n// Sensitive fields are never returned in API responses.\nconst OMIT = { ${model.sensitiveFields.map((f) => `${ident(f)}: true`).join(', ')} };\n`
    : '';
  const omit = hasOmit ? ', omit: OMIT' : '';

  return `const prisma = require('../lib/prisma');
const { buildWhere, buildOrderBy, buildInclude } = require('../utils/queryBuilder');
const { getPagination, buildMeta } = require('../utils/pagination');

/*
 * The service layer is the only place that talks to the database for ${model.name}.
 * Controllers call these functions; they never use Prisma directly.
 */

// Query-string filters allowed on GET /${model.route}
const FILTERABLE_FIELDS = {
${filterable}
};
const SORTABLE_FIELDS = [${sortable}];
const RELATIONS = [${relations}];
const DEFAULT_SORT = ${q(id.name)};
${omitLine}
async function findAll(query) {
  const { page, limit, skip } = getPagination(query);
  const where = buildWhere(query, FILTERABLE_FIELDS);
  const orderBy = buildOrderBy(query, SORTABLE_FIELDS, DEFAULT_SORT);
  const include = buildInclude(query, RELATIONS);

  const [data, total] = await Promise.all([
    prisma.${d}.findMany({ where, orderBy, skip, take: limit, include${omit} }),
    prisma.${d}.count({ where }),
  ]);

  return { data, meta: buildMeta(total, page, limit) };
}

async function findById(id, query = {}) {
  const include = buildInclude(query, RELATIONS);
  return prisma.${d}.findUnique({ where: { ${ident(id.name)}: id }, include${omit} });
}

async function create(data) {
  return prisma.${d}.create({ data${omit} });
}

async function update(id, data) {
  // Throws Prisma error P2025 if the record doesn't exist -> 404 in errorHandler
  return prisma.${d}.update({ where: { ${ident(id.name)}: id }, data${omit} });
}

async function remove(id) {
  return prisma.${d}.delete({ where: { ${ident(id.name)}: id }${omit} });
}

module.exports = { findAll, findById, create, update, remove };
`;
}

function parseIdFn(model) {
  const t = model.idField.type;
  if (t === 'Int') {
    return `function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new AppError(400, 'id must be a positive integer');
  return id;
}`;
  }
  if (t === 'BigInt') {
    return `function parseId(raw) {
  if (!/^\\d+$/.test(raw)) throw new AppError(400, 'id must be a positive integer');
  return BigInt(raw);
}`;
  }
  return `function parseId(raw) {
  if (!raw || !raw.trim()) throw new AppError(400, 'id is required');
  return raw;
}`;
}

function controller(model) {
  const svc = `${model.camel}Service`;
  return `const ${svc} = require('../services/${model.camel}.service');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');

/*
 * Controllers translate HTTP <-> service calls: read params/body,
 * call the service, and choose the status code + JSON response.
 */

${parseIdFn(model)}

// GET /api/v1/${model.route}?page=1&limit=10&sort=${model.idField.name}&order=desc
const list = asyncHandler(async (req, res) => {
  const { data, meta } = await ${svc}.findAll(req.query);
  res.json({ success: true, data, meta });
});

// GET /api/v1/${model.route}/:id
const getById = asyncHandler(async (req, res) => {
  const record = await ${svc}.findById(parseId(req.params.id), req.query);
  if (!record) throw new AppError(404, ${q(model.label + ' not found')});
  res.json({ success: true, data: record });
});

// POST /api/v1/${model.route}
const create = asyncHandler(async (req, res) => {
  const record = await ${svc}.create(req.body);
  res.status(201).json({ success: true, data: record });
});

// PUT or PATCH /api/v1/${model.route}/:id
const update = asyncHandler(async (req, res) => {
  const record = await ${svc}.update(parseId(req.params.id), req.body);
  res.json({ success: true, data: record });
});

// DELETE /api/v1/${model.route}/:id
const remove = asyncHandler(async (req, res) => {
  await ${svc}.remove(parseId(req.params.id));
  res.status(204).end();
});

module.exports = { list, getById, create, update, remove };
`;
}

function routes(model) {
  const schema = `${model.camel}Schema`;
  return `const { Router } = require('express');
const controller = require('../../controllers/${model.camel}.controller');
const validate = require('../../middleware/validate');
const { ${schema} } = require('../../validators/${model.camel}.validator');

const router = Router();

router
  .route('/')
  .get(controller.list)
  .post(validate(${schema}), controller.create);

router
  .route('/:id')
  .get(controller.getById)
  .put(validate(${schema}), controller.update) // full update: required fields enforced
  .patch(validate(${schema}, { partial: true }), controller.update) // partial update
  .delete(controller.remove);

module.exports = router;
`;
}

function v1Index(models) {
  const lines = models.map((m) => `router.use('/${m.route}', require('./${m.camel}.routes'));`);
  return `const { Router } = require('express');

const router = Router();

${lines.join('\n')}

// GET /api/v1 -> list of available resources
router.get('/', (req, res) => {
  res.json({
    success: true,
    resources: [${models.map((m) => q('/api/v1/' + m.route)).join(', ')}],
  });
});

module.exports = router;
`;
}

function app(projectName, models) {
  return `const express = require('express');
const config = require('./config');
const routes = require('./routes');
const cors = require('./middleware/cors');
const requestLogger = require('./middleware/requestLogger');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

// JSON.stringify can't handle BigInt by default; send it as a string.
// eslint-disable-next-line no-extend-native
BigInt.prototype.toJSON = function toJSON() {
  return this.toString();
};

const app = express();

// 1. Global middleware
app.use(cors);
if (config.logRequests) app.use(requestLogger);
app.use(express.json({ limit: '1mb' }));

// 2. Routes
app.get('/', (req, res) => {
  res.json({
    name: ${q(projectName)},
    status: 'ok',
    api: '/api/v1',
    resources: [${models.map((m) => q('/api/v1/' + m.route)).join(', ')}],
  });
});
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
app.use('/api', routes);

// 3. 404 + central error handler (must be last)
app.use(notFound);
app.use(errorHandler);

module.exports = app;
`;
}

module.exports = { validator, service, controller, routes, v1Index, app, ruleFor };
