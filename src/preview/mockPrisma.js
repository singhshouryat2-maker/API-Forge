/**
 * A small in-memory stand-in for PrismaClient, used by live preview so the
 * generated API can run inside APIForge without a real database.
 *
 * Supports the subset of the Prisma API the generated services and seed use:
 * findMany, findUnique, findFirst, count, create, update, delete, deleteMany
 * with where (equals/contains/in/gt/gte/lt/lte/not/AND/OR/NOT), orderBy,
 * skip/take, include (1 level) and omit. It also mimics Prisma's error codes
 * (P2002 unique, P2003 foreign key, P2025 not found) so the generated error
 * handler behaves exactly like it would against a real database.
 */
const crypto = require('crypto');

function prismaError(code, message, meta) {
  const err = new Error(message);
  err.name = 'PrismaClientKnownRequestError';
  err.code = code;
  err.meta = meta;
  err.clientVersion = 'apiforge-preview';
  return err;
}

function validationError(message) {
  const err = new Error(message);
  err.name = 'PrismaClientValidationError';
  return err;
}

const cuid = () => 'c' + Date.now().toString(36) + crypto.randomBytes(8).toString('hex').slice(0, 15);

function clone(v) {
  if (v === null || v === undefined) return v;
  if (v instanceof Date) return new Date(v.getTime());
  if (Buffer.isBuffer(v)) return Buffer.from(v);
  if (Array.isArray(v)) return v.map(clone);
  if (typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = clone(val);
    return out;
  }
  return v;
}

function comparable(v, type) {
  if (v === null || v === undefined) return v;
  if (v instanceof Date) return v.getTime();
  if (type === 'DateTime' && typeof v === 'string') return new Date(v).getTime();
  if (typeof v === 'bigint') return Number(v);
  if ((type === 'Decimal' || type === 'BigInt') && typeof v === 'string') return Number(v);
  return v;
}

function createMockPrisma(meta, { maxRecordsPerModel = 2000 } = {}) {
  const tables = {};
  const counters = {};
  const models = {};
  for (const [name, m] of Object.entries(meta)) {
    tables[name] = [];
    counters[name] = 0;
    models[name] = { ...m, byName: Object.fromEntries(m.fields.map((f) => [f.name, f])) };
  }

  const fieldOf = (model, name) => models[model].byName[name];

  /* ---------------- where ---------------- */
  function matchField(model, record, fieldName, cond) {
    const field = fieldOf(model, fieldName);
    if (!field) throw validationError(`Unknown argument \`${fieldName}\` in where for ${model}`);
    if (field.kind === 'object') return true; // relation filters not supported in preview
    const type = field.type;
    const actual = comparable(record[fieldName], type);
    const isOps =
      cond !== null && typeof cond === 'object' && !(cond instanceof Date) && !Array.isArray(cond) && !Buffer.isBuffer(cond);
    if (!isOps) return actual === comparable(cond, type);

    for (const [op, raw] of Object.entries(cond)) {
      if (raw === undefined || op === 'mode') continue;
      const val = Array.isArray(raw) ? raw.map((x) => comparable(x, type)) : comparable(raw, type);
      const s = (x) => String(x ?? '').toLowerCase();
      switch (op) {
        case 'equals':
          if (actual !== val) return false;
          break;
        case 'not':
          if (val !== null && typeof raw === 'object' && !(raw instanceof Date)) {
            if (matchField(model, record, fieldName, raw)) return false;
          } else if (actual === val) return false;
          break;
        case 'in':
          if (!val.includes(actual)) return false;
          break;
        case 'notIn':
          if (val.includes(actual)) return false;
          break;
        case 'contains':
          if (actual == null || !s(actual).includes(s(val))) return false;
          break;
        case 'startsWith':
          if (actual == null || !s(actual).startsWith(s(val))) return false;
          break;
        case 'endsWith':
          if (actual == null || !s(actual).endsWith(s(val))) return false;
          break;
        case 'gt':
          if (!(actual != null && actual > val)) return false;
          break;
        case 'gte':
          if (!(actual != null && actual >= val)) return false;
          break;
        case 'lt':
          if (!(actual != null && actual < val)) return false;
          break;
        case 'lte':
          if (!(actual != null && actual <= val)) return false;
          break;
        default:
          throw validationError(`Filter operator "${op}" is not supported in preview`);
      }
    }
    return true;
  }

  function matches(model, record, where) {
    if (!where) return true;
    for (const [key, cond] of Object.entries(where)) {
      if (cond === undefined) continue;
      if (key === 'AND') {
        if (![].concat(cond).every((w) => matches(model, record, w))) return false;
      } else if (key === 'OR') {
        if (!cond.some((w) => matches(model, record, w))) return false;
      } else if (key === 'NOT') {
        if ([].concat(cond).some((w) => matches(model, record, w))) return false;
      } else if (!matchField(model, record, key, cond)) {
        return false;
      }
    }
    return true;
  }

  /* ---------------- projection ---------------- */
  function resolveRelation(model, record, field) {
    const target = field.type;
    if (!tables[target]) return field.isList ? [] : null;
    if (field.relationFromFields && field.relationFromFields.length) {
      return (
        clone(
          tables[target].find((r) =>
            field.relationFromFields.every((fk, i) => r[field.relationToFields[i]] === record[fk] && record[fk] != null)
          )
        ) || null
      );
    }
    const opposite = models[target].fields.find(
      (f) => f.kind === 'object' && f.relationName === field.relationName && f.type === model && f !== field && f.relationFromFields.length
    );
    if (!opposite) return field.isList ? [] : null; // implicit many-to-many: not simulated
    const related = tables[target].filter((r) =>
      opposite.relationFromFields.every((fk, i) => r[fk] === record[opposite.relationToFields[i]])
    );
    return field.isList ? related.map(clone) : clone(related[0]) || null;
  }

  function project(model, record, { include, omit, select } = {}) {
    if (!record) return record;
    const out = {};
    for (const f of models[model].fields) {
      if (f.kind === 'object') continue;
      if (omit && omit[f.name]) continue;
      if (select && !select[f.name]) continue;
      out[f.name] = clone(record[f.name]);
    }
    const rels = { ...(include || {}), ...(select || {}) };
    for (const [name, opt] of Object.entries(rels)) {
      const f = fieldOf(model, name);
      if (!opt || !f || f.kind !== 'object') continue;
      out[name] = resolveRelation(model, record, f);
    }
    return out;
  }

  /* ---------------- writes ---------------- */
  function applyDefaults(model, data) {
    const rec = {};
    for (const f of models[model].fields) {
      if (f.kind === 'object') continue;
      if (data[f.name] !== undefined) {
        rec[f.name] = clone(data[f.name]);
        continue;
      }
      const d = f.default;
      if (d && d.kind === 'function') {
        if (d.name === 'autoincrement') rec[f.name] = f.type === 'BigInt' ? BigInt(++counters[model]) : ++counters[model];
        else if (d.name === 'uuid') rec[f.name] = crypto.randomUUID();
        else if (d.name === 'cuid' || d.name === 'nanoid' || d.name === 'ulid') rec[f.name] = cuid();
        else if (d.name === 'now') rec[f.name] = new Date();
        else if (d.name === 'auto') rec[f.name] = crypto.randomBytes(12).toString('hex'); // Mongo ObjectId
        else rec[f.name] = null;
      } else if (d && d.kind === 'value') {
        rec[f.name] = clone(d.value);
      } else if (f.isUpdatedAt) {
        rec[f.name] = new Date();
      } else if (f.isList) {
        rec[f.name] = [];
      } else {
        if (f.isRequired) throw validationError(`Argument \`${f.name}\` is missing.`);
        rec[f.name] = null;
      }
      if (f.isUpdatedAt && rec[f.name] == null) rec[f.name] = new Date();
    }
    // Keep autoincrement counter ahead of explicitly provided ids
    const id = rec[models[model].idField];
    if (typeof id === 'number' && id > counters[model]) counters[model] = id;
    return rec;
  }

  function checkTypes(model, data) {
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      const f = fieldOf(model, k);
      if (!f) throw validationError(`Unknown argument \`${k}\` for ${model}.`);
      if (f.kind === 'object') throw validationError(`Nested writes (\`${k}\`) are not supported in preview.`);
      if (v === null && f.isRequired) throw validationError(`Argument \`${k}\` must not be null.`);
      if (f.maxLength && typeof v === 'string' && v.length > f.maxLength) {
        throw prismaError('P2000', `The provided value for the column is too long for the column's type. Column: ${k}`, { column_name: k });
      }
    }
  }

  function checkUnique(model, rec, selfIndex = -1) {
    const m = models[model];
    const sets = m.fields.filter((f) => (f.isUnique || f.isId) && f.kind !== 'object').map((f) => [f.name]);
    sets.push(...(m.uniqueIndexes || []));
    for (const set of sets) {
      if (set.some((n) => rec[n] == null)) continue;
      const clash = tables[model].findIndex(
        (r, i) => i !== selfIndex && set.every((n) => comparable(r[n], fieldOf(model, n).type) === comparable(rec[n], fieldOf(model, n).type))
      );
      if (clash !== -1) throw prismaError('P2002', `Unique constraint failed on the fields: (${set.join(',')})`, { target: set });
    }
  }

  function checkForeignKeys(model, rec) {
    for (const f of models[model].fields) {
      if (f.kind !== 'object' || !f.relationFromFields.length || !tables[f.type]) continue;
      if (f.relationFromFields.some((fk) => rec[fk] == null)) continue;
      const exists = tables[f.type].some((r) => f.relationFromFields.every((fk, i) => r[f.relationToFields[i]] === rec[fk]));
      if (!exists) {
        throw prismaError('P2003', `Foreign key constraint violated on the field: \`${f.relationFromFields.join(', ')}\``, {
          field_name: f.relationFromFields.join(', '),
        });
      }
    }
  }

  /** Apply onDelete referential actions for children pointing at `record`. */
  function handleDelete(model, record) {
    for (const [childModel, cm] of Object.entries(models)) {
      for (const f of cm.fields) {
        if (f.kind !== 'object' || f.type !== model || !f.relationFromFields.length) continue;
        const pointsHere = (r) => f.relationFromFields.every((fk, i) => r[fk] === record[f.relationToFields[i]]);
        const children = tables[childModel].filter(pointsHere);
        if (!children.length) continue;
        const required = f.relationFromFields.some((fk) => cm.byName[fk] && cm.byName[fk].isRequired);
        const action = f.relationOnDelete || (required ? 'Restrict' : 'SetNull');
        if (action === 'Cascade') {
          children.forEach((c) => {
            handleDelete(childModel, c);
            tables[childModel].splice(tables[childModel].indexOf(c), 1);
          });
        } else if (action === 'SetNull' && !required) {
          children.forEach((c) => f.relationFromFields.forEach((fk) => (c[fk] = null)));
        } else {
          throw prismaError(
            'P2003',
            `Foreign key constraint violated: ${children.length} ${childModel} record(s) still reference this ${model}`,
            { field_name: f.relationFromFields.join(', ') }
          );
        }
      }
    }
  }

  function findIndexUnique(model, where) {
    if (!where || !Object.keys(where).length) throw validationError('findUnique/update/delete requires a `where` with a unique field');
    return tables[model].findIndex((r) => matches(model, r, where));
  }

  function sortRecords(model, list, orderBy) {
    const orders = [].concat(orderBy || []).flatMap((o) => Object.entries(o));
    if (!orders.length) return list;
    return [...list].sort((a, b) => {
      for (const [field, dir] of orders) {
        const t = fieldOf(model, field) ? fieldOf(model, field).type : undefined;
        const x = comparable(a[field], t);
        const y = comparable(b[field], t);
        if (x === y) continue;
        if (x == null) return 1;
        if (y == null) return -1;
        const r = x > y ? 1 : -1;
        return dir === 'desc' ? -r : r;
      }
      return 0;
    });
  }

  function delegateFor(model) {
    const table = () => tables[model];
    return {
      async findMany(args = {}) {
        let rows = table().filter((r) => matches(model, r, args.where));
        rows = sortRecords(model, rows, args.orderBy);
        const skip = args.skip || 0;
        rows = rows.slice(skip, args.take !== undefined ? skip + args.take : undefined);
        return rows.map((r) => project(model, r, args));
      },
      async findFirst(args = {}) {
        const [first] = await this.findMany({ ...args, take: 1 });
        return first || null;
      },
      async findUnique(args = {}) {
        const i = findIndexUnique(model, args.where);
        return i === -1 ? null : project(model, table()[i], args);
      },
      async findUniqueOrThrow(args = {}) {
        const r = await this.findUnique(args);
        if (!r) throw prismaError('P2025', 'No record was found for a query.', { cause: `${model} not found` });
        return r;
      },
      async count(args = {}) {
        return table().filter((r) => matches(model, r, args.where)).length;
      },
      async create(args = {}) {
        const data = args.data || {};
        checkTypes(model, data);
        if (table().length >= maxRecordsPerModel) {
          throw prismaError('P5000', `Preview limit reached (${maxRecordsPerModel} ${model} records)`);
        }
        const rec = applyDefaults(model, data);
        checkUnique(model, rec);
        checkForeignKeys(model, rec);
        table().push(rec);
        return project(model, rec, args);
      },
      async update(args = {}) {
        const i = findIndexUnique(model, args.where);
        if (i === -1) throw prismaError('P2025', 'Record to update not found.', { cause: 'Record to update not found.' });
        const data = args.data || {};
        checkTypes(model, data);
        const next = { ...table()[i] };
        for (const [k, v] of Object.entries(data)) if (v !== undefined) next[k] = clone(v);
        for (const f of models[model].fields) if (f.isUpdatedAt) next[f.name] = new Date();
        checkUnique(model, next, i);
        checkForeignKeys(model, next);
        table()[i] = next;
        return project(model, next, args);
      },
      async delete(args = {}) {
        const i = findIndexUnique(model, args.where);
        if (i === -1) throw prismaError('P2025', 'Record to delete does not exist.', { cause: 'Record to delete does not exist.' });
        const rec = table()[i];
        handleDelete(model, rec);
        table().splice(table().indexOf(rec), 1);
        return project(model, rec, args);
      },
      async deleteMany(args = {}) {
        const before = table().length;
        tables[model] = table().filter((r) => !matches(model, r, args.where));
        return { count: before - tables[model].length };
      },
    };
  }

  const client = {
    async $connect() {},
    async $disconnect() {},
    async $transaction(arg) {
      if (Array.isArray(arg)) return Promise.all(arg);
      return arg(client);
    },
    $stats() {
      return Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length]));
    },
  };
  for (const [name, m] of Object.entries(models)) client[m.delegate] = delegateFor(name);
  return client;
}

module.exports = { createMockPrisma };
