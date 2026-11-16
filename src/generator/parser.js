/**
 * Parses a Prisma schema with getDMMF (from @prisma/internals) and turns the
 * raw DMMF into a normalized description that the templates can work with.
 */
const { getDMMF, getConfig } = require('@prisma/internals');
const { lowerFirst, toKebab, pluralizeKebab, humanize } = require('./naming');

const ANSI_RE = /\u001b\[[0-9;]*m/g;

class SchemaError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SchemaError';
    this.statusCode = 400;
  }
}

const NUMERIC = new Set(['Int', 'Float', 'Decimal', 'BigInt']);
const SENSITIVE_RE = /^(password|passwordHash|hashedPassword|passwordDigest|secret|apiSecret|refreshToken|resetToken)$/i;

function cleanPrismaError(err) {
  const raw = String((err && err.message) || err).replace(ANSI_RE, '');
  // Keep the useful "error: ..." blocks, drop the wasm/boilerplate header lines.
  const lines = raw
    .split('\n')
    .filter((l) => !/^Prisma schema validation|^Error code: P1012|get-dmmf wasm/i.test(l.trim()));
  return lines.join('\n').trim() || 'Invalid Prisma schema';
}

/** Default MySQL String length when there's no @db.* native type. */
function maxLengthFor(field, provider) {
  if (field.type !== 'String') return undefined;
  if (field.nativeType) {
    const [name, args] = field.nativeType;
    if (/^(Var)?Char$|^NVarChar$|^NChar$/i.test(name) && args && args[0] && /^\d+$/.test(args[0])) return Number(args[0]);
    return undefined; // Text, LongText, Uuid, ...
  }
  if (provider === 'mysql') return 191;
  return undefined;
}

function detectFormat(field) {
  if (field.type !== 'String') return undefined;
  const n = field.name.toLowerCase();
  if (n === 'email' || n.endsWith('email')) return 'email';
  if (/(^url$|url$|website|homepage|link$)/.test(n)) return 'url';
  if (field.isId || /uuid$/.test(n)) {
    if (field.default && field.default.name === 'uuid') return 'uuid';
  }
  return undefined;
}

function normalizeDefault(field) {
  if (!field.hasDefaultValue) return null;
  const d = field.default;
  if (d && typeof d === 'object' && !Array.isArray(d) && 'name' in d) {
    return { kind: 'function', name: d.name, args: d.args || [] };
  }
  return { kind: 'value', value: d };
}

async function parseSchema(schemaText) {
  if (typeof schemaText !== 'string' || !schemaText.trim()) {
    throw new SchemaError('Schema is empty. Paste a Prisma schema containing at least one model.');
  }
  if (schemaText.length > 500_000) throw new SchemaError('Schema is too large (max 500 KB).');

  let dmmf;
  try {
    dmmf = await getDMMF({ datamodel: schemaText });
  } catch (err) {
    throw new SchemaError(cleanPrismaError(err));
  }

  let provider = null;
  let datasourceUrlEnv = null;
  let hasDatasource = /^\s*datasource\s+\w+\s*\{/m.test(schemaText);
  if (hasDatasource) {
    try {
      const config = await getConfig({ datamodel: schemaText, ignoreEnvVarErrors: true });
      const ds = config.datasources && config.datasources[0];
      if (ds) {
        provider = ds.activeProvider || ds.provider;
        datasourceUrlEnv = ds.url && ds.url.fromEnvVar ? ds.url.fromEnvVar : null;
      }
    } catch (err) {
      throw new SchemaError(cleanPrismaError(err));
    }
  }

  const enums = {};
  for (const e of dmmf.datamodel.enums) enums[e.name] = e.values.map((v) => v.name);

  const warnings = [];
  const allModels = dmmf.datamodel.models.map((m) => normalizeModel(m, enums, provider || 'sqlite'));

  const models = [];
  for (const m of allModels) {
    if (!m.idField) {
      warnings.push(
        `Model "${m.name}" has no single-field @id (composite or missing primary key), so no CRUD routes were generated for it.`
      );
      continue;
    }
    models.push(m);
  }
  if (allModels.length === 0) throw new SchemaError('No models found. Add at least one `model` block to your schema.');
  if (models.length === 0) throw new SchemaError('None of your models has a single-field @id, so there is nothing to generate.');

  // Route-path collisions (e.g. "Datum" and "Data")
  const seen = new Map();
  for (const m of models) {
    if (seen.has(m.route)) {
      const other = seen.get(m.route);
      m.route = `${m.kebab}-records`;
      warnings.push(`Route for "${m.name}" collided with "${other}"; using /${m.route}.`);
    }
    seen.set(m.route, m.name);
  }

  const supported = new Set(models.map((m) => m.name));
  for (const m of models) {
    for (const r of m.relationFields) r.targetSupported = supported.has(r.type);
  }

  return {
    provider: provider || 'sqlite',
    hasDatasource,
    datasourceUrlEnv: datasourceUrlEnv || 'DATABASE_URL',
    enums,
    models,
    allModels,
    warnings,
  };
}

function normalizeModel(m, enums, provider) {
  const fkNames = new Set();
  for (const f of m.fields) {
    if (f.kind === 'object' && f.relationFromFields) f.relationFromFields.forEach((n) => fkNames.add(n));
  }

  const fields = m.fields.map((f) => {
    const def = normalizeDefault(f);
    return {
      name: f.name,
      type: f.type,
      kind: f.kind, // scalar | enum | object | unsupported
      isList: f.isList,
      isRequired: f.isRequired,
      isUnique: f.isUnique,
      isId: f.isId,
      isUpdatedAt: !!f.isUpdatedAt,
      hasDefault: f.hasDefaultValue,
      default: def,
      nativeType: f.nativeType || null,
      isForeignKey: fkNames.has(f.name),
      enumValues: f.kind === 'enum' ? enums[f.type] || [] : undefined,
      maxLength: maxLengthFor(f, provider),
      format: detectFormat(f),
      isSensitive: SENSITIVE_RE.test(f.name),
      relationName: f.relationName || null,
      relationFromFields: f.relationFromFields || [],
      relationToFields: f.relationToFields || [],
      relationOnDelete: f.relationOnDelete || null,
    };
  });

  const scalarFields = fields.filter((f) => f.kind === 'scalar' || f.kind === 'enum');
  const relationFields = fields.filter((f) => f.kind === 'object');
  const idField = m.primaryKey ? null : scalarFields.find((f) => f.isId) || null;

  // Fields a client may send in a request body
  const writableFields = scalarFields.filter((f) => {
    if (f.isId && f.hasDefault) return false;
    if (f.isUpdatedAt) return false;
    if (f.type === 'Bytes') return false;
    if (f.default && f.default.kind === 'function' && f.default.name === 'now' && /^created/i.test(f.name)) return false;
    return true;
  });

  const filterableFields = scalarFields.filter((f) => !f.isList && !['Json', 'Bytes'].includes(f.type) && !f.isSensitive);
  const sortableFields = filterableFields.map((f) => f.name);

  const kebab = toKebab(m.name);
  return {
    name: m.name,
    camel: lowerFirst(m.name),
    delegate: lowerFirst(m.name),
    kebab,
    route: pluralizeKebab(kebab),
    label: humanize(m.name),
    labelPlural: humanize(pluralizeKebab(kebab).replace(/-/g, '_')),
    idField,
    fields,
    scalarFields,
    relationFields,
    writableFields,
    filterableFields,
    sortableFields,
    sensitiveFields: scalarFields.filter((f) => f.isSensitive).map((f) => f.name),
    uniqueIndexes: (m.uniqueIndexes || []).map((u) => u.fields),
    hasNumeric: scalarFields.some((f) => NUMERIC.has(f.type)),
  };
}

module.exports = { parseSchema, SchemaError, cleanPrismaError };
