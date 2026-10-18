require('dotenv').config();
const path = require('path');

const required = ['DATABASE_URL', 'JWT_SECRET'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing ${key} in .env (see .env.example)`);
    process.exit(1);
  }
}

module.exports = {
  port: parseInt(process.env.PORT, 10) || 4000,
  env: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  previewTtlMinutes: parseInt(process.env.PREVIEW_TTL_MINUTES, 10) || 15,
  storageDir: path.join(__dirname, '..', 'storage'),
  publicDir: path.join(__dirname, '..', 'public'),
};
