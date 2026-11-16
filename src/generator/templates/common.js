/**
 * Templates for files that are the same shape in every generated project
 * (utilities, middleware, bootstrap). Model-specific files live in model.js.
 */

const appError = () => `/**
 * An error we throw on purpose. The central error handler turns it into a
 * JSON response with the given HTTP status code.
 */
class AppError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
  }
}

module.exports = AppError;
`;

const asyncHandler = () => `/**
 * Wraps an async route handler so rejected promises reach next(err)
 * (and therefore the central error handler) instead of crashing the app.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
`;

const pagination = () => `const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

/**
 * Reads ?page= and ?limit= from the query string.
 * Returns the values Prisma needs (skip/take) plus the page info.
 */
function getPagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit, 10) || DEFAULT_LIMIT));
  return { page, limit, skip: (page - 1) * limit };
}

function buildMeta(total, page, limit) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

module.exports = { getPagination, buildMeta, DEFAULT_LIMIT, MAX_LIMIT };
`;

const queryBuilder = () => `const AppError = require('./AppError');

/*
 * Turns query-string parameters into a Prisma "where" object.
 *
 *   ?name=ali            String  -> contains "ali"
 *   ?age=30              Number  -> equals 30
 *   ?age_gte=18&age_lt=65        -> range filters (gt, gte, lt, lte)
 *   ?createdAt_gte=2024-01-01    -> works for dates too
 *   ?isActive=true       Boolean
 *   ?role=ADMIN,EDITOR   Enum    -> "in" list
 */
const RESERVED = new Set(['page', 'limit', 'sort', 'order', 'include']);
const RANGE_OPS = ['gte', 'lte', 'gt', 'lt'];
const NUMBER_TYPES = new Set(['Int', 'Float', 'Decimal', 'BigInt']);

function parseValue(field, type, raw) {
  const value = Array.isArray(raw) ? raw[raw.length - 1] : raw;
  switch (type) {
    case 'Int': {
      if (!/^-?\\d+$/.test(value)) throw new AppError(400, \`Filter "\${field}" must be an integer\`);
      return parseInt(value, 10);
    }
    case 'BigInt': {
      if (!/^-?\\d+$/.test(value)) throw new AppError(400, \`Filter "\${field}" must be an integer\`);
      return BigInt(value);
    }
    case 'Float':
    case 'Decimal': {
      const n = Number(value);
      if (value === '' || Number.isNaN(n)) throw new AppError(400, \`Filter "\${field}" must be a number\`);
      return n;
    }
    case 'Boolean': {
      if (value !== 'true' && value !== 'false') throw new AppError(400, \`Filter "\${field}" must be true or false\`);
      return value === 'true';
    }
    case 'DateTime': {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) throw new AppError(400, \`Filter "\${field}" must be a valid date\`);
      return d;
    }
    default:
      return String(value);
  }
}

/**
 * @param {object} query           req.query
 * @param {object} filterableFields { fieldName: 'String' | 'Int' | ... | 'Enum' }
 */
function buildWhere(query, filterableFields) {
  const where = {};

  for (const [key, raw] of Object.entries(query)) {
    if (RESERVED.has(key) || raw === undefined || raw === '') continue;

    let field = key;
    let op = null;
    const match = key.match(/^(.+)_(gte|lte|gt|lt)$/);
    if (match && filterableFields[match[1]]) {
      field = match[1];
      op = match[2];
    }

    const type = filterableFields[field];
    if (!type) continue; // ignore unknown query params

    if (op) {
      if (!NUMBER_TYPES.has(type) && type !== 'DateTime') {
        throw new AppError(400, \`Range filter "\${key}" only works on numbers and dates\`);
      }
      where[field] = { ...(where[field] || {}), [op]: parseValue(key, type, raw) };
      continue;
    }

    if (type === 'String') {
      where[field] = { contains: parseValue(field, type, raw) };
    } else if (type === 'Enum') {
      const values = String(raw).split(',').map((v) => v.trim()).filter(Boolean);
      where[field] = values.length > 1 ? { in: values } : values[0];
    } else {
      where[field] = parseValue(field, type, raw);
    }
  }

  return where;
}

/**
 * ?sort=createdAt&order=desc   or   ?sort=-createdAt
 */
function buildOrderBy(query, sortableFields, defaultField) {
  let sort = typeof query.sort === 'string' ? query.sort : defaultField;
  let order = String(query.order || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';

  if (sort.startsWith('-')) {
    sort = sort.slice(1);
    order = 'desc';
  }
  if (!sortableFields.includes(sort)) {
    throw new AppError(400, \`Cannot sort by "\${sort}". Allowed: \${sortableFields.join(', ')}\`);
  }
  return { [sort]: order };
}

/**
 * ?include=posts,profile  ->  { posts: true, profile: true }
 */
function buildInclude(query, relationFields) {
  if (!query.include) return undefined;
  const include = {};
  for (const name of String(query.include).split(',').map((s) => s.trim()).filter(Boolean)) {
    if (!relationFields.includes(name)) {
      throw new AppError(400, \`Cannot include "\${name}". Allowed: \${relationFields.join(', ') || 'none'}\`);
    }
    include[name] = true;
  }
  return include;
}

module.exports = { buildWhere, buildOrderBy, buildInclude };
`;

const validateMiddleware = () => `const AppError = require('../utils/AppError');

/*
 * A tiny, dependency-free validation middleware.
 *
 * Each model has a schema in src/validators that describes its fields:
 *   { email: { type: 'string', format: 'email', required: true, maxLength: 191 } }
 *
 * validate(schema)                    -> used for POST / PUT (required fields enforced)
 * validate(schema, { partial: true }) -> used for PATCH (only validates what was sent)
 *
 * On success req.body is replaced with a cleaned copy (correct types, no unknown keys).
 */

const EMAIL_RE = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
const URL_RE = /^https?:\\/\\/[^\\s/$.?#].[^\\s]*$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INT_RE = /^-?\\d+$/;
const DECIMAL_RE = /^-?\\d+(\\.\\d+)?$/;

const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;

function checkValue(field, value, rule) {
  switch (rule.type) {
    case 'string': {
      if (typeof value !== 'string') return { error: \`\${field} must be a string\` };
      if (rule.required && value.trim() === '') return { error: \`\${field} cannot be empty\` };
      if (rule.maxLength && value.length > rule.maxLength) {
        return { error: \`\${field} must be at most \${rule.maxLength} characters\` };
      }
      if (rule.format === 'email' && !EMAIL_RE.test(value)) return { error: \`\${field} must be a valid email address\` };
      if (rule.format === 'url' && !URL_RE.test(value)) return { error: \`\${field} must be a valid URL (http/https)\` };
      if (rule.format === 'uuid' && !UUID_RE.test(value)) return { error: \`\${field} must be a valid UUID\` };
      return { value: rule.format === 'email' ? value.trim().toLowerCase() : value };
    }
    case 'int': {
      const n = typeof value === 'string' && INT_RE.test(value) ? Number(value) : value;
      if (!Number.isInteger(n)) return { error: \`\${field} must be an integer\` };
      if (n < INT32_MIN || n > INT32_MAX) return { error: \`\${field} is out of range for a 32-bit integer\` };
      return { value: n };
    }
    case 'bigint': {
      if (typeof value === 'number' && Number.isInteger(value)) return { value: BigInt(value) };
      if (typeof value === 'string' && INT_RE.test(value)) return { value: BigInt(value) };
      return { error: \`\${field} must be an integer\` };
    }
    case 'float': {
      const n = typeof value === 'string' && DECIMAL_RE.test(value) ? Number(value) : value;
      if (typeof n !== 'number' || !Number.isFinite(n)) return { error: \`\${field} must be a number\` };
      return { value: n };
    }
    case 'decimal': {
      if (typeof value === 'number' && Number.isFinite(value)) return { value };
      if (typeof value === 'string' && DECIMAL_RE.test(value)) return { value };
      return { error: \`\${field} must be a decimal number\` };
    }
    case 'boolean': {
      if (typeof value !== 'boolean') return { error: \`\${field} must be true or false\` };
      return { value };
    }
    case 'datetime': {
      if (typeof value !== 'string' && typeof value !== 'number') return { error: \`\${field} must be an ISO date string\` };
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return { error: \`\${field} must be a valid date (e.g. 2024-01-31T10:00:00Z)\` };
      return { value: d };
    }
    case 'enum': {
      if (!rule.values.includes(value)) return { error: \`\${field} must be one of: \${rule.values.join(', ')}\` };
      return { value };
    }
    case 'json':
      return { value };
    default:
      return { value };
  }
}

function validate(schema, { partial = false } = {}) {
  return (req, res, next) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return next(new AppError(400, 'Request body must be a JSON object'));
    }

    const errors = [];
    const data = {};

    for (const [field, rule] of Object.entries(schema)) {
      const value = body[field];

      if (value === undefined) {
        if (rule.required && !partial) errors.push({ field, message: \`\${field} is required\` });
        continue;
      }
      if (value === null) {
        if (rule.nullable) data[field] = null;
        else errors.push({ field, message: \`\${field} cannot be null\` });
        continue;
      }

      if (rule.list) {
        if (!Array.isArray(value)) {
          errors.push({ field, message: \`\${field} must be an array\` });
          continue;
        }
        const items = [];
        value.forEach((item, i) => {
          const r = checkValue(\`\${field}[\${i}]\`, item, { ...rule, required: false });
          if (r.error) errors.push({ field, message: r.error });
          else items.push(r.value);
        });
        data[field] = items;
        continue;
      }

      const result = checkValue(field, value, rule);
      if (result.error) errors.push({ field, message: result.error });
      else data[field] = result.value;
    }

    const unknown = Object.keys(body).filter((key) => !(key in schema));
    for (const key of unknown) {
      errors.push({ field: key, message: \`\${key} is not an allowed field\` });
    }

    if (partial && errors.length === 0 && Object.keys(data).length === 0) {
      errors.push({ field: null, message: 'Provide at least one field to update' });
    }

    if (errors.length > 0) {
      return next(new AppError(422, 'Validation failed', errors));
    }

    req.body = data;
    next();
  };
}

module.exports = validate;
`;

const errorHandler = () => `const AppError = require('../utils/AppError');
const config = require('../config');

/*
 * Central error handler. Every error passed to next(err) ends up here and is
 * turned into a consistent JSON shape:
 *
 *   { "success": false, "error": { "message": "...", "details": [...] } }
 */

// Prisma error codes: https://www.prisma.io/docs/orm/reference/error-reference
// MySQL reports constraint names like "User_email_key" / "Post_authorId_fkey (index)";
// turn those into plain field names.
function fieldsFrom(meta) {
  const raw = meta && (meta.target || meta.field_name);
  if (!raw) return null;
  if (Array.isArray(raw)) return raw.join(', ');
  return String(raw)
    .replace(/\\s*\\(index\\)$/, '')
    .replace(/^[A-Za-z0-9]+_/, '')
    .replace(/_(key|fkey)$/, '');
}

function fromPrismaError(err) {
  const field = fieldsFrom(err.meta);
  switch (err.code) {
    case 'P2002':
      return new AppError(409, \`A record with this \${field || 'value'} already exists\`, field ? [{ field, message: 'must be unique' }] : undefined);
    case 'P2025':
      return new AppError(404, (err.meta && err.meta.cause) || 'Record not found');
    case 'P2003':
      return new AppError(
        400,
        'Related record does not exist, or this record is still referenced by other records',
        field ? [{ field, message: 'foreign key constraint failed' }] : undefined
      );
    case 'P2000':
      return new AppError(400, 'A value is too long for its column', field ? [{ field, message: 'too long' }] : undefined);
    case 'P2014':
      return new AppError(400, 'This change would violate a required relation');
    default:
      return null;
  }
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let error = err;

  if (!(error instanceof AppError)) {
    if (err.type === 'entity.parse.failed') {
      error = new AppError(400, 'Malformed JSON in request body');
    } else if (err.type === 'entity.too.large') {
      error = new AppError(413, 'Request body is too large');
    } else if (typeof err.code === 'string' && /^P\\d{4}$/.test(err.code)) {
      error = fromPrismaError(err) || new AppError(500, 'Database error');
    } else if (err.name === 'PrismaClientValidationError') {
      error = new AppError(400, 'Invalid data for this query');
    } else {
      error = new AppError(500, 'Internal server error');
    }
  }

  if (error.statusCode >= 500) console.error(err);

  const body = { success: false, error: { message: error.message } };
  if (error.details) body.error.details = error.details;
  if (config.env === 'development' && error.statusCode >= 500) body.error.stack = err.stack;

  res.status(error.statusCode).json(body);
}

module.exports = errorHandler;
`;

const notFound = () => `const AppError = require('../utils/AppError');

/** Runs when no route matched. */
function notFound(req, res, next) {
  next(new AppError(404, \`Route \${req.method} \${req.originalUrl} not found\`));
}

module.exports = notFound;
`;

const cors = () => `/**
 * Minimal CORS middleware so browser front-ends can call this API.
 * Set CORS_ORIGIN in .env to restrict it (defaults to "*").
 */
function cors(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

module.exports = cors;
`;

const requestLogger = () => `/** Logs "METHOD /path STATUS - 12ms" for every request. */
function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(\`\${req.method} \${req.originalUrl} \${res.statusCode} - \${ms.toFixed(1)}ms\`);
  });
  next();
}

module.exports = requestLogger;
`;

const prismaClient = () => `const { PrismaClient } = require('@prisma/client');

// One shared PrismaClient for the whole app (each instance opens its own connection pool).
const prisma = new PrismaClient();

module.exports = prisma;
`;

const config = () => `require('dotenv').config();

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  logRequests: process.env.LOG_REQUESTS !== 'false',
};
`;

const server = () => `const app = require('./app');
const config = require('./config');
const prisma = require('./lib/prisma');

const server = app.listen(config.port, () => {
  console.log(\`API running at http://localhost:\${config.port}/api/v1 (\${config.env})\`);
});

// Close the HTTP server and DB connections cleanly on Ctrl+C / container stop.
async function shutdown(signal) {
  console.log(\`\\n\${signal} received, shutting down...\`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
`;

const routesIndex = () => `const { Router } = require('express');
const v1Routes = require('./v1');

const router = Router();

// Versioned API: add ./v2 here later without breaking existing clients.
router.use('/v1', v1Routes);

module.exports = router;
`;

const gitignore = () => `node_modules
.env
*.db
*.db-journal
`;

module.exports = {
  appError,
  asyncHandler,
  pagination,
  queryBuilder,
  validateMiddleware,
  errorHandler,
  notFound,
  cors,
  requestLogger,
  prismaClient,
  config,
  server,
  routesIndex,
  gitignore,
};
