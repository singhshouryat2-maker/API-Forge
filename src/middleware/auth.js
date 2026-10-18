const jwt = require('jsonwebtoken');
const config = require('../config');
const { HttpError } = require('../utils/http');

/** Requires a valid "Authorization: Bearer <jwt>" header; sets req.user = { id, email }. */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return next(new HttpError(401, 'Please log in'));
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch (err) {
    next(new HttpError(401, err.name === 'TokenExpiredError' ? 'Session expired, please log in again' : 'Invalid token'));
  }
}

module.exports = { requireAuth };
