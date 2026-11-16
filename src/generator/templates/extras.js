/**
 * Templates for "extras": seed script, Postman collection, README,
 * package.json, .env files and the normalized prisma schema.
 */
const { ruleFor } = require('./model');

const q = (s) => JSON.stringify(s);
const ident = (s) => (/^[A-Za-z_$][\w$]*$/.test(s) ? s : q(s));
const PRISMA_VERSION = '6.19.3';

/* ------------------------------------------------------------------ */
/* Sample values (Postman bodies, README examples, preview UI)         */
/* ------------------------------------------------------------------ */

function sampleScalar(field) {
  const n = field.name.toLowerCase();
  if (field.kind === 'enum') return field.enumValues[0];
  switch (field.type) {
    case 'String': {
      let v;
      if (field.format === 'email') v = 'jane.doe@example.com';
      else if (field.format === 'url') v = 'https://example.com';
      else if (field.format === 'uuid' || (field.isForeignKey && field.type === 'String')) v = 'replace-with-an-existing-id';
      else if (n === 'firstname') v = 'Jane';
      else if (n === 'lastname') v = 'Doe';
      else if (/name$/.test(n) && /user/.test(n)) v = 'janedoe';
      else if (/name$/.test(n)) v = 'Jane Doe';
      else if (/title/.test(n)) v = 'A sample title';
      else if (/slug/.test(n)) v = 'a-sample-slug';
      else if (/password/.test(n)) v = 'S3cure-Passw0rd';
      else if (/phone/.test(n)) v = '+1-555-0100';
      else if (/(content|body|text|description|bio|summary|message|comment)/.test(n)) v = 'Lorem ipsum dolor sit amet.';
      else if (/city/.test(n)) v = 'Mumbai';
      else if (/country/.test(n)) v = 'India';
      else if (/color|colour/.test(n)) v = 'blue';
      else v = `Sample ${field.name}`;
      return field.maxLength ? v.slice(0, field.maxLength) : v;
    }
    case 'Int':
      if (field.isForeignKey) return 1;
      if (/age/.test(n)) return 30;
      if (/rating|stars/.test(n)) return 4;
      if (/year/.test(n)) return 2025;
      return 10;
    case 'BigInt':
      return field.isForeignKey ? '1' : '1000';
    case 'Float':
      return 9.99;
    case 'Decimal':
      return '19.99';
    case 'Boolean':
      return true;
    case 'DateTime':
      return '2025-01-15T10:00:00.000Z';
    case 'Json':
      return { key: 'value' };
    default:
      return null;
  }
}

function sampleBody(model, { requiredOnly = false } = {}) {
  const body = {};
  for (const f of model.writableFields) {
    const rule = ruleFor(f);
    if (requiredOnly && !rule.required) continue;
    if (f.isId) continue; // let users send ids explicitly only if they want to
    const v = sampleScalar(f);
    if (v === null) continue;
    body[f.name] = f.isList ? [v] : v;
  }
  return body;
}

function sampleId(model) {
  return model.idField.type === 'Int' || model.idField.type === 'BigInt' ? '1' : ':id';
}

/* ------------------------------------------------------------------ */
/* Seed script                                                         */
/* ------------------------------------------------------------------ */

function fakerExpr(field, provider) {
  const n = field.name.toLowerCase();
  let expr;
  if (field.kind === 'enum') {
    expr = `faker.helpers.arrayElement([${field.enumValues.map(q).join(', ')}])`;
  } else {
    switch (field.type) {
      case 'String':
        if (field.format === 'email') expr = `faker.internet.email().toLowerCase().replace('@', '+' + i + '@')`;
        else if (field.format === 'uuid' || (field.isId && !field.hasDefault)) expr = 'faker.string.uuid()';
        else if (field.format === 'url') {
          expr = /avatar|image|photo|picture|thumbnail/.test(n) ? 'faker.image.url()' : 'faker.internet.url()';
        } else if (/avatar|image|photo|picture|thumbnail/.test(n)) expr = 'faker.image.url()';
        else if (n === 'firstname') expr = 'faker.person.firstName()';
        else if (n === 'lastname') expr = 'faker.person.lastName()';
        else if (/user(name)?$/.test(n) && /name/.test(n)) expr = 'faker.internet.username()';
        else if (/name$/.test(n) && /(company|org|brand)/.test(n)) expr = 'faker.company.name()';
        else if (/name$/.test(n) && /(product|item)/.test(n)) expr = 'faker.commerce.productName()';
        else if (/name$/.test(n)) expr = 'faker.person.fullName()';
        else if (/title|headline|subject/.test(n)) expr = 'faker.lorem.sentence({ min: 3, max: 6 })';
        else if (/slug/.test(n)) expr = 'faker.lorem.slug(3)';
        else if (/(content|body|text|article)/.test(n)) expr = 'faker.lorem.paragraphs(2)';
        else if (/(description|summary|bio|about|comment|message|note)/.test(n)) expr = 'faker.lorem.sentence()';
        else if (/password|secret/.test(n)) expr = 'faker.internet.password({ length: 16 })';
        else if (/token|key|code/.test(n)) expr = 'faker.string.alphanumeric(24)';
        else if (/phone|mobile/.test(n)) expr = 'faker.phone.number()';
        else if (/address|street/.test(n)) expr = 'faker.location.streetAddress()';
        else if (/city/.test(n)) expr = 'faker.location.city()';
        else if (/country/.test(n)) expr = 'faker.location.country()';
        else if (/state|province/.test(n)) expr = 'faker.location.state()';
        else if (/zip|postal/.test(n)) expr = 'faker.location.zipCode()';
        else if (/company|organization/.test(n)) expr = 'faker.company.name()';
        else if (/colou?r/.test(n)) expr = 'faker.color.human()';
        else if (/currency/.test(n)) expr = 'faker.finance.currencyCode()';
        else if (/category|tag|label|type|status|role/.test(n)) expr = 'faker.word.noun()';
        else expr = 'faker.lorem.words(3)';

        if (field.isUnique && field.format !== 'email' && !/uuid/.test(expr)) {
          expr = field.maxLength
            ? `${expr}.slice(0, ${Math.max(1, field.maxLength - 8)}) + '-' + i`
            : `${expr} + '-' + i`;
        } else if (field.maxLength) {
          expr = `${expr}.slice(0, ${field.maxLength})`;
        }
        break;
      case 'Int':
        if (field.isUnique || (field.isId && !field.hasDefault)) expr = 'i + 1';
        else if (/age/.test(n)) expr = 'faker.number.int({ min: 18, max: 80 })';
        else if (/rating|stars|score/.test(n)) expr = 'faker.number.int({ min: 1, max: 5 })';
        else if (/year/.test(n)) expr = 'faker.number.int({ min: 1990, max: 2025 })';
        else if (/quantity|stock|count|qty/.test(n)) expr = 'faker.number.int({ min: 0, max: 500 })';
        else expr = 'faker.number.int({ min: 1, max: 1000 })';
        break;
      case 'BigInt':
        expr = field.isUnique || field.isId ? 'BigInt(i + 1)' : 'BigInt(faker.number.int({ min: 1, max: 1000000 }))';
        break;
      case 'Float':
        if (/^lat/.test(n)) expr = 'faker.location.latitude()';
        else if (/^(lng|lon)/.test(n)) expr = 'faker.location.longitude()';
        else if (/rating|score/.test(n)) expr = 'faker.number.float({ min: 1, max: 5, fractionDigits: 1 })';
        else expr = 'faker.number.float({ min: 1, max: 1000, fractionDigits: 2 })';
        break;
      case 'Decimal': {
        let max = 1000;
        if (field.nativeType && field.nativeType[1] && field.nativeType[1].length === 2) {
          const [p, s] = field.nativeType[1].map(Number);
          if (p > s) max = Math.min(max, 10 ** (p - s) - 1);
        }
        expr = `faker.commerce.price({ min: 1, max: ${max} })`;
        break;
      }
      case 'Boolean':
        expr = 'faker.datatype.boolean()';
        break;
      case 'DateTime':
        if (/birth|dob/.test(n)) expr = 'faker.date.birthdate()';
        else if (/due|expire|end|deadline|until/.test(n)) expr = 'faker.date.soon({ days: 60 })';
        else expr = 'faker.date.recent({ days: 90 })';
        break;
      case 'Json':
        expr = '{ note: faker.lorem.word(), score: faker.number.int(100) }';
        break;
      case 'Bytes':
        expr = 'Buffer.from(faker.string.alphanumeric(16))';
        break;
      default:
        return null;
    }
  }
  if (field.isList) expr = `[${expr}, ${expr}]`;
  return expr;
}

function seedFieldsFor(model) {
  return model.scalarFields.filter((f) => {
    if (f.kind === 'unsupported' || f.isForeignKey || f.isUpdatedAt) return false;
    if (f.isId && f.hasDefault) return false;
    if (f.default && f.default.kind === 'function') return false; // now(), uuid(), autoincrement(), dbgenerated()...
    return true;
  });
}

/**
 * Orders models so that parents are created before children (topological sort
 * on foreign keys). Models stuck in a required cycle are skipped.
 */
function planSeed(models) {
  const byName = new Map(models.map((m) => [m.name, m]));
  const info = new Map();
  const skipped = [];

  for (const m of models) {
    const rels = [];
    let blocked = null;
    for (const r of m.relationFields) {
      if (!r.relationFromFields.length) continue;
      const fkFields = r.relationFromFields.map((fk) => m.fields.find((f) => f.name === fk));
      const required = fkFields.some((f) => f && f.isRequired);
      const unique =
        (fkFields.length === 1 && fkFields[0] && fkFields[0].isUnique) ||
        m.uniqueIndexes.some((u) => u.length === r.relationFromFields.length && u.every((x) => r.relationFromFields.includes(x)));
      if (!byName.has(r.type)) {
        if (required) blocked = `it requires a ${r.type}, which has no generated routes`;
        continue;
      }
      if (r.type === m.name && required) {
        blocked = 'it has a required relation to itself';
        continue;
      }
      rels.push({ name: r.name, parent: r.type, fks: r.relationFromFields, refs: r.relationToFields, required, unique, self: r.type === m.name });
    }
    if (blocked) skipped.push({ model: m.name, reason: blocked });
    else info.set(m.name, rels);
  }

  const order = [];
  const done = new Set();
  let remaining = [...info.keys()];
  const ready = (name, ignoreOptional) =>
    info.get(name).every((r) => r.self || done.has(r.parent) || (ignoreOptional && !r.required) || !info.has(r.parent));

  while (remaining.length) {
    let next = remaining.filter((n) => ready(n, false));
    if (!next.length) next = remaining.filter((n) => ready(n, true)).slice(0, 1);
    if (!next.length) {
      remaining.forEach((n) => skipped.push({ model: n, reason: 'it is part of a cycle of required relations' }));
      break;
    }
    next.forEach((n) => {
      order.push(n);
      done.add(n);
    });
    remaining = remaining.filter((n) => !done.has(n));
  }

  // A child whose required parent got skipped can't be seeded either
  const seeded = new Set();
  const finalOrder = [];
  for (const name of order) {
    const rels = info.get(name);
    const missing = rels.find((r) => r.required && !r.self && !seeded.has(r.parent));
    if (missing) {
      skipped.push({ model: name, reason: `its required parent ${missing.parent} could not be seeded` });
      continue;
    }
    seeded.add(name);
    finalOrder.push({ model: byName.get(name), rels: rels.map((r) => ({ ...r, available: r.self || seeded.has(r.parent) })) });
  }
  return { order: finalOrder, skipped };
}

function seed(models, provider) {
  const { order, skipped } = planSeed(models);
  const blocks = order.map(({ model, rels }) => {
    const refLines = [];
    const dataLines = [];

    rels.forEach((r) => {
      if (!r.available) return;
      const v = `${r.name}Ref`;
      const source = `created.${r.parent}`;
      if (r.unique) refLines.push(`    const ${v} = ${source}[i];`);
      else refLines.push(`    const ${v} = pick(${source});`);
      if (r.required) refLines.push(`    if (!${v}) break; // not enough ${r.parent} records`);
      r.fks.forEach((fk, idx) => {
        const ref = r.refs[idx];
        dataLines.push(`        ${ident(fk)}: ${r.required ? `${v}.${ref}` : `${v} ? ${v}.${ref} : undefined`},`);
      });
    });

    for (const f of seedFieldsFor(model)) {
      const expr = fakerExpr(f, provider);
      if (expr) dataLines.push(`        ${ident(f.name)}: ${expr},`);
    }

    const deps = rels.filter((r) => !r.self).map((r) => r.parent);
    return `  // ${model.name}${deps.length ? ` (needs: ${[...new Set(deps)].join(', ')})` : ''}
  created.${model.name} = [];
  for (let i = 0; i < count; i++) {
${refLines.join('\n')}${refLines.length ? '\n' : ''}    const record = await client.${model.delegate}.create({
      data: {
${dataLines.join('\n')}
      },
    });
    created.${model.name}.push(record);
  }
  log(\`  ✔ ${model.name}: \${created.${model.name}.length}\`);`;
  });

  const resetOrder = [...order].reverse().map(({ model }) => `  await client.${model.delegate}.deleteMany();`);
  const skippedNote = skipped.length
    ? `\n *\n * Not seeded:\n${skipped.map((s) => ` *   - ${s.model}: ${s.reason}`).join('\n')}`
    : '';

  return `/**
 * Fills the database with realistic fake data using @faker-js/faker.
 *
 *   npm run seed              (10 records per model)
 *   SEED_COUNT=50 npm run seed
 *
 * Models are created parents-first so foreign keys always point at real rows.${skippedNote}
 */
const { faker } = require('@faker-js/faker');
const prisma = require('../src/lib/prisma');

const DEFAULT_COUNT = parseInt(process.env.SEED_COUNT, 10) || 10;
const pick = (list) => (list.length ? list[Math.floor(Math.random() * list.length)] : undefined);

async function seed(client = prisma, { count = DEFAULT_COUNT, log = console.log } = {}) {
  const created = {};

  log('Clearing existing data...');
${resetOrder.join('\n')}

  log(\`Seeding \${count} records per model...\`);
${blocks.join('\n\n')}

  return created;
}

module.exports = { seed };

// Run directly: node prisma/seed.js
if (require.main === module) {
  seed()
    .then(() => console.log('Seeding complete.'))
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
`;
}

/* ------------------------------------------------------------------ */
/* Postman collection (v2.1)                                           */
/* ------------------------------------------------------------------ */

function postman(projectName, models, port) {
  const urlFor = (pathParts, query) => {
    const raw = `{{baseUrl}}/${pathParts.join('/')}${query ? '?' + query.map((x) => `${x.key}=${x.value}`).join('&') : ''}`;
    const url = { raw, host: ['{{baseUrl}}'], path: pathParts };
    if (query) url.query = query;
    return url;
  };
  const jsonBody = (obj) => ({
    mode: 'raw',
    raw: JSON.stringify(obj, null, 2),
    options: { raw: { language: 'json' } },
  });
  const header = [{ key: 'Content-Type', value: 'application/json' }];

  const items = models.map((m) => {
    const idVar = `${m.camel}Id`;
    const firstFilter = m.filterableFields.find((f) => !f.isId);
    const listQuery = [
      { key: 'page', value: '1' },
      { key: 'limit', value: '10' },
      { key: 'sort', value: m.idField.name },
      { key: 'order', value: 'desc' },
    ];
    const saveId = {
      listen: 'test',
      script: {
        type: 'text/javascript',
        exec: [
          'pm.test("Status is 201", () => pm.response.to.have.status(201));',
          `const json = pm.response.json();`,
          `if (json && json.data) pm.collectionVariables.set(${q(idVar)}, json.data[${q(m.idField.name)}]);`,
        ],
      },
    };
    return {
      name: m.labelPlural,
      item: [
        {
          name: `List ${m.labelPlural}`,
          request: { method: 'GET', header: [], url: urlFor([m.route], listQuery), description: `Paginated list. Filter with any field, e.g. ?${firstFilter ? firstFilter.name : m.idField.name}=...` },
        },
        {
          name: `Create ${m.label}`,
          event: [saveId],
          request: { method: 'POST', header, body: jsonBody(sampleBody(m)), url: urlFor([m.route]), description: 'Saves the new id into the {{' + idVar + '}} collection variable.' },
        },
        { name: `Get ${m.label} by id`, request: { method: 'GET', header: [], url: urlFor([m.route, `{{${idVar}}}`]) } },
        {
          name: `Replace ${m.label} (PUT)`,
          request: { method: 'PUT', header, body: jsonBody(sampleBody(m)), url: urlFor([m.route, `{{${idVar}}}`]) },
        },
        {
          name: `Update ${m.label} (PATCH)`,
          request: {
            method: 'PATCH',
            header,
            body: jsonBody(Object.fromEntries(Object.entries(sampleBody(m)).slice(0, 1))),
            url: urlFor([m.route, `{{${idVar}}}`]),
          },
        },
        { name: `Delete ${m.label}`, request: { method: 'DELETE', header: [], url: urlFor([m.route, `{{${idVar}}}`]) } },
      ],
    };
  });

  const collection = {
    info: {
      name: `${projectName} API`,
      description: `Generated by APIForge. Set {{baseUrl}} if your server runs on a different port.`,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    variable: [
      { key: 'baseUrl', value: `http://localhost:${port}/api/v1` },
      ...models.map((m) => ({ key: `${m.camel}Id`, value: sampleId(m) === ':id' ? '' : '1' })),
    ],
    item: items,
  };
  return JSON.stringify(collection, null, 2) + '\n';
}

/* ------------------------------------------------------------------ */
/* package.json, env, schema                                           */
/* ------------------------------------------------------------------ */

function packageJson(slug, projectName) {
  const pkg = {
    name: slug,
    version: '1.0.0',
    description: `${projectName} - REST API generated by APIForge`,
    main: 'src/server.js',
    private: true,
    scripts: {
      prestart: 'prisma db push --skip-generate',
      start: 'node src/server.js',
      predev: 'prisma db push --skip-generate',
      dev: 'node --watch src/server.js',
      seed: 'node prisma/seed.js',
      'db:push': 'prisma db push',
      'db:studio': 'prisma studio',
      postinstall: 'prisma generate',
    },
    prisma: { seed: 'node prisma/seed.js' },
    engines: { node: '>=18' },
    dependencies: {
      '@prisma/client': PRISMA_VERSION,
      dotenv: '^16.4.5',
      express: '^4.21.2',
      prisma: PRISMA_VERSION,
    },
    devDependencies: {
      '@faker-js/faker': '^9.9.0',
    },
  };
  return JSON.stringify(pkg, null, 2) + '\n';
}

const DB_URLS = {
  mysql: 'mysql://root:password@localhost:3306/SLUG',
  postgresql: 'postgresql://postgres:password@localhost:5432/SLUG?schema=public',
  postgres: 'postgresql://postgres:password@localhost:5432/SLUG?schema=public',
  cockroachdb: 'postgresql://root@localhost:26257/SLUG?sslmode=disable',
  sqlserver: 'sqlserver://localhost:1433;database=SLUG;user=sa;password=Password1!;trustServerCertificate=true',
  mongodb: 'mongodb://localhost:27017/SLUG',
  sqlite: 'file:./dev.db',
};

function envFile(provider, envVar, slug, port) {
  const db = (DB_URLS[provider] || DB_URLS.sqlite).replace('SLUG', slug.replace(/-/g, '_'));
  return `# Server
PORT=${port}
NODE_ENV=development
LOG_REQUESTS=true
CORS_ORIGIN=*

# Database (${provider})
${envVar}="${db}"
`;
}

function normalizeSchema(schemaText, parsed) {
  // Always use the classic JS client so `require('@prisma/client')` works.
  let out = schemaText.replace(/^[ \t]*generator\s+\w+\s*\{[\s\S]*?^[ \t]*\}[ \t]*\r?\n?/gm, '');
  const header = ['generator client {', '  provider = "prisma-client-js"', '}', ''];
  if (!parsed.hasDatasource) {
    header.push('datasource db {', '  provider = "sqlite"', '  url      = env("DATABASE_URL")', '}', '');
  }
  return header.join('\n') + '\n' + out.replace(/^\s*\n/, '');
}

/* ------------------------------------------------------------------ */
/* README                                                              */
/* ------------------------------------------------------------------ */

function readme(projectName, parsed, files, port) {
  const { models, provider, warnings } = parsed;
  const endpointRows = models
    .map(
      (m) => `| \`GET\` | \`/api/v1/${m.route}\` | List ${m.labelPlural.toLowerCase()} (paginated, filterable) |
| \`POST\` | \`/api/v1/${m.route}\` | Create a ${m.label.toLowerCase()} |
| \`GET\` | \`/api/v1/${m.route}/:id\` | Get one ${m.label.toLowerCase()} |
| \`PUT\` | \`/api/v1/${m.route}/:id\` | Replace a ${m.label.toLowerCase()} |
| \`PATCH\` | \`/api/v1/${m.route}/:id\` | Partially update a ${m.label.toLowerCase()} |
| \`DELETE\` | \`/api/v1/${m.route}/:id\` | Delete a ${m.label.toLowerCase()} |`
    )
    .join('\n');

  const validationSections = models
    .map((m) => {
      const rows = m.writableFields.map((f) => {
        const r = ruleFor(f);
        const checks = [r.type + (r.list ? '[]' : '')];
        if (r.format) checks.push(r.format);
        if (r.maxLength) checks.push(`max ${r.maxLength} chars`);
        if (r.values) checks.push(`one of ${r.values.join(' / ')}`);
        if (f.isUnique) checks.push('unique');
        if (f.isForeignKey) checks.push('foreign key');
        return `| \`${f.name}\` | ${r.required ? 'yes' : 'no'} | ${checks.join(', ')} |`;
      });
      return `### ${m.name}\n\n| Field | Required | Rules |\n|---|---|---|\n${rows.join('\n') || '| _(no writable fields)_ | | |'}`;
    })
    .join('\n\n');

  const first = models[0];
  const filterExample = first.filterableFields.find((f) => f.type === 'String' && !f.isId) || first.filterableFields[0];
  const tree = buildTree(files.map((f) => f.path).concat(['README.md']));
  const envNote =
    provider === 'sqlite'
      ? 'This project uses **SQLite**, so it works out of the box — no database server needed.'
      : `This project uses **${provider}**. Make sure the server is running and \`DATABASE_URL\` in \`.env\` points at it (the database is created automatically if your user has permission).`;

  return `# ${projectName}

A REST API generated by **APIForge** from your Prisma schema: Express + Prisma, MVC structure,
validation, pagination, filtering, and a central error handler.

## Quick start

\`\`\`bash
npm install        # installs deps and generates the Prisma client
npm run seed       # optional: fill the database with fake data
npm start          # syncs the schema to the DB, then starts on http://localhost:${port}
\`\`\`

${envNote}

Then open <http://localhost:${port}/api/v1/${first.route}> or import \`postman_collection.json\` into Postman.

## Scripts

| Script | What it does |
|---|---|
| \`npm start\` | \`prisma db push\` then start the server |
| \`npm run dev\` | Same, with auto-restart on file changes (\`node --watch\`) |
| \`npm run seed\` | Reset and seed the DB with fake data (\`SEED_COUNT=50 npm run seed\`) |
| \`npm run db:push\` | Sync \`prisma/schema.prisma\` to the database |
| \`npm run db:studio\` | Open Prisma Studio to browse data |

## Project structure

\`\`\`
${tree}
\`\`\`

A request flows: **route** → **validate middleware** → **controller** → **service** → **Prisma** → database.
Errors thrown anywhere end up in \`src/middleware/errorHandler.js\`.

## Endpoints

| Method | Path | Description |
|---|---|---|
${endpointRows}

### Query parameters (list endpoints)

| Param | Example | Notes |
|---|---|---|
| \`page\`, \`limit\` | \`?page=2&limit=20\` | Default 10 per page, max 100 |
| \`sort\`, \`order\` | \`?sort=${first.idField.name}&order=desc\` or \`?sort=-${first.idField.name}\` | Any scalar field |
| \`<field>\` | \`?${filterExample.name}=${filterExample.type === 'String' ? 'abc' : '1'}\` | Strings match with *contains*, others exact |
| \`<field>_gte\`, \`_lte\`, \`_gt\`, \`_lt\` | \`?createdAt_gte=2024-01-01\` | Numbers and dates |
| \`include\` | \`?include=${(first.relationFields[0] && first.relationFields[0].name) || 'relationName'}\` | Embed related records |

### Response format

\`\`\`json
{ "success": true, "data": [ ... ], "meta": { "total": 42, "page": 1, "limit": 10, "totalPages": 5, "hasNextPage": true, "hasPrevPage": false } }
\`\`\`

Errors:

\`\`\`json
{ "success": false, "error": { "message": "Validation failed", "details": [{ "field": "email", "message": "email must be a valid email address" }] } }
\`\`\`

| Status | When |
|---|---|
| 400 | Bad id, bad filter, malformed JSON, foreign key points nowhere |
| 404 | Record or route not found |
| 409 | Unique constraint violated (e.g. email already taken) |
| 422 | Request body failed validation |

## Validation rules

Generated from your schema's field types. \`POST\` and \`PUT\` enforce required fields; \`PATCH\` only validates the fields you send.
Unknown and read-only fields (ids, \`@updatedAt\`, …) are rejected.

${validationSections}
${warnings.length ? `\n## Notes from the generator\n\n${warnings.map((w) => `- ${w}`).join('\n')}\n` : ''}
---
Generated by APIForge.
`;
}

function buildTree(paths) {
  const root = {};
  for (const p of paths.sort()) {
    let node = root;
    for (const part of p.split('/')) node = node[part] = node[part] || {};
  }
  const lines = [];
  const walk = (node, prefix) => {
    const entries = Object.keys(node).sort((a, b) => {
      const ad = Object.keys(node[a]).length > 0;
      const bd = Object.keys(node[b]).length > 0;
      return ad === bd ? a.localeCompare(b) : ad ? -1 : 1;
    });
    entries.forEach((name, i) => {
      const last = i === entries.length - 1;
      const isDir = Object.keys(node[name]).length > 0;
      lines.push(`${prefix}${last ? '└── ' : '├── '}${name}${isDir ? '/' : ''}`);
      if (isDir) walk(node[name], prefix + (last ? '    ' : '│   '));
    });
  };
  walk(root, '');
  return lines.join('\n');
}

module.exports = {
  seed,
  planSeed,
  postman,
  packageJson,
  envFile,
  normalizeSchema,
  readme,
  sampleBody,
  sampleScalar,
};
