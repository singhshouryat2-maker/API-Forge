// Creates the database tables (used by Vercel on every deploy)
const { execSync } = require('child_process');
const dbUrl = require('../src/lib/dbUrl');

process.env.DATABASE_URL = dbUrl();
execSync('npx prisma db push --skip-generate', { stdio: 'inherit' });
