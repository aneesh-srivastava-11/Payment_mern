const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const pinoHttp = require('pino-http');
const logger = require('./utils/logger');
const billingRoutes = require('./routes/billingRoutes');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

// Security and CORS
app.use(helmet());
app.use(cors());

// Webhooks typically need the raw body, so we will use a special route or middleware.
app.use(
    '/billing/webhook',
    express.raw({ type: 'application/json' }),
    billingRoutes.webhookRouter
);

// Standard JSON parsing for other routes
app.use(express.json());

// Request logging
app.use(pinoHttp({ logger }));

// API Routes
app.use('/billing', billingRoutes.apiRouter);

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK' });
});

// Global Error Handler
app.use(errorHandler);

module.exports = app;
