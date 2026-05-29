const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const pinoHttp = require('pino-http');
const logger = require('./utils/logger');
const billingRoutes = require('./routes/billingRoutes');
const errorHandler = require('./middlewares/errorHandler');
const requestIdMiddleware = require('./middlewares/requestId');
const prisma = require('./utils/prisma');

const app = express();

// Security and CORS
app.use(helmet());
app.use(cors());

// Trace Correlation ID on all requests
app.use(requestIdMiddleware);

// Webhooks typically need the raw body, so we will use a special route or middleware.
app.use(
    '/billing/webhook',
    express.raw({ type: 'application/json' }),
    billingRoutes.webhookRouter
);

// Standard JSON parsing for other routes
app.use(express.json());

// Request logging with correlation IDs
app.use(pinoHttp({ 
    logger,
    genReqId: (req) => req.requestId,
    customSuccessMessage: (req, res) => `request completed: ${req.method} ${req.url}`,
    customErrorMessage: (req, res, err) => `request failed: ${req.method} ${req.url} - ${err.message}`
}));

// API Routes
app.use('/billing', billingRoutes.apiRouter);

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK',
        uptime: process.uptime(),
        timestamp: new Date()
    });
});

// Readiness check (Validates DB and configuration status)
app.get('/ready', async (req, res) => {
    try {
        // Query check to database
        await prisma.$queryRaw`SELECT 1`;

        // Check configured providers
        const stripeOk = !!process.env.STRIPE_SECRET_KEY;
        const razorpayOk = !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
        const providerStatus = (stripeOk || razorpayOk) ? 'configured' : 'fallback-mock';

        res.status(200).json({
            status: "ready",
            database: "connected",
            provider: providerStatus
        });
    } catch (err) {
        logger.error(err, 'Readiness check failed');
        res.status(503).json({
            status: "unavailable",
            database: "disconnected",
            reason: err.message
        });
    }
});

// Global Error Handler
app.use(errorHandler);

module.exports = app;
