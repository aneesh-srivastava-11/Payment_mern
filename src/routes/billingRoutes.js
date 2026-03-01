const express = require('express');
const billingController = require('../controllers/billingController');

const apiRouter = express.Router();
const webhookRouter = express.Router();

// Webhook endpoint (Requires raw body)
webhookRouter.post('/', billingController.handleWebhook);

// Protected API routes
apiRouter.get('/subscription/:userId', billingController.getSubscription);
apiRouter.post('/create-session', billingController.createSession);
apiRouter.post('/cancel', billingController.cancelSubscription);
apiRouter.post('/update', billingController.updateSubscription); // Upgrade/Downgrade

module.exports = {
    apiRouter,
    webhookRouter
};
