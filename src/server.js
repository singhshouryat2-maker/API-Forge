const app = require('./app');
const config = require('./config');
const prisma = require('./lib/prisma');
const preview = require('./preview/previewManager');

const server = app.listen(config.port, () => {
  console.log(`APIForge running at http://localhost:${config.port}`);
});

async function shutdown() {
  server.close();
  await preview.stopAll().catch(() => {});
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
