const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const config = require('../config');
const { HttpError } = require('../utils/http');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, createdAt: u.createdAt });
const signToken = (u) => jwt.sign({ sub: u.id, email: u.email }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

async function register({ name, email, password }) {
  const errors = [];
  if (!name || typeof name !== 'string' || !name.trim()) errors.push({ field: 'name', message: 'Name is required' });
  if (!email || !EMAIL_RE.test(email)) errors.push({ field: 'email', message: 'A valid email is required' });
  if (!password || typeof password !== 'string' || password.length < 8) {
    errors.push({ field: 'password', message: 'Password must be at least 8 characters' });
  }
  if (errors.length) throw new HttpError(422, 'Validation failed', errors);
  const normalized = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalized } });
  if (existing) throw new HttpError(409, 'An account with this email already exists');

  const user = await prisma.user.create({
    data: { name: name.trim(), email: normalized, passwordHash: await bcrypt.hash(password, 10) },
  });
  return { user: publicUser(user), token: signToken(user) };
}
// making documentation 
async function login({ email, password }) {
  if (!email || !password) throw new HttpError(400, 'Email and password are required');
  const user = await prisma.user.findUnique({ where: { email: String(email).trim().toLowerCase() } });
  if (!user || !(await bcrypt.compare(String(password), user.passwordHash))) {
    throw new HttpError(401, 'Invalid email or password');
  }
  return { user: publicUser(user), token: signToken(user) };
}

async function me(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(401, 'Account no longer exists');
  return publicUser(user);
}

module.exports = { register, login, me };
