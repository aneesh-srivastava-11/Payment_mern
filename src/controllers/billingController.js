const billingService = require('../services/billingService');
const paymentProvider = require('../providers/mockStripeAdapter'); // Needed for webhook verification
const logger = require('../utils/logger');

class BillingController {
    async getSubscription(req, res, next) {
        try {
            const { userId } = req.params;
            const status = await billingService.getSubscriptionStatus(userId);
            res.json({ success: true, data: status });
        } catch (err) {
            next(err);
        }
    }

    async createSession(req, res, next) {
        try {
            const { userId, planId, successUrl, cancelUrl } = req.body;
            const session = await billingService.createCheckoutSession(userId, planId, successUrl, cancelUrl);
            res.json({ success: true, data: session });
        } catch (err) {
            next(err);
        }
    }

    async cancelSubscription(req, res, next) {
        try {
            const { userId } = req.body;
            const updated = await billingService.cancelSubscription(userId);
            res.json({ success: true, data: updated });
        } catch (err) {
            next(err);
        }
    }

    async updateSubscription(req, res, next) {
        try {
            const { userId, newPlanId } = req.body;
            const updated = await billingService.updateSubscription(userId, newPlanId);
            res.json({ success: true, data: updated });
        } catch (err) {
            next(err);
        }
    }

    async handleWebhook(req, res, next) {
        try {
            // req.body is raw Buffer here because of express.raw
            const signature = req.headers['stripe-signature'] || req.headers['x-provider-signature'];

            const event = paymentProvider.verifyWebhook(req.body, signature);

            // Process idempotently in the background or await it
            await billingService.handleWebhook(event);

            res.status(200).json({ received: true });
        } catch (err) {
            logger.error(`Webhook error: ${err.message}`);
            res.status(400).send(`Webhook Error: ${err.message}`);
        }
    }
}

module.exports = new BillingController();
