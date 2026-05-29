const express = require('express');
const billingController = require('../controllers/billingController');

const apiRouter = express.Router();
const webhookRouter = express.Router();

// Webhook endpoint (Requires raw body)
webhookRouter.post('/', billingController.handleWebhook);

// Protected/Public API routes
apiRouter.get('/subscription/:userId', billingController.getSubscription);
apiRouter.post('/create-session', billingController.createSession);
apiRouter.post('/cancel', billingController.cancelSubscription);
apiRouter.post('/update', billingController.updateSubscription); // Upgrade/Downgrade

// Invoices
apiRouter.get('/invoices', billingController.getInvoices);
apiRouter.get('/invoices/:id', billingController.getInvoiceById);

// Usage tracking
apiRouter.post('/usage', billingController.recordUsage);
apiRouter.get('/usage', billingController.getUsage);

// Admin dashboard routes (usually role-protected)
apiRouter.get('/admin/subscriptions', billingController.getAdminSubscriptions);
apiRouter.get('/admin/events', billingController.getAdminEvents);
apiRouter.get('/admin/invoices', billingController.getAdminInvoices);
apiRouter.get('/admin/tenants/:id', billingController.getAdminTenantBilling);

module.exports = {
    apiRouter,
    webhookRouter
};
