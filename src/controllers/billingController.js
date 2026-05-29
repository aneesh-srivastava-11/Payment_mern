const billingService = require('../services/billingService');
const paymentProviderFactory = require('../providers/paymentProviderFactory');
const logger = require('../utils/logger');

class BillingController {
    // 1. Subscription Lifecycle
    async getSubscription(req, res, next) {
        try {
            const { userId } = req.params;
            if (!userId) {
                return res.status(400).json({ success: false, error: 'userId is required' });
            }
            const status = await billingService.getSubscriptionStatus(userId);
            res.json({ success: true, data: status });
        } catch (err) {
            next(err);
        }
    }

    async createSession(req, res, next) {
        try {
            const { userId, planId, successUrl, cancelUrl, provider } = req.body;
            if (!userId || !planId || !successUrl || !cancelUrl) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'userId, planId, successUrl, and cancelUrl are required' 
                });
            }
            const session = await billingService.createCheckoutSession(
                userId, 
                planId, 
                successUrl, 
                cancelUrl, 
                provider || process.env.DEFAULT_PAYMENT_PROVIDER || 'mock'
            );
            res.json({ success: true, data: session });
        } catch (err) {
            next(err);
        }
    }

    async cancelSubscription(req, res, next) {
        try {
            const { userId, provider } = req.body;
            if (!userId) {
                return res.status(400).json({ success: false, error: 'userId is required' });
            }
            const updated = await billingService.cancelSubscription(
                userId, 
                provider || process.env.DEFAULT_PAYMENT_PROVIDER || 'mock'
            );
            res.json({ success: true, data: updated });
        } catch (err) {
            next(err);
        }
    }

    async updateSubscription(req, res, next) {
        try {
            const { userId, newPlanId, provider } = req.body;
            if (!userId || !newPlanId) {
                return res.status(400).json({ success: false, error: 'userId and newPlanId are required' });
            }
            const updated = await billingService.updateSubscription(
                userId, 
                newPlanId, 
                provider || process.env.DEFAULT_PAYMENT_PROVIDER || 'mock'
            );
            res.json({ success: true, data: updated });
        } catch (err) {
            next(err);
        }
    }

    // 2. Webhooks
    async handleWebhook(req, res, next) {
        const providerName = req.query.provider || req.headers['x-provider'] || 'mock';
        try {
            // Validate signature depending on chosen provider
            let signature;
            if (providerName === 'stripe') {
                signature = req.headers['stripe-signature'];
            } else if (providerName === 'razorpay') {
                signature = req.headers['x-razorpay-signature'];
            } else {
                signature = req.headers['x-provider-signature'] || 'whsec_mock';
            }

            if (!signature) {
                logger.warn({ providerName }, 'Webhook signature missing from headers');
                return res.status(400).send('Webhook Error: Signature verification failed (missing signature)');
            }

            const provider = paymentProviderFactory.getProvider(providerName);
            // Verify payload signature
            const event = provider.verifyWebhook(req.body, signature);

            // Process verified event
            await billingService.handleWebhook(event, providerName);

            res.status(200).json({ received: true });
        } catch (err) {
            logger.error({ error: err.message, providerName }, 'Webhook signature verification failed or processing failed');
            res.status(400).send(`Webhook Error: ${err.message}`);
        }
    }

    // 3. Invoices
    async getInvoices(req, res, next) {
        try {
            const tenantId = req.query.tenantId || req.headers['x-tenant-id'];
            if (!tenantId) {
                return res.status(400).json({ success: false, error: 'tenantId is required as a query parameter or header' });
            }
            const page = parseInt(req.query.page || '1', 10);
            const limit = parseInt(req.query.limit || '10', 10);
            
            const result = await billingService.getInvoices(tenantId, { page, limit });
            res.json({ success: true, data: result });
        } catch (err) {
            next(err);
        }
    }

    async getInvoiceById(req, res, next) {
        try {
            const { id } = req.params;
            const invoice = await billingService.getInvoiceById(id);
            res.json({ success: true, data: invoice });
        } catch (err) {
            next(err);
        }
    }

    // 4. Usage Metering
    async recordUsage(req, res, next) {
        try {
            const { tenantId, action, usage } = req.body;
            if (!tenantId || !action || usage === undefined) {
                return res.status(400).json({ success: false, error: 'tenantId, action, and usage are required' });
            }
            const record = await billingService.recordUsage(tenantId, action, usage);
            res.json({ success: true, data: record });
        } catch (err) {
            next(err);
        }
    }

    async getUsage(req, res, next) {
        try {
            const tenantId = req.query.tenantId || req.headers['x-tenant-id'];
            if (!tenantId) {
                return res.status(400).json({ success: false, error: 'tenantId is required as a query parameter or header' });
            }
            const page = parseInt(req.query.page || '1', 10);
            const limit = parseInt(req.query.limit || '10', 10);

            const usage = await billingService.getUsage(tenantId, { page, limit });
            res.json({ success: true, data: usage });
        } catch (err) {
            next(err);
        }
    }

    // 5. Admin Dashboard Endpoints
    async getAdminSubscriptions(req, res, next) {
        try {
            const page = parseInt(req.query.page || '1', 10);
            const limit = parseInt(req.query.limit || '10', 10);
            const result = await billingService.getAdminSubscriptions({ page, limit });
            res.json({ success: true, data: result });
        } catch (err) {
            next(err);
        }
    }

    async getAdminEvents(req, res, next) {
        try {
            const page = parseInt(req.query.page || '1', 10);
            const limit = parseInt(req.query.limit || '10', 10);
            const result = await billingService.getAdminEvents({ page, limit });
            res.json({ success: true, data: result });
        } catch (err) {
            next(err);
        }
    }

    async getAdminInvoices(req, res, next) {
        try {
            const page = parseInt(req.query.page || '1', 10);
            const limit = parseInt(req.query.limit || '10', 10);
            const result = await billingService.getAdminInvoices({ page, limit });
            res.json({ success: true, data: result });
        } catch (err) {
            next(err);
        }
    }

    async getAdminTenantBilling(req, res, next) {
        try {
            const { id } = req.params;
            const page = parseInt(req.query.page || '1', 10);
            const limit = parseInt(req.query.limit || '10', 10);
            const result = await billingService.getAdminTenantBilling(id, { page, limit });
            res.json({ success: true, data: result });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new BillingController();
