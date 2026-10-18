const config = require('../config');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.statusCode || 500;
  let message = err.message || 'Internal server error';

  if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Request body too large';
  } else if (err.code === 'P2002') {
    status = 409;
    message = 'Already exists';
  } else if (err.code === 'P2025') {
    status = 404;
    message = 'Not found';
  }

  if (status >= 500) {
    console.error(err);
    if (config.env !== 'development') message = 'Internal server error';
  }

  const body = { success: false, error: { message } };
  if (err.details) body.error.details = err.details;
  res.status(status).json(body);
}

function notFound(req, res) {
  res.status(404).json({ success: false, error: { message: `Route ${req.method} ${req.originalUrl} not found` } });
}

module.exports = { errorHandler, notFound };
