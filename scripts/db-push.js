// Creates the database tables (used by Vercel on every deploy).
// If it fails, the deploy still goes live so the site can show the real error.
const { execSync } = require('child_process');
const dbUrl = require('../src/lib/dbUrl');

process.env.DATABASE_URL = dbUrl();
try {
  execSync('npx prisma db push --skip-generate', { stdio: 'inherit' });
} catch (err) {
  console.error('prisma db push failed - check DATABASE_URL');
}
