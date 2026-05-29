const PaymentProvider = require('./paymentProvider');
const logger = require('../utils/logger');
const crypto = require('crypto');

/**
 * A mock adapter that simulates Stripe-like behavior, 
 * fulfilling the PaymentProvider abstraction.
 */
class MockStripeAdapter extends PaymentProvider {
    constructor() {
        super();
        this.secretKey = process.env.MOCK_STRIPE_SECRET_KEY || 'sk_test_mock';
        this.webhookSecret = process.env.MOCK_STRIPE_WEBHOOK_SECRET || 'whsec_mock';
    }

    async createCustomer(user) {
        logger.info(`[MockStripe] Creating customer for user ${user.id}`);
        return `cus_mock_${crypto.randomBytes(8).toString('hex')}`;
    }

    async createCheckoutSession({ customerId, priceId, successUrl, cancelUrl, userId, planId, tenantId }) {
        logger.info(`[MockStripe] Creating checkout session for customer ${customerId}, price ${priceId}`);
        const sessionId = `cs_test_${crypto.randomBytes(8).toString('hex')}`;
        return {
            sessionId,
            url: `https://mock-provider.com/checkout/${sessionId}?userId=${userId}&planId=${planId}&tenantId=${tenantId}`,
        };
    }

    async cancelSubscription(subscriptionId) {
        logger.info(`[MockStripe] Canceling subscription ${subscriptionId}`);
        return {
            id: subscriptionId,
            status: 'canceled',
            cancel_at_period_end: false,
        };
    }

    async updateSubscription(subscriptionId, newPriceId) {
        logger.info(`[MockStripe] Updating subscription ${subscriptionId} to price ${newPriceId}`);
        return {
            id: subscriptionId,
            status: 'active',
            items: { data: [{ price: { id: newPriceId } }] },
        };
    }

    async getSubscription(subscriptionId) {
        logger.info(`[MockStripe] Getting subscription details for ${subscriptionId}`);
        return {
            id: subscriptionId,
            status: 'active',
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000),
            cancel_at_period_end: false,
        };
    }

    verifyWebhook(payload, signature) {
        logger.info('[MockStripe] Verifying webhook payload');
        try {
            if (!signature) {
                throw new Error('No signature provided in webhook header');
            }
            // Simple validation: signature must match process.env.MOCK_STRIPE_WEBHOOK_SECRET or 'whsec_mock'
            if (signature !== this.webhookSecret) {
                throw new Error('Invalid signature provided in webhook header');
            }
            const event = JSON.parse(payload.toString());
            return event;
        } catch (err) {
            throw new Error(`Webhook Error: ${err.message}`);
        }
    }
}

module.exports = new MockStripeAdapter();
