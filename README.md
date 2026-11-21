# APIForge

**Paste a Prisma schema, click Generate, and download a complete, working Express REST API.**

**Live demo:** https://api-forge-b7eo.vercel.app

Building a CRUD backend by hand takes hours. APIForge reads your Prisma schema and generates the whole project (routes, controllers, services, validation, seed data, Postman collection and README) in seconds, as a ZIP you can run with `npm install && npm start`.

---

## Features

### What it generates
- **Full CRUD API** for every model in a proper **MVC structure**: routes, controllers and services
- **Validation middleware** built from field types: emails are checked as emails, required fields are enforced, enums only accept their values, string lengths are limited
- **Versioned routes** under `/api/v1/...`
- **Pagination, filtering and sorting** on every list endpoint (`?page=1&limit=10&sort=-createdAt&role=ADMIN&views_gte=10`)
- **Central error handler** that turns Prisma errors into clean responses (404, 409 duplicate, 400 bad foreign key)
- **Sensitive fields** like `password` are never returned in responses
- **Seed script** with fake data (Faker)
- **`.env.example`, `package.json` and a README** for the generated project
- **Postman collection** so every endpoint can be tested immediately
- **ZIP download**, streamed straight to the browser

### What makes it stand out
- **Live preview:** before downloading, the generated API runs temporarily inside APIForge on an in-memory database, so you can test endpoints in the browser
- **Generation history:** change the schema and regenerate, and APIForge shows exactly which files were added, modified or removed, with line counts
- **User accounts:** sign up and log in with JWT, and keep your projects and every generated version

---

## Tech stack

| Part | Technology |
|---|---|
| Server | Node.js, Express |
| Database | MySQL with Prisma ORM |
| Schema parsing | `getDMMF` from `@prisma/internals` |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` |
| ZIP | `archiver` (streamed) |
| Diff | `diff` |
| Fake data | `@faker-js/faker` |
| Frontend | Plain HTML, CSS and JavaScript (served as static files) |

---

## Syllabus coverage (Advanced Programming)

| Topic | Where it is used |
|---|---|
| **fs + streams** | `src/services/storage.service.js`: writes generated files with `createWriteStream` and pipes the ZIP into the HTTP response |
| **npm** | The generator writes a `package.json` with the right dependencies and scripts |
| **Express, Router, MVC, middleware** | APIForge itself and the code it generates both use routes → controllers → services with middleware |
| **Prisma** | Parses the uploaded schema with `getDMMF`, and stores `User → Project → Generation → GeneratedFile` in MySQL |
| **Static files** | `express.static('public')` serves the web UI |
| **JWT** | `src/middleware/auth.js` protects project and generation routes |

---

## Getting started

### Requirements
- Node.js 18 or newer
- MySQL running locally

### Setup

```bash
git clone https://github.com/singhshouryat2-maker/API-Forge.git
cd API-Forge
npm install
cp .env.example .env
```

Open `.env` and set your MySQL connection and a JWT secret:

```env
PORT=4000
DATABASE_URL="mysql://root:yourpassword@localhost:3306/apiforge"
JWT_SECRET="any-long-random-string"
JWT_EXPIRES_IN="7d"
PREVIEW_TTL_MINUTES=15
```

Create the tables and start the server:

```bash
npm run db:push
npm start
```

Open **http://localhost:4000**.

### Scripts

| Command | What it does |
|---|---|
| `npm start` | Start the server |
| `npm run dev` | Start with auto-restart on file changes |
| `npm run db:push` | Create or update the MySQL tables from `prisma/schema.prisma` |
| `npm run test:generator` | Generate a project from the sample schema, run it in preview and test every endpoint (no database needed) |

---

## How to use

1. Register or log in.
2. Create a project.
3. Paste a Prisma schema, or click **Load sample**.
4. Click **Generate**.
5. Browse the generated files, then click **Live preview** to try the endpoints, or **Download ZIP**.
6. Edit the schema and generate again. The history dropdown shows every version and what changed.

### Running a downloaded project

```bash
unzip blog-api-v1.zip
cd blog-api-v1
npm install
npm start
```

Set `DATABASE_URL` in its `.env` first. `npm start` creates the tables, then starts the API on port 3000.

---

## API reference (APIForge's own API)

All routes start with `/api`. Routes marked 🔒 need the header `Authorization: Bearer <token>`.

| Method | Route | Description |
|---|---|---|
| POST | `/auth/register` | Create an account |
| POST | `/auth/login` | Log in, returns a JWT |
| GET | `/auth/me` 🔒 | Current user |
| POST | `/schema/validate` | Check a Prisma schema without saving |
| GET | `/projects` 🔒 | List your projects |
| POST | `/projects` 🔒 | Create a project |
| GET | `/projects/:projectId` 🔒 | Project with its generation history |
| PATCH | `/projects/:projectId` 🔒 | Rename or update a project |
| DELETE | `/projects/:projectId` 🔒 | Delete a project |
| POST | `/projects/:projectId/generations` 🔒 | Generate code from a schema (new version) |
| GET | `/generations/:generationId` 🔒 | A generation with all its files |
| GET | `/generations/:generationId/diff` 🔒 | Files changed since the previous version |
| GET | `/generations/:generationId/download` 🔒 | Download the ZIP |
| POST | `/generations/:generationId/preview` 🔒 | Start a live preview |
| DELETE | `/previews/:token` 🔒 | Stop a live preview |

A running preview is served at `/preview/:token/api/v1/...`.

---

## Project structure

```
apiforge/
├── prisma/
│   └── schema.prisma              # APIForge's own tables: User, Project, Generation, GeneratedFile
├── public/                        # Web UI (static files)
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   └── sample.prisma              # Example schema for "Load sample"
├── scripts/
│   └── smoke-test.js              # Generator test (no database needed)
└── src/
    ├── server.js                  # Starts the server
    ├── app.js                     # Express app setup
    ├── config.js                  # Reads .env
    ├── lib/prisma.js              # Prisma client
    ├── utils/http.js              # HttpError + asyncHandler
    ├── middleware/
    │   ├── auth.js                # JWT check
    │   └── errorHandler.js        # Central error handler
    ├── routes/index.js            # All /api routes
    ├── controllers/index.js       # Request handlers
    ├── services/
    │   ├── auth.service.js        # Register, login
    │   ├── project.service.js     # Projects CRUD
    │   ├── generation.service.js  # Generate, history, preview, download
    │   ├── diff.service.js        # Compare two versions
    │   └── storage.service.js     # fs + streams, ZIP
    ├── generator/
    │   ├── parser.js              # Prisma schema → model description (getDMMF)
    │   ├── naming.js              # User → users, UserProfile → user-profiles
    │   ├── index.js               # Builds the list of generated files
    │   └── templates/
    │       ├── model.js           # Routes, controller, service, validator per model
    │       ├── common.js          # Shared middleware and utils
    │       └── extras.js          # Seed, package.json, README, Postman
    └── preview/
        ├── previewManager.js      # Mounts the generated app at /preview/:token
        └── mockPrisma.js          # In-memory database for preview
```

### Generated project structure

```
blog-api/
├── prisma/
│   ├── schema.prisma
│   └── seed.js
├── src/
│   ├── server.js
│   ├── app.js
│   ├── config/index.js
│   ├── lib/prisma.js
│   ├── routes/
│   │   ├── index.js
│   │   └── v1/  (index.js + one <model>.routes.js per model)
│   ├── controllers/   (one per model)
│   ├── services/      (one per model)
│   ├── validators/    (one per model)
│   ├── middleware/    (validate, errorHandler, notFound, cors, requestLogger)
│   └── utils/         (AppError, asyncHandler, pagination, queryBuilder)
├── .env.example
├── package.json
├── postman_collection.json
└── README.md
```

---

## How it works

1. **Parse:** `getDMMF` turns the schema text into a list of models, fields, types, relations and enums.
2. **Normalize:** `parser.js` works out the id field, which fields can be written, filtered and sorted, and which are sensitive.
3. **Generate:** templates turn each model into a route, controller, service and validator file, plus the shared files.
4. **Save:** the files are stored in MySQL as a new version and written to disk with streams.
5. **Diff:** each file's SHA-256 hash is compared with the previous version to find what changed.
6. **Preview:** the generated code is loaded into the running server with an in-memory Prisma replacement, seeded with fake data and mounted at `/preview/:token`. It shuts down after 15 minutes.
7. **Download:** `archiver` zips the folder and pipes it straight into the response.

---

## Author

**Shourya Singh** — B.Tech CSE (AI), Rishihood University / Newton School of Technology

## Deploying to Vercel

1. Import the GitHub repo in Vercel.
2. In Settings → Environment Variables add:
   - `DATABASE_URL` – your MySQL / TiDB connection string (SSL is added automatically for TiDB)
   - `JWT_SECRET` – any long random string
3. Deploy. The build creates the database tables automatically (`npm run vercel-build`).
