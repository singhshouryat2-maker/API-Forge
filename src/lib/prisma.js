const { PrismaClient } = require('@prisma/client');
const dbUrl = require('./dbUrl');

const prisma = new PrismaClient({ datasourceUrl: dbUrl() });

module.exports = prisma;
