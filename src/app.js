const express = require('express');
const config = require('./config');
const apiRoutes = require('./routes');
const { previewHandler } = require('./preview/previewManager');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const app = express();
app.disable('x-powered-by');

// Live previews are mounted BEFORE the JSON parser: the generated app parses its own bodies.
app.use('/preview/:token', previewHandler);

app.use(express.json({ limit: '1mb' }));
app.use('/api', apiRoutes);

// Static web UI
app.use(express.static(config.publicDir));
app.get(/^\/(?!api\/|preview\/).*/, (req, res) => res.sendFile('index.html', { root: config.publicDir }));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
